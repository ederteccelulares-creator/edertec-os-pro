import { supabase } from './supabase'

/**
 * Acesso inicial ao schema BR baseado em company_id.
 * Mantém este adaptador separado do legado organization_id até a migração
 * dos módulos estar concluída e testada.
 */

function db() {
  if (!supabase) throw new Error('Supabase não está configurado.')
  return supabase
}

export type CompanyRole = 'owner' | 'admin' | 'manager' | 'attendant' | 'technician'

export type Company = {
  id: string
  name: string
  legal_name: string | null
  tax_id: string | null
  email: string | null
  phone: string | null
  status: string
}

export type CompanyMembership = {
  company_id: string
  role: CompanyRole
  companies: Company | Company[] | null
}

export type CompanyBranch = {
  id: string
  company_id: string
  name: string
  phone: string | null
  email: string | null
  address: Record<string, unknown>
  is_active: boolean
}

export type CompanyCustomer = {
  id: string
  company_id: string
  branch_id: string | null
  name: string
  phone: string | null
  email: string | null
  document: string | null
  address: Record<string, unknown>
  notes: string | null
  created_at: string
  updated_at: string
}

export async function registerCompany(input: {
  name: string
  taxId?: string
  phone?: string
}) {
  const name = input.name.trim()
  if (name.length < 2) throw new Error('O nome da assistência deve ter pelo menos 2 caracteres.')

  const { data, error } = await db().rpc('register_company', {
    company_name: name,
    company_tax_id: input.taxId?.trim() || null,
    main_phone: input.phone?.trim() || null,
  })
  if (error) throw error
  if (typeof data !== 'string') throw new Error('O banco não retornou o identificador da assistência.')
  return data
}

export async function listMyCompanies(): Promise<CompanyMembership[]> {
  const api = db()
  const { data: auth, error: authError } = await api.auth.getUser()
  if (authError) throw authError
  if (!auth.user) return []

  const { data, error } = await api
    .from('company_members')
    .select('company_id, role, companies(id,name,legal_name,tax_id,email,phone,status)')
    .eq('user_id', auth.user.id)
  if (error) throw error
  return (data ?? []) as unknown as CompanyMembership[]
}

export async function listCompanyBranches(companyId: string): Promise<CompanyBranch[]> {
  const { data, error } = await db()
    .from('branches')
    .select('id,company_id,name,phone,email,address,is_active')
    .eq('company_id', companyId)
    .eq('is_active', true)
    .order('name')
  if (error) throw error
  return (data ?? []) as CompanyBranch[]
}

export async function listCompanyCustomers(companyId: string): Promise<CompanyCustomer[]> {
  const { data, error } = await db()
    .from('customers')
    .select('id,company_id,branch_id,name,phone,email,document,address,notes,created_at,updated_at')
    .eq('company_id', companyId)
    .order('name')
    .limit(500)
  if (error) throw error
  return (data ?? []) as CompanyCustomer[]
}

export async function saveCompanyCustomer(input: {
  companyId: string
  branchId?: string | null
  name: string
  phone?: string
  email?: string
  document?: string
  notes?: string
}) {
  const name = input.name.trim()
  if (!name) throw new Error('Informe o nome do cliente.')

  const payload = {
    company_id: input.companyId,
    branch_id: input.branchId || null,
    name,
    phone: input.phone?.trim() || null,
    email: input.email?.trim() || null,
    document: input.document?.trim() || null,
    notes: input.notes?.trim() || null,
  }
  const { data, error } = await db()
    .from('customers')
    .insert(payload)
    .select('id,company_id,branch_id,name,phone,email,document,address,notes,created_at,updated_at')
    .single()
  if (error) throw error
  return data as CompanyCustomer
}

export async function updateCompanyProfile(input: {
  companyId: string
  name: string
  legalName?: string
  taxId?: string
  email?: string
  phone?: string
}) {
  const name = input.name.trim()
  if (name.length < 2) throw new Error('Informe o nome da assistência.')
  const { data, error } = await db()
    .from('companies')
    .update({
      name,
      legal_name: input.legalName?.trim() || null,
      tax_id: input.taxId?.trim() || null,
      email: input.email?.trim() || null,
      phone: input.phone?.trim() || null,
    })
    .eq('id', input.companyId)
    .select('id,name,legal_name,tax_id,email,phone,status')
    .single()
  if (error) throw error
  return data as Company
}
