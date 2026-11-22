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
