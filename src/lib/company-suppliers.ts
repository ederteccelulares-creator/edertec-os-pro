import { supabase } from './supabase'

function db() {
  if (!supabase) throw new Error('Supabase não está configurado.')
  return supabase
}

export type CompanySupplier = {
  id:string; company_id:string; name:string; tax_id:string|null; contact_name:string|null
  phone:string|null; email:string|null; address:Record<string,unknown>; notes:string|null
  is_active:boolean; created_at:string
}

export async function listCompanySuppliers(companyId:string, search=''):Promise<CompanySupplier[]> {
  let q=db().from('suppliers').select('id,company_id,name,tax_id,contact_name,phone,email,address,notes,is_active,created_at')
    .eq('company_id',companyId).eq('is_active',true).order('name').limit(300)
  const term=search.trim().replace(/[,%()]/g,' ')
  if(term) q=q.or(`name.ilike.%${term}%,tax_id.ilike.%${term}%,phone.ilike.%${term}%`)
  const {data,error}=await q
  if(error) throw error
  return (data??[]) as CompanySupplier[]
}

export async function createCompanySupplier(input:{
  companyId:string;name:string;taxId?:string;contactName?:string;phone?:string;email?:string;notes?:string
}) {
  const name=input.name.trim()
  if(name.length<2) throw new Error('Informe o nome do fornecedor.')
  const {data,error}=await db().from('suppliers').insert({
    company_id:input.companyId,name,tax_id:input.taxId?.trim()||null,
    contact_name:input.contactName?.trim()||null,phone:input.phone?.trim()||null,
    email:input.email?.trim()||null,notes:input.notes?.trim()||null,
  }).select('id,company_id,name,tax_id,contact_name,phone,email,address,notes,is_active,created_at').single()
  if(error) throw error
  return data as CompanySupplier
}
