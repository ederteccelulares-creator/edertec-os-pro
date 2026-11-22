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
  photo_urls?: string[]
  customers?: { id: string; name: string; phone: string | null } | null
  employees?: { id: string; name: string } | null
}

const statusToDatabase: Record<string, string> = {
  received: 'received',
  diagnosing: 'diagnosis',
  diagnosis: 'diagnosis',
  waiting_approval: 'waiting_approval',
  approved: 'approved',
  waiting_parts: 'waiting_parts',
  repairing: 'in_repair',
  in_repair: 'in_repair',
  ready: 'ready',
  delivered: 'delivered',
  cancelled: 'cancelled',
  rejected: 'rejected',
}

function toDatabaseStatus(status: string) {
  const normalized = statusToDatabase[status]
  if (!normalized) throw new Error('Status de ordem de serviço inválido.')
  return normalized
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
      customers!service_orders_customer_id_fkey(id,name,phone),
      employees!service_orders_assigned_employee_id_fkey(id,name)
    `)
    .eq('company_id', filters.companyId)
    .order('received_at', { ascending: false })
    .limit(Math.min(Math.max(filters.limit ?? 100, 1), 500))

  if (filters.branchId) query = query.eq('branch_id', filters.branchId)
  if (filters.status) query = query.eq('status', toDatabaseStatus(filters.status))

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
  const orders = (data ?? []) as unknown as CompanyServiceOrder[]
  return Promise.all(orders.map(async order => {
    const folder = `${order.company_id}/${order.id}`
    const { data: files, error: listError } = await db().storage.from('service-order-photos').list(folder, { limit: 30, sortBy: { column: 'created_at', order: 'asc' } })
    if (listError || !files?.length) return { ...order, photo_urls: [] }
    const paths = files.filter(file => file.name && !file.name.startsWith('.')).map(file => `${folder}/${file.name}`)
    const { data: signed } = await db().storage.from('service-order-photos').createSignedUrls(paths, 3600)
    return { ...order, photo_urls: (signed || []).map(item => item.signedUrl).filter((url): url is string => Boolean(url)) }
  }))
}

/**
 * Atualiza apenas status e carimbo de atualização.
 * A política RLS da tabela continua sendo a autoridade final de acesso.
 */
export async function updateCompanyServiceOrderStatus(
  input: { companyId: string; orderId: string; status: string },
) {
  const databaseStatus = toDatabaseStatus(input.status)

  const { data, error } = await db()
    .from('service_orders')
    .update({ status: databaseStatus, updated_at: new Date().toISOString() })
    .eq('company_id', input.companyId)
    .eq('id', input.orderId)
    .select('id,status,updated_at')
    .single()

  if (error) throw error
  return data
}


export type CreateCompanyServiceOrderInput = {
  companyId: string
  branchId?: string | null
  customerId?: string | null
  assignedEmployeeId?: string | null
  deviceType?: string
  deviceBrand?: string
  deviceModel?: string
  deviceColor?: string
  serialNumber?: string
  reportedIssue: string
  intakeCondition?: string
  includedAccessories?: string
  priority?: 'low' | 'normal' | 'high' | 'urgent'
  estimatedPrice?: number
  promisedAt?: string | null
  notes?: string
  photos?: File[]
}

/**
 * Insere uma OS usando o DEFAULT do banco para order_number.
 * A coluna order_number já é IDENTITY BY DEFAULT no banco BR.
 */
export async function createCompanyServiceOrder(input: CreateCompanyServiceOrderInput) {
  const reportedIssue = input.reportedIssue.trim()
  if (!reportedIssue) throw new Error('Descreva o defeito informado pelo cliente.')
  const estimatedPrice = Math.max(0, Number(input.estimatedPrice ?? 0))
  if (!Number.isFinite(estimatedPrice)) throw new Error('Valor estimado inválido.')

  const payload = {
    company_id: input.companyId,
    branch_id: input.branchId || null,
    customer_id: input.customerId || null,
    assigned_employee_id: input.assignedEmployeeId || null,
    device_type: input.deviceType?.trim() || null,
    device_brand: input.deviceBrand?.trim() || null,
    device_model: input.deviceModel?.trim() || null,
    device_color: input.deviceColor?.trim() || null,
    serial_number: input.serialNumber?.trim() || null,
    reported_issue: reportedIssue,
    intake_condition: input.intakeCondition?.trim() || null,
    included_accessories: input.includedAccessories?.trim() || null,
    priority: input.priority ?? 'normal',
    estimated_price: estimatedPrice,
    promised_at: input.promisedAt || null,
    notes: input.notes?.trim() || null,
  }

  const { data, error } = await db()
    .from('service_orders')
    .insert(payload)
    .select('*')
    .single()

  if (error) throw error
  const created = data as CompanyServiceOrder
  const photos = input.photos || []
  if (photos.length) {
    const bucket = db().storage.from('service-order-photos')
    const uploaded: string[] = []
    try {
      for (const file of photos) {
        if (!['image/jpeg','image/png','image/webp'].includes(file.type)) throw new Error('As fotos devem estar em JPG, PNG ou WebP.')
        if (file.size > 8 * 1024 * 1024) throw new Error('Cada foto pode ter no máximo 8 MB.')
        const extension = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
        const path = `${input.companyId}/${created.id}/${crypto.randomUUID()}.${extension}`
        const { error: uploadError } = await bucket.upload(path, file, { contentType: file.type, cacheControl: '3600' })
        if (uploadError) throw uploadError
        uploaded.push(path)
      }
    } catch (uploadError) {
      if (uploaded.length) await bucket.remove(uploaded)
      throw new Error(`A OS #${created.order_number} foi criada, mas houve falha ao anexar as fotos: ${uploadError instanceof Error ? uploadError.message : 'erro no envio'}`)
    }
  }
  return created
}

export async function createCompanyServiceOrderTrackingLink(input:{companyId:string;orderId:string}) {
  const { data, error } = await db().rpc('create_company_service_order_tracking_link', {
    p_company_id: input.companyId,
    p_order_id: input.orderId,
  })
  if (error) throw error
  if (typeof data !== 'string' || data.length !== 64) throw new Error('Não foi possível gerar o link de acompanhamento.')
  return new URL(`?acompanhar=${data}`, window.location.origin + window.location.pathname).toString()
}


export type UpdateCompanyServiceOrderInput = {
  companyId:string; orderId:string; customerId?:string|null; deviceType?:string;
  deviceBrand?:string; deviceModel?:string; deviceColor?:string; serialNumber?:string;
  reportedIssue:string; intakeCondition?:string; includedAccessories?:string;
  priority?:'low'|'normal'|'high'|'urgent'; estimatedPrice?:number; finalPrice?:number;
  diagnosis?:string|null; promisedAt?:string|null;
}

export async function updateCompanyServiceOrder(input:UpdateCompanyServiceOrderInput) {
  const reportedIssue=input.reportedIssue.trim()
  if(!reportedIssue) throw new Error('Descreva o defeito informado pelo cliente.')
  const estimatedPrice=Math.max(0,Number(input.estimatedPrice??0))
  const finalPrice=Math.max(0,Number(input.finalPrice??0))
  if(!Number.isFinite(estimatedPrice)||!Number.isFinite(finalPrice)) throw new Error('Valor inválido.')
  const {data,error}=await db().from('service_orders').update({
    customer_id:input.customerId||null,
    device_type:input.deviceType?.trim()||null,
    device_brand:input.deviceBrand?.trim()||null,
    device_model:input.deviceModel?.trim()||null,
    device_color:input.deviceColor?.trim()||null,
    serial_number:input.serialNumber?.trim()||null,
    reported_issue:reportedIssue,
    intake_condition:input.intakeCondition?.trim()||null,
    included_accessories:input.includedAccessories?.trim()||null,
    priority:input.priority||'normal',
    estimated_price:estimatedPrice,
    final_price:finalPrice,
    diagnosis:input.diagnosis?.trim()||null,
    promised_at:input.promisedAt||null,
    updated_at:new Date().toISOString(),
  }).eq('company_id',input.companyId).eq('id',input.orderId).select('id,order_number,updated_at').single()
  if(error) throw error
  return data
}
