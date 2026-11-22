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
  const { data, error } = await client().rpc('create_inventory_item_for_branch', {
    p_organization_id: context.organizationId,
    p_branch_id: context.branchId,
    p_name: required(input.name, 'o nome do produto'),
    p_sku: input.sku?.trim() || null,
    p_category: input.category?.trim() || 'Geral',
    p_cost_price: cost,
    p_sale_price: sale,
    p_min_stock: minimum,
  })
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


export type FinancialEntryInput = {
  entryType: 'income' | 'expense'
  description: string
  amount: number
  paymentMethod: 'cash' | 'pix' | 'debit_card' | 'credit_card' | 'bank_transfer' | 'boleto' | 'other'
  status: 'pending' | 'paid'
  dueDate?: string
  notes?: string
}

export async function listFinancialEntries(context: TenantContext) {
  const { data, error } = await client().from('financial_entries')
    .select('id, entry_type, description, amount, payment_method, status, due_date, paid_at, notes, created_at')
    .eq('organization_id', context.organizationId)
    .eq('branch_id', context.branchId)
    .order('created_at', { ascending: false })
    .limit(500)
  if (error) throw error
  return data ?? []
}

export async function createFinancialEntry(context: TenantContext, input: FinancialEntryInput) {
  if (!Number.isFinite(input.amount) || input.amount <= 0) throw new Error('Informe um valor maior que zero.')
  const { data, error } = await client().rpc('create_financial_entry', {
    p_organization_id: context.organizationId,
    p_branch_id: context.branchId,
    p_entry_type: input.entryType,
    p_description: required(input.description, 'a descrição'),
    p_amount: input.amount,
    p_payment_method: input.paymentMethod,
    p_status: input.status,
    p_due_date: input.dueDate || null,
    p_category_id: null,
    p_notes: input.notes?.trim() || null,
  })
  if (error) throw error
  return data
}

export async function updateFinancialEntryStatus(
  context: TenantContext,
  entryId: string,
  status: 'pending' | 'paid' | 'cancelled',
) {
  const { data, error } = await client().rpc('set_financial_entry_status', {
    p_organization_id: context.organizationId,
    p_branch_id: context.branchId,
    p_entry_id: entryId,
    p_status: status,
  })
  if (error) throw error
  return data
}


export type SaleInput = {
  items: Array<{ itemId: string; quantity: number; unitPrice?: number }>
  paymentMethod: 'cash' | 'pix' | 'debit_card' | 'credit_card' | 'bank_transfer' | 'boleto' | 'other'
  paymentStatus: 'paid' | 'pending'
  customerId?: string
  discount?: number
  notes?: string
}

export async function listSales(context: TenantContext) {
  const { data, error } = await client().from('sales')
    .select('id, sale_number, total, payment_method, payment_status, created_at, customers(name), sale_items(id, product_name, quantity, line_total)')
    .eq('organization_id', context.organizationId)
    .eq('branch_id', context.branchId)
    .order('created_at', { ascending: false })
    .limit(200)
  if (error) throw error
  return data ?? []
}

export async function createSale(context: TenantContext, input: SaleInput) {
  if (!input.items.length) throw new Error('Adicione pelo menos um produto.')
  if (input.items.some(item => !Number.isFinite(item.quantity) || item.quantity <= 0)) throw new Error('Confira as quantidades dos produtos.')
  const discount = input.discount ?? 0
  if (!Number.isFinite(discount) || discount < 0) throw new Error('O desconto não pode ser negativo.')
  const { data, error } = await client().rpc('create_sale', {
    p_organization_id: context.organizationId,
    p_branch_id: context.branchId,
    p_items: input.items.map(item => ({ item_id: item.itemId, quantity: item.quantity, ...(item.unitPrice === undefined ? {} : { unit_price: item.unitPrice }) })),
    p_payment_method: input.paymentMethod,
    p_payment_status: input.paymentStatus,
    p_customer_id: input.customerId || null,
    p_discount: discount,
    p_notes: input.notes?.trim() || null,
  })
  if (error) throw error
  return data
}


export type TeamMember = {
  member_id: string
  user_id: string
  full_name: string
  phone: string | null
  member_role: 'owner' | 'admin' | 'manager' | 'attendant' | 'technician'
  is_active: boolean
  joined_at: string
}

export async function listOrganizationTeam(organizationId: string): Promise<TeamMember[]> {
  const { data, error } = await client().rpc('list_organization_team', { p_organization_id: organizationId })
  if (error) throw error
  return (data ?? []) as TeamMember[]
}

export async function inviteOrganizationMember(organizationId: string, email: string, role: Exclude<TeamMember['member_role'], 'owner'>) {
  const normalizedEmail = required(email, 'o e-mail').toLowerCase()
  const { data, error } = await client().functions.invoke('invite-team', {
    body: { organization_id: organizationId, email: normalizedEmail, role },
  })
  if (error) throw error
  if (data?.error) throw new Error(data.error)
  return data as { success: boolean; message: string }
}

export async function setOrganizationMemberRole(
  organizationId: string,
  memberId: string,
  role: TeamMember['member_role'],
) {
  const { error } = await client().rpc('set_organization_member_role', {
    p_organization_id: organizationId,
    p_member_id: memberId,
    p_new_role: role,
  })
  if (error) throw error
}

export async function setOrganizationMemberActive(
  organizationId: string,
  memberId: string,
  active: boolean,
) {
  const { error } = await client().rpc('set_organization_member_active', {
    p_organization_id: organizationId,
    p_member_id: memberId,
    p_active: active,
  })
  if (error) throw error
}


export type ServiceCatalogItem = {
  id: string
  name: string
  description: string | null
  category: string
  price: number
  estimated_minutes: number
  active: boolean
}

export async function listServiceCatalog(organizationId: string): Promise<ServiceCatalogItem[]> {
  const { data, error } = await client().from('service_catalog')
    .select('id,name,description,category,price,estimated_minutes,active')
    .eq('organization_id', organizationId).order('name')
  if (error) throw error
  return (data ?? []) as ServiceCatalogItem[]
}

export async function saveServiceCatalogItem(
  organizationId: string,
  item: Omit<ServiceCatalogItem, 'id'> & { id?: string },
) {
  const { data, error } = await client().rpc('save_service_catalog_item', {
    p_organization_id: organizationId,
    p_service_id: item.id || null,
    p_name: required(item.name, 'o nome do serviço'),
    p_description: item.description || null,
    p_category: item.category || 'Geral',
    p_price: item.price,
    p_estimated_minutes: item.estimated_minutes,
    p_active: item.active,
  })
  if (error) throw error
  return data as string
}

export async function addServiceToOrder(
  organizationId: string,
  branchId: string,
  orderId: string,
  serviceId: string,
  quantity = 1,
) {
  if (!Number.isFinite(quantity) || quantity <= 0) throw new Error('Informe uma quantidade válida.')
  const { data, error } = await client().rpc('add_service_to_order', {
    p_organization_id: organizationId,
    p_branch_id: branchId,
    p_order_id: orderId,
    p_service_id: serviceId,
    p_quantity: quantity,
  })
  if (error) throw error
  return data as string
}


export type PlatformOrganization = {
  organization_id: string
  organization_name: string
  organization_slug: string
  created_at: string
  member_count: number
  branch_count: number
  subscription_id: string | null
  subscription_status: 'trialing'|'active'|'past_due'|'suspended'|'cancelled'|'expired' | null
  plan_id: string | null
  plan_name: string | null
  trial_ends_at: string | null
  current_period_end: string | null
}

export type PlatformPlan = {
  id: string
  code: string
  name: string
  description: string | null
  monthly_price: number
  yearly_price: number
  max_users: number | null
  max_branches: number | null
  active: boolean
}

export async function isPlatformAdmin(): Promise<boolean> {
  const { data, error } = await client().rpc('is_platform_admin')
  if (error) throw error
  return Boolean(data)
}

export async function getPlatformDashboardSummary() {
  const { data, error } = await client().rpc('platform_dashboard_summary')
  if (error) throw error
  return data as {organizations:number;active_subscriptions:number;trialing_subscriptions:number;past_due_subscriptions:number;suspended_subscriptions:number;users:number}
}

export async function listPlatformOrganizations(): Promise<PlatformOrganization[]> {
  const { data, error } = await client().rpc('platform_list_organizations')
  if (error) throw error
  return (data ?? []) as PlatformOrganization[]
}

export async function listPlatformPlans(): Promise<PlatformPlan[]> {
  const { data, error } = await client().rpc('platform_list_plans')
  if (error) throw error
  return (data ?? []) as PlatformPlan[]
}

export async function savePlatformPlan(plan: Omit<PlatformPlan,'id'> & {id?:string}) {
  const { data, error } = await client().rpc('platform_save_plan', {
    p_plan_id: plan.id || null,p_code: plan.code,p_name: plan.name,
    p_description: plan.description,p_monthly_price: plan.monthly_price,
    p_yearly_price: plan.yearly_price,p_max_users: plan.max_users,
    p_max_branches: plan.max_branches,p_active: plan.active,
  })
  if (error) throw error
  return data as string
}

export async function updatePlatformSubscription(input: {
  organizationId:string
  status: 'trialing'|'active'|'past_due'|'suspended'|'cancelled'|'expired'
  planId?:string|null
  trialEndsAt?:string|null
  currentPeriodEnd?:string|null
}) {
  const { error } = await client().rpc('platform_update_subscription', {
    p_organization_id:input.organizationId,p_status:input.status,
    p_plan_id:input.planId||null,p_trial_ends_at:input.trialEndsAt||null,
    p_current_period_end:input.currentPeriodEnd||null,
  })
  if (error) throw error
}


export async function exportOrganizationBackup(organizationId: string) {
  const { data, error } = await client().functions.invoke('export-organization', {
    body: { organization_id: organizationId },
  })
  if (error) throw error
  if (data?.error) throw new Error(data.error)
  return data as Record<string, unknown>
}


export async function validateOrganizationBackup(organizationId: string, backup: Record<string, unknown>, userMapping?: Record<string, string>, branchMapping?: Record<string, string>) {
  const { data, error } = await client().functions.invoke('validate-organization-backup', {
    body: { organization_id: organizationId, backup, ...(userMapping ? { user_mapping: userMapping } : {}), ...(branchMapping ? { branch_mapping: branchMapping } : {}) },
  })
  if (error) throw error
  if (data?.error) throw new Error(data.error)
  return data as {
    valid: boolean
    applied: false
    restore_ready: boolean
    restore_blockers: string[]
    message: string
    organization: { id: string; name: string }
    exported_at: string | null
    total_records: number
    counts: Record<string, number>
    requires_user_mapping: boolean
    user_mapping_requirements: Array<{table:string;field:string;records:number}>
    source_users: Array<{source_user_id:string;references:Array<{table:string;field:string;records:number}>;same_id_member_exists:boolean}>
    destination_members: Array<{user_id:string;full_name:string;role:string;active:boolean}>
    mapping_provided: boolean
    mapping_valid: boolean
    mapping_errors: string[]
    destination_empty: boolean
    target_counts: Record<string, number>
    occupied_tables: Array<{table: string; records: number}>
    errors: string[]
  }
}
