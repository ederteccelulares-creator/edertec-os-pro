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
  image_url: string | null
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
  reason: string | null
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
    .select('id,company_id,sku,name,description,image_url,cost_price,sale_price,stock_quantity,min_stock,is_active,created_at,updated_at')
    .eq('company_id', filters.companyId)
    .order('name')
    .limit(Math.min(Math.max(filters.limit ?? 250, 1), 500))

  if (filters.activeOnly !== false) query = query.eq('is_active', true)
  const term = filters.search?.trim()
  // Without a search term, return the full active product list.
  // The inventory needs this list on initial load; the PDV applies its
  // own client-side rule and only displays matches after the user types.
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
  imageFile?: File | null
}) {
  const name = input.name.trim()
  if (!name) throw new Error('Informe o nome do produto.')
  if (input.imageFile) {
    if (!['image/jpeg','image/png','image/webp'].includes(input.imageFile.type)) throw new Error('A foto deve estar em JPG, PNG ou WebP.')
    if (input.imageFile.size > 5 * 1024 * 1024) throw new Error('A foto deve ter no máximo 5 MB.')
  }
  const costPrice = Number(input.costPrice ?? 0)
  const salePrice = Number(input.salePrice ?? 0)
  const initialStock = Number(input.initialStock ?? 0)\n  const minimumStock = Number(input.minimumStock ?? 0)\n  if (![costPrice,salePrice,initialStock,minimumStock].every(Number.isFinite) ||\n      costPrice < 0 || salePrice < 0 || initialStock < 0 || minimumStock < 0 ||\n      !Number.isInteger(initialStock) || !Number.isInteger(minimumStock)) {\n    throw new Error('Preços devem ser positivos ou zero; quantidades devem ser números inteiros não negativos.')\n  }

  const { data, error } = await db()
    .from('products')
    .insert({
      company_id: input.companyId,
      sku: input.sku?.trim() || null,
      name,
      description: input.description?.trim() || null,
      image_url: null,
      cost_price: costPrice,
      sale_price: salePrice,
      stock_quantity: 0,
      min_stock: minimumStock,
      is_active: true,
    })
    .select('id,company_id,sku,name,description,image_url,cost_price,sale_price,stock_quantity,min_stock,is_active,created_at,updated_at')
    .single()
  if (error) throw error
  let product = data as CompanyProduct\n  if (initialStock > 0) {\n    try {\n      await recordCompanyStockMovement({\n        companyId: input.companyId,\n        productId: product.id,\n        movementType: 'in',\n        quantity: initialStock,\n        unitCost: costPrice,\n        reason: 'Saldo inicial no cadastro do produto',\n      })\n    } catch (movementError) {\n      throw new Error('O produto foi criado, mas a entrada do saldo inicial falhou. Não cadastre novamente; atualize o estoque pelo botão Movimentar. Detalhe: ' + (movementError instanceof Error ? movementError.message : 'erro desconhecido.'))\n    }\n  }\n  if (input.imageFile) {
    const file = input.imageFile
    if (!['image/jpeg','image/png','image/webp'].includes(file.type)) throw new Error('A foto deve estar em JPG, PNG ou WebP.')
    if (file.size > 5 * 1024 * 1024) throw new Error('A foto deve ter no máximo 5 MB.')
    const extension = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
    const path = input.companyId + '/' + product.id + '.' + extension
    const { error: uploadError } = await db().storage.from('product-images').upload(path, file, { upsert: true, contentType: file.type })
    if (uploadError) throw uploadError
    const { data: publicData } = db().storage.from('product-images').getPublicUrl(path)
    const { data: updated, error: updateError } = await db().from('products')
      .update({ image_url: publicData.publicUrl, updated_at: new Date().toISOString() })
      .eq('company_id', input.companyId).eq('id', product.id)
      .select('id,company_id,sku,name,description,image_url,cost_price,sale_price,stock_quantity,min_stock,is_active,created_at,updated_at').single()
    if (updateError) throw updateError
    product = updated as CompanyProduct
  }
  return product
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
    .select('id,company_id,product_id,branch_id,movement_type,quantity,unit_cost,reason,created_at')
    .eq('company_id', input.companyId)
    .order('created_at', { ascending: false })
    .limit(Math.min(Math.max(input.limit ?? 100, 1), 500))
  if (input.productId) query = query.eq('product_id', input.productId)
  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as CompanyStockMovement[]
}


export async function recordCompanyStockMovement(input: {
  companyId: string
  productId: string
  movementType: 'in' | 'out' | 'adjustment'
  quantity: number
  unitCost?: number
  reason?: string
  branchId?: string | null
}) {
  const quantity = Number(input.quantity)
  const unitCost = Number(input.unitCost ?? 0)
  if (!Number.isFinite(quantity) || quantity <= 0) throw new Error('Informe uma quantidade maior que zero.')
  if (!Number.isFinite(unitCost) || unitCost < 0) throw new Error('O custo unitário não pode ser negativo.')

  const { data, error } = await db().rpc('record_stock_movement', {
    p_company_id: input.companyId,
    p_product_id: input.productId,
    p_movement_type: input.movementType,
    p_quantity: quantity,
    p_branch_id: input.branchId || null,
    p_unit_cost: unitCost,
    p_reason: input.reason?.trim() || null,
  })
  if (error) throw error
  return data as string
}
