import { supabase } from './supabase'

function db() {
  if (!supabase) throw new Error('Supabase não está configurado.')
  return supabase
}

export type CompanyProduct = {
  id: string
  company_id: string
  sku: string | null
  name: string
  description: string | null
  cost_price: number
  sale_price: number
  stock_quantity: number
  min_stock: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export type CompanyStockMovement = {
  id: string
  company_id: string
  product_id: string
  branch_id: string | null
  movement_type: string
  quantity: number
  unit_cost: number | null
  notes: string | null
  created_at: string
}

export type InventoryFilters = {
  companyId: string
  search?: string
  activeOnly?: boolean
  limit?: number
}

export async function listCompanyProducts(filters: InventoryFilters): Promise<CompanyProduct[]> {
  let query = db()
    .from('products')
    .select('id,company_id,sku,name,description,cost_price,sale_price,stock_quantity,min_stock,is_active,created_at,updated_at')
    .eq('company_id', filters.companyId)
    .order('name')
    .limit(Math.min(Math.max(filters.limit ?? 250, 1), 500))

  if (filters.activeOnly !== false) query = query.eq('is_active', true)
  const term = filters.search?.trim()
  if (term) {
    const safe = term.replace(/[,%()]/g, ' ').trim()
    if (safe) query = query.or(`name.ilike.%${safe}%,sku.ilike.%${safe}%`)
  }
  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as CompanyProduct[]
}

export async function createCompanyProduct(input: {
  companyId: string
  sku?: string
  name: string
  description?: string
  costPrice?: number
  salePrice?: number
  initialStock?: number
  minimumStock?: number
}) {
  const name = input.name.trim()
  if (!name) throw new Error('Informe o nome do produto.')
  const costPrice = Number(input.costPrice ?? 0)
  const salePrice = Number(input.salePrice ?? 0)
  const initialStock = Number(input.initialStock ?? 0)
  const minimumStock = Number(input.minimumStock ?? 0)
  if (![costPrice,salePrice,initialStock,minimumStock].every(Number.isFinite) ||
      costPrice < 0 || salePrice < 0 || initialStock < 0 || minimumStock < 0) {
    throw new Error('Preços e quantidades devem ser números positivos ou zero.')
  }

  const { data, error } = await db()
    .from('products')
    .insert({
      company_id: input.companyId,
      sku: input.sku?.trim() || null,
      name,
      description: input.description?.trim() || null,
      cost_price: costPrice,
      sale_price: salePrice,
      stock_quantity: initialStock,
      min_stock: minimumStock,
      is_active: true,
    })
    .select('id,company_id,sku,name,description,cost_price,sale_price,stock_quantity,min_stock,is_active,created_at,updated_at')
    .single()
  if (error) throw error
  return data as CompanyProduct
}

export async function setCompanyProductActive(input: {
  companyId: string
  productId: string
  isActive: boolean
}) {
  const { data, error } = await db()
    .from('products')
    .update({ is_active: input.isActive, updated_at: new Date().toISOString() })
    .eq('company_id', input.companyId)
    .eq('id', input.productId)
    .select('id,is_active')
    .single()
  if (error) throw error
  return data
}

export async function listCompanyStockMovements(input: {
  companyId: string
  productId?: string
  limit?: number
}): Promise<CompanyStockMovement[]> {
  let query = db()
    .from('stock_movements')
    .select('id,company_id,product_id,branch_id,movement_type,quantity,unit_cost,notes,created_at')
    .eq('company_id', input.companyId)
    .order('created_at', { ascending: false })
    .limit(Math.min(Math.max(input.limit ?? 100, 1), 500))
  if (input.productId) query = query.eq('product_id', input.productId)
  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as CompanyStockMovement[]
}
