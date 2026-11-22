import { supabase } from './supabase'

export type TenantContext = {
  organizationId: string
  branchId: string
}

export type CustomerInput = {
  name: string
  phone: string
  email?: string
  document?: string
  notes?: string
}

export type DeviceInput = {
  customerId: string
  brand: string
  model: string
  color?: string
  storage?: string
  imei?: string
  serialNumber?: string
  notes?: string
}

export type ServiceOrderStatus = 'received' | 'diagnosing' | 'waiting_approval' | 'waiting_parts' | 'repairing' | 'ready' | 'delivered' | 'cancelled'

export type ServiceOrderInput = {
  customerId: string
  deviceId?: string
  reportedIssue: string
  diagnosis?: string
  accessories?: string
  physicalCondition?: string
  estimatedAmount?: number
  status?: ServiceOrderStatus
  warrantyDays?: number
  internalNotes?: string
}

function client() {
  if (!supabase) throw new Error('Supabase não está configurado.')
  return supabase
}

function required(value: string, label: string) {
  const normalized = value.trim()
  if (!normalized) throw new Error(`Informe ${label}.`)
  return normalized
}

export async function listBranches(organizationId: string) {
  const { data, error } = await client().from('branches')
    .select('id, organization_id, name, code, active')
    .eq('organization_id', organizationId)
    .eq('active', true)
    .order('name')
  if (error) throw error
  return data ?? []
}

export async function listCustomers(context: TenantContext) {
  const { data, error } = await client().from('customers')
    .select('id, organization_id, name, phone, email, document, address, notes, created_at, updated_at')
    .eq('organization_id', context.organizationId)
    .order('name')
    .limit(500)
  if (error) throw error
  return data ?? []
}

export async function saveCustomer(context: TenantContext, input: CustomerInput) {
  const payload = {
    organization_id: context.organizationId,
    name: required(input.name, 'o nome do cliente'),
    phone: required(input.phone, 'o telefone'),
    email: input.email?.trim() || null,
    document: input.document?.trim() || null,
    notes: input.notes?.trim() || null,
  }
  const { data: existing, error: lookupError } = await client().from('customers')
    .select('id')
    .eq('organization_id', context.organizationId)
    .eq('phone', payload.phone)
    .limit(1)
    .maybeSingle()
  if (lookupError) throw lookupError

  const query = existing
    ? client().from('customers').update(payload).eq('organization_id', context.organizationId).eq('id', existing.id)
    : client().from('customers').insert(payload)
  const { data, error } = await query.select().single()
  if (error) throw error
  return data
}

export async function listDevices(context: TenantContext, customerId?: string) {
  let query = client().from('devices')
    .select('id, organization_id, customer_id, brand, model, color, storage, imei, serial_number, notes, created_at')
    .eq('organization_id', context.organizationId)
  if (customerId) query = query.eq('customer_id', customerId)
  const { data, error } = await query.order('created_at', { ascending: false }).limit(500)
  if (error) throw error
  return data ?? []
}

export async function saveDevice(context: TenantContext, input: DeviceInput) {
  const payload = {
    organization_id: context.organizationId,
    customer_id: required(input.customerId, 'o cliente do aparelho'),
    brand: required(input.brand, 'a marca'),
    model: required(input.model, 'o modelo'),
    color: input.color?.trim() || null,
    storage: input.storage?.trim() || null,
    imei: input.imei?.trim() || null,
    serial_number: input.serialNumber?.trim() || null,
    notes: input.notes?.trim() || null,
  }
  const { data, error } = await client().from('devices').insert(payload).select().single()
  if (error) throw error
  return data
}

export async function listServiceOrders(context: TenantContext) {
  const { data, error } = await client().from('service_orders')
    .select('id, organization_id, branch_id, customer_id, device_id, order_number, status, reported_issue, diagnosis, accessories, physical_condition, estimated_amount, approved_amount, technician_id, opened_by, received_at, delivered_at, warranty_days, internal_notes, created_at, updated_at, customers(name, phone), devices(brand, model, imei)')
    .eq('organization_id', context.organizationId)
    .eq('branch_id', context.branchId)
    .order('created_at', { ascending: false })
    .limit(500)
  if (error) throw error
  return data ?? []
}


export async function createServiceOrderWithDevice(
  context: TenantContext,
  input: {
    customerId: string
    brand: string
    model: string
    imei?: string
    reportedIssue: string
    estimatedAmount?: number
    accessories?: string
    physicalCondition?: string
  },
) {
  const amount = input.estimatedAmount ?? 0
  if (!Number.isFinite(amount) || amount < 0) throw new Error('O valor estimado deve ser zero ou maior.')
  const { data, error } = await client().rpc('create_service_order_with_device', {
    p_organization_id: context.organizationId,
    p_branch_id: context.branchId,
    p_customer_id: required(input.customerId, 'o cliente'),
    p_brand: required(input.brand, 'a marca'),
    p_model: required(input.model, 'o modelo'),
    p_imei: input.imei?.trim() || null,
    p_reported_issue: required(input.reportedIssue, 'o defeito informado'),
    p_estimated_amount: amount,
    p_accessories: input.accessories?.trim() || null,
    p_physical_condition: input.physicalCondition?.trim() || null,
  })
  if (error) throw error
  return data
}

export async function createServiceOrder(context: TenantContext, input: ServiceOrderInput) {
  const amount = input.estimatedAmount ?? 0
  if (!Number.isFinite(amount) || amount < 0) throw new Error('O valor estimado deve ser zero ou maior.')
  const payload = {
    organization_id: context.organizationId,
    branch_id: context.branchId,
    customer_id: required(input.customerId, 'o cliente'),
    device_id: input.deviceId || null,
    reported_issue: required(input.reportedIssue, 'o defeito informado'),
    diagnosis: input.diagnosis?.trim() || null,
    accessories: input.accessories?.trim() || null,
    physical_condition: input.physicalCondition?.trim() || null,
    estimated_amount: amount,
    status: input.status || 'received',
    warranty_days: input.warrantyDays ?? 90,
    internal_notes: input.internalNotes?.trim() || null,
  }
  const { data, error } = await client().from('service_orders').insert(payload).select().single()
  if (error) throw error
  return data
}

export async function updateServiceOrderStatus(
  context: TenantContext,
  orderId: string,
  status: ServiceOrderStatus,
  description?: string,
) {
  const { data, error } = await client().rpc('update_service_order_status', {
    p_organization_id: context.organizationId,
    p_branch_id: context.branchId,
    p_order_id: orderId,
    p_status: status,
    p_description: description?.trim() || null,
  })
  if (error) throw error
  return data
}

export async function listServiceOrderEvents(context: TenantContext, orderId: string) {
  const { data, error } = await client().from('service_order_events')
    .select('id, from_status, to_status, description, changed_by, created_at')
    .eq('organization_id', context.organizationId)
    .eq('service_order_id', orderId)
    .order('created_at', { ascending: false })
    .limit(100)
  if (error) throw error
  return data ?? []
}


export type InventoryItemInput = {
  name: string
  sku?: string
  category?: string
  costPrice?: number
  salePrice?: number
  minStock?: number
}

export async function listInventory(context: TenantContext) {
  const { data, error } = await client().from('branch_inventory')
    .select('id, item_id, quantity, inventory_items(id, sku, name, category, cost_price, sale_price, min_stock, active)')
    .eq('organization_id', context.organizationId)
    .eq('branch_id', context.branchId)
    .order('updated_at', { ascending: false })
    .limit(500)
  if (error) throw error
  return data ?? []
}

export async function createInventoryItem(context: TenantContext, input: InventoryItemInput) {
  const cost = input.costPrice ?? 0
  const sale = input.salePrice ?? 0
  const minimum = input.minStock ?? 0
  if (![cost, sale, minimum].every(value => Number.isFinite(value) && value >= 0)) {
    throw new Error('Preços e estoque mínimo devem ser zero ou maiores.')
  }
  const { data, error } = await client().from('inventory_items').insert({
    organization_id: context.organizationId,
    name: required(input.name, 'o nome do produto'),
    sku: input.sku?.trim() || null,
    category: input.category?.trim() || 'Geral',
    cost_price: cost,
    sale_price: sale,
    min_stock: minimum,
  }).select().single()
  if (error) throw error
  return data
}

export async function changeInventoryStock(
  context: TenantContext,
  itemId: string,
  movementType: 'in' | 'out' | 'adjustment',
  quantity: number,
  reason?: string,
) {
  if (!Number.isFinite(quantity) || quantity <= 0) throw new Error('Informe uma quantidade maior que zero.')
  const { data, error } = await client().rpc('adjust_branch_stock', {
    p_organization_id: context.organizationId,
    p_branch_id: context.branchId,
    p_item_id: itemId,
    p_movement_type: movementType,
    p_quantity: quantity,
    p_reason: reason?.trim() || null,
  })
  if (error) throw error
  return data
}
