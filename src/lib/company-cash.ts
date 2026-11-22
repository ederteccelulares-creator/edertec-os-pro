import {supabase} from './supabase'
function db(){if(!supabase)throw new Error('Supabase não está configurado.');return supabase}
export type CashTransaction={id:string;company_id:string;branch_id:string|null;direction:'in'|'out';category:string;description:string;amount:number;payment_method:string|null;occurred_at:string;created_at:string}
export async function listCompanyCashTransactions(companyId:string):Promise<CashTransaction[]>{
 const {data,error}=await db().from('cash_transactions').select('id,company_id,branch_id,direction,category,description,amount,payment_method,occurred_at,created_at').eq('company_id',companyId).order('occurred_at',{ascending:false}).limit(300)
 if(error)throw error
 return (data??[]) as CashTransaction[]
}
export async function createCompanyCashTransaction(input:{companyId:string;branchId?:string|null;direction:'in'|'out';category:string;description:string;amount:number;paymentMethod:string}){
 const amount=Number(input.amount),description=input.description.trim(),category=input.category.trim()
 if(!Number.isFinite(amount)||amount<=0||!description||!category)throw new Error('Informe descrição, categoria e valor válido.')
 const {data,error}=await db().from('cash_transactions').insert({company_id:input.companyId,branch_id:input.branchId||null,direction:input.direction,category,description,amount,payment_method:input.paymentMethod}).select('id').single()
 if(error)throw error
 return data
}
