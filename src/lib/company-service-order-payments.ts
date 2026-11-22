import {supabase} from './supabase'
function db(){if(!supabase)throw new Error('Supabase não está configurado.');return supabase}
export type PaymentMethod='pix'|'cash'|'debit_card'|'credit_card'|'bank_transfer'|'boleto'|'other'
export async function recordCompanyServiceOrderPayment(input:{companyId:string;serviceOrderId:string;amount:number;method:PaymentMethod;notes?:string}){
 const amount=Number(input.amount)
 if(!Number.isFinite(amount)||amount<=0)throw new Error('Informe um valor maior que zero.')
 const {data,error}=await db().rpc('record_company_service_order_payment',{p_company_id:input.companyId,p_service_order_id:input.serviceOrderId,p_amount:amount,p_method:input.method,p_notes:input.notes||null})
 if(error)throw error
 return data as string
}
