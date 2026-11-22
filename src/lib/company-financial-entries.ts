import {supabase} from './supabase'
function db(){if(!supabase)throw new Error('Supabase não está configurado.');return supabase}
export type FinancialEntry={id:string;company_id:string;branch_id:string|null;entry_type:'payable'|'receivable';category:string;description:string;counterparty:string|null;amount:number;due_date:string;status:'open'|'paid'|'cancelled';payment_method:string|null;paid_at:string|null;notes:string|null;created_at:string;source_order_number:number|null;source_service_order_id:string|null;customer_id:string|null}
export async function listFinancialEntries(companyId:string):Promise<FinancialEntry[]>{
 const {data,error}=await db().from('company_financial_entries').select('*').eq('company_id',companyId).order('due_date').limit(500)
 if(error)throw error;return (data??[]) as FinancialEntry[]
}
export async function createFinancialEntry(input:{companyId:string;branchId?:string|null;entryType:'payable'|'receivable';category:string;description:string;counterparty?:string;amount:number;dueDate:string;notes?:string}){
 if(!input.description.trim()||!input.category.trim())throw new Error('Preencha descrição e categoria.')
 if(!Number.isFinite(input.amount)||input.amount<=0)throw new Error('O valor deve ser maior que zero.')
 const {data,error}=await db().from('company_financial_entries').insert({company_id:input.companyId,branch_id:input.branchId||null,entry_type:input.entryType,category:input.category.trim(),description:input.description.trim(),counterparty:input.counterparty?.trim()||null,amount:input.amount,due_date:input.dueDate,notes:input.notes?.trim()||null}).select('*').single()
 if(error)throw error;return data as FinancialEntry
}
export async function settleFinancialEntry(companyId:string,entryId:string,method:string){
 const {data,error}=await db().rpc('settle_financial_entry',{p_company_id:companyId,p_entry_id:entryId,p_method:method})
 if(error)throw error;return data as string
}

export async function invoiceServiceOrderNet30(companyId:string,serviceOrderId:string){
 const {data,error}=await db().rpc("invoice_service_order_net30",{p_company_id:companyId,p_service_order_id:serviceOrderId})
 if(error)throw error
 return data as string
}

export type OverdueReceivable={id:string;description:string;amount:number;due_date:string;source_order_number:number|null;created_at:string}
export async function listCustomerOverdueReceivables(companyId:string,customerId:string):Promise<OverdueReceivable[]>{
 const today=new Date().toISOString().slice(0,10)
 const {data,error}=await db().from("company_financial_entries").select("id,description,amount,due_date,source_order_number,created_at").eq("company_id",companyId).eq("customer_id",customerId).eq("entry_type","receivable").eq("status","open").lt("due_date",today).order("due_date",{ascending:true}).limit(100)
 if(error)throw error
 return (data||[]) as OverdueReceivable[]
}
