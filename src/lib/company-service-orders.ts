import { supabase } from './supabase'

function db() {
  if (!supabase) throw new Error('Supabase não está configurado.')
  return supabase
}

export type CompanyServiceOrder = {
  id: string
  company_id: string
  branch_id: string | null
  customer_id: string | null
  assigned_employee_id: string | null
  order_number: number
  device_type: string | null
  device_brand: string | null
  device_model: string | null
  device_color: string | null
  serial_number: string | null
  reported_issue: string
  intake_condition: string | null
  included_accessories: string | null
  diagnosis: string | null
  status: string
  priority: string
  estimated_price: number
  final_price: number
  received_at: string
  promised_at: string | null
  delivered_at: string | null
  notes: string | null
  created_at: string
  updated_at: string
  customers?: { id: string; name: string; phone: string | null } | null
  employees?: { id: string; name: string } | null
}

export type ServiceOrderListFilters = {
  companyId: string
  branchId?: string | null
  status?: string | null
  search?: string
  limit?: number
}

/**
 * Consulta ordens diretamente no schema BR.
 * Os dados do aparelho pertencem à própria OS; não existe dependência
 * de uma tabela devices neste modelo.
 */
export async function listCompanyServiceOrders(
  filters: ServiceOrderListFilters,
): Promise<CompanyServiceOrder[]> {
  let query = db()
    .from('service_orders')
    .select(`
      id,company_id,branch_id,customer_id,assigned_employee_id,order_number,
      device_type,device_brand,device_model,device_color,serial_number,
      reported_issue,intake_condition,included_accessories,diagnosis,status,
      priority,estimated_price,final_price,received_at,promised_at,delivered_at,
      notes,created_at,updated_at,
      customers(id,name,phone),
      employees(id,name)
    `)
    .eq('company_id', filters.companyId)
    .order('received_at', { ascending: false })
    .limit(Math.min(Math.max(filters.limit ?? 100, 1), 500))

  if (filters.branchId) query = query.eq('branch_id', filters.branchId)
  if (filters.status) query = query.eq('status', filters.status)

  const search = filters.search?.trim()
  if (search) {
    const safe = search.replace(/[,%()]/g, ' ').trim()
    if (safe) {
      query = query.or(
        `reported_issue.ilike.%${safe}%,device_brand.ilike.%${safe}%,device_model.ilike.%${safe}%,serial_number.ilike.%${safe}%`
      )
    }
  }

  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as unknown as CompanyServiceOrder[]
}

/**
 * Atualiza apenas status e carimbo de atualização.
 * A política RLS da tabela continua sendo a autoridade final de acesso.
 */
export async function updateCompanyServiceOrderStatus(
  input: { companyId: string; orderId: string; status: string },
) {
  const allowed = new Set([
    'received',
    'diagnosing',
    'waiting_approval',
    'waiting_parts',
    'repairing',
    'ready',
    'delivered',
    'cancelled',
  ])
  if (!allowed.has(input.status)) throw new Error('Status de ordem de serviço inválido.')

  const { data, error } = await db()
    .from('service_orders')
    .update({ status: input.status, updated_at: new Date().toISOString() })
    .eq('company_id', input.companyId)
    .eq('id', input.orderId)
    .select('id,status,updated_at')
    .single()

  if (error) throw error
  return data
}

/**
 * Criação de OS está intencionalmente pendente de uma rotina atômica
 * para gerar order_number. Não gerar o número com MAX()+1 no navegador,
 * pois acessos simultâneos podem produzir números duplicados.
 */
