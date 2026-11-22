import { supabase } from './supabase'

export async function downloadCompanyBackup(companyId: string): Promise<void> {
  if (!supabase) throw new Error('Supabase não está configurado.')

  const { data, error } = await supabase.rpc('export_company_backup', {
    p_company_id: companyId,
  })
  if (error) throw error
  if (!data || typeof data !== 'object') {
    throw new Error('O servidor não retornou um backup válido.')
  }

  const payload = JSON.stringify(data, null, 2)
  const blob = new Blob([payload], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  const date = new Date().toISOString().slice(0, 10)
  anchor.href = url
  anchor.download = `edertec-os-pro-backup-${date}.json`
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

export async function restoreCompanyBackup(companyId: string, file: File): Promise<void> {
  if (!supabase) throw new Error('Supabase não está configurado.')
  if (file.size > 10 * 1024 * 1024) throw new Error('O arquivo ultrapassa o limite de 10 MB.')

  let backup: unknown
  try {
    backup = JSON.parse(await file.text())
  } catch {
    throw new Error('O arquivo selecionado não contém um JSON válido.')
  }

  const value = backup as { format?: string; version?: number; company?: { id?: string } }
  if (value?.format !== 'edertec-os-pro-company-backup' || value?.version !== 1) {
    throw new Error('Este arquivo não é um backup compatível do Edertec OS Pro.')
  }
  if (value.company?.id !== companyId) {
    throw new Error('O backup pertence a outra empresa. A restauração foi bloqueada.')
  }

  const { error } = await supabase.functions.invoke('restore-company-backup', {
    body: {
      company_id: companyId,
      idempotency_key: crypto.randomUUID(),
      backup,
    },
  })
  if (error) throw error
}
