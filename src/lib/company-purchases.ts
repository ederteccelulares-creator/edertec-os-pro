import { supabase } from './supabase'

function db(){if(!supabase) throw new Error('Supabase não está configurado.');return supabase}
export type CompanyPurchase={id:string;company_id:string;purchase_number:number;status:string;subtotal:number;discount:number;freight:number;total:number;purchased_at:string|null;received_at:string|null;notes:string|null;supplier_id:string|null;branch_id:string|null}
export type PurchaseItemInput={productId:string|null;description:string;quantity:number;unitCost:number}
export async function listCompanyPurchases(companyId:string):Promise<CompanyPurchase[]>{
 const {data,error}=await db().from('purchases').select('id,company_id,purchase_number,status,subtotal,discount,freight,total,purchased_at,received_at,notes,supplier_id,branch_id').eq('company_id',companyId).order('created_at',{ascending:false}).limit(200)
 if(error)throw error
 return (data??[]) as CompanyPurchase[]
}
export async function createCompanyPurchase(input:{companyId:string;supplierId?:string|null;branchId?:string|null;discount:number;freight:number;notes?:string;items:PurchaseItemInput[]}){
 const items=input.items.map(i=>({product_id:i.productId,description:i.description.trim(),quantity:Number(i.quantity),unit_cost:Number(i.unitCost)}))
 if(!items.length)throw new Error('Adicione ao menos um item.')
 for(const i of items)if(!i.description||!Number.isFinite(i.quantity)||i.quantity<=0||!Number.isFinite(i.unit_cost)||i.unit_cost<0)throw new Error('Confira a descrição, quantidade e custo dos itens.')
 const {data,error}=await db().rpc('create_company_purchase',{p_company_id:input.companyId,p_supplier_id:input.supplierId||null,p_branch_id:input.branchId||null,p_discount:Number(input.discount),p_freight:Number(input.freight),p_notes:input.notes||null,p_items:items})
 if(error)throw error
 return data as string
}
export async function receiveCompanyPurchase(companyId:string,purchaseId:string){
 const {error}=await db().rpc('receive_company_purchase',{p_company_id:companyId,p_purchase_id:purchaseId})
 if(error)throw error
}
