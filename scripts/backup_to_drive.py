#!/usr/bin/env python3
"""Create an encrypted full Supabase backup and upload it to Google Drive."""
import json, os, pathlib, subprocess, shutil
from datetime import datetime, timezone
import requests
from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload

ROOT = pathlib.Path("backup-work")
ROOT.mkdir(exist_ok=True)
stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
work = ROOT / stamp
work.mkdir()
db_url = os.environ["SUPABASE_DB_URL"]
supabase_url = os.environ["SUPABASE_URL"].rstrip("/")
service_key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
folder_id = os.environ["GOOGLE_DRIVE_FOLDER_ID"]
passphrase = os.environ["BACKUP_ENCRYPTION_PASSPHRASE"]
headers = {"Authorization": f"Bearer {service_key}", "apikey": service_key}

# Include the complete application source and Supabase migrations/functions.
source_dir = work / "source"
shutil.copytree(".", source_dir, ignore=shutil.ignore_patterns(".git", "node_modules", "dist", "backup-work", ".env", ".env.*"))
# Full logical PostgreSQL dump (schema, data, functions, policies, grants).
dump_path = work / "database.dump"
subprocess.run(["pg_dump", "--format=custom", "--no-owner", "--no-acl", db_url, "-f", str(dump_path)], check=True)

# Export every Storage bucket and object, including private buckets.
storage_dir = work / "storage"
storage_dir.mkdir()
buckets = requests.get(f"{supabase_url}/storage/v1/bucket", headers=headers, timeout=60)
buckets.raise_for_status()
manifest = {"created_at": stamp, "buckets": []}
for bucket in buckets.json():
    bucket_name = bucket["name"]
    bucket_dir = storage_dir / bucket_name
    bucket_dir.mkdir()
    manifest["buckets"].append({"name": bucket_name, "public": bucket.get("public", False), "objects": []})
    pending_prefixes = [""]
    while pending_prefixes:
        prefix = pending_prefixes.pop()
        offset = 0
        while True:
            listing = requests.post(
                f"{supabase_url}/storage/v1/object/list/{bucket_name}",
                headers={**headers, "Content-Type": "application/json"},
                json={"prefix": prefix, "limit": 100, "offset": offset, "sortBy": {"column": "name", "order": "asc"}},
                timeout=60,
            )
            listing.raise_for_status()
            items = listing.json()
            if not items:
                break
            for item in items:
                name = item.get("name")
                if not name:
                    continue
                relative_name = f"{prefix}{name}"
                if item.get("id") is None and item.get("metadata") is None:
                    pending_prefixes.append(relative_name.rstrip("/") + "/")
                    continue
                response = requests.get(
                    f"{supabase_url}/storage/v1/object/{bucket_name}/{relative_name}",
                    headers=headers, timeout=180,
                )
                response.raise_for_status()
                target = bucket_dir / relative_name
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(response.content)
                manifest["buckets"][-1]["objects"].append({"name": relative_name, "size": len(response.content)})
            offset += len(items)
            if len(items) < 100:
                break

(work / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2))
archive = ROOT / f"edertec-os-pro-{stamp}.tar.gz.gpg"
# Stream archive through GPG so the unencrypted archive is never written to disk.
tar = subprocess.Popen(["tar", "-czf", "-", "-C", str(ROOT), stamp], stdout=subprocess.PIPE)
subprocess.run(["gpg", "--batch", "--yes", "--pinentry-mode", "loopback", "--passphrase", passphrase, "--symmetric", "--cipher-algo", "AES256", "--output", str(archive)], stdin=tar.stdout, check=True)
tar.stdout.close()
if tar.wait() != 0:
    raise RuntimeError("Falha ao compactar os dados do backup")

credentials_info = json.loads(os.environ["GOOGLE_SERVICE_ACCOUNT_JSON"])
credentials = service_account.Credentials.from_service_account_info(credentials_info, scopes=["https://www.googleapis.com/auth/drive"])
drive = build("drive", "v3", credentials=credentials, cache_discovery=False)
metadata = {"name": archive.name, "parents": [folder_id], "description": f"Backup Edertec OS Pro {stamp} - criptografia AES-256"}
uploaded = drive.files().create(body=metadata, media_body=MediaFileUpload(str(archive), mimetype="application/octet-stream", resumable=True), fields="id,name,size,createdTime,webViewLink").execute()
# Retain the latest 30 backups in the configured folder.
files = drive.files().list(q=f"'{folder_id}' in parents and trashed=false and name contains 'edertec-os-pro-'", orderBy="createdTime desc", pageSize=100, fields="files(id,name,createdTime)").execute().get("files", [])
for old in files[30:]:
    drive.files().delete(fileId=old["id"]).execute()
print(json.dumps({"status": "success", "file": uploaded, "retained": min(len(files) + 1, 30)}))
