import {supabase} from './supabase'
function db(){if(!supabase)throw new Error('Supabase não está configurado.');return supabase}
export type CashTransaction={id:string;company_id:string;branch_id:string|null;financial_account_id:string|null;direction:'in'|'out';category:string;description:string;amount:number;payment_method:string|null;occurred_at:string;created_at:string;company_financial_accounts?:{account_name:string;bank_name:string}|null}
export async function listCompanyCashTransactions(companyId:string):Promise<CashTransaction[]>{
 const {data,error}=await db().from('cash_transactions').select('id,company_id,branch_id,financial_account_id,direction,category,description,amount,payment_method,occurred_at,created_at,company_financial_accounts(account_name,bank_name)').eq('company_id',companyId).order('occurred_at',{ascending:false}).limit(300)
 if(error)throw error
 return (data??[]).map(row=>({...row,company_financial_accounts:Array.isArray(row.company_financial_accounts)?row.company_financial_accounts[0]??null:row.company_financial_accounts??null})) as CashTransaction[]
}
export async function createCompanyCashTransaction(input:{companyId:string;branchId?:string|null;direction:'in'|'out';category:string;description:string;amount:number;paymentMethod:string;financialAccountId?:string|null}){
 const amount=Number(input.amount),description=input.description.trim(),category=input.category.trim()
 if(!Number.isFinite(amount)||amount<=0||!description||!category)throw new Error('Informe descrição, categoria e valor válido.')
 const {data,error}=await db().rpc('create_company_cash_transaction',{p_company_id:input.companyId,p_branch_id:input.branchId||null,p_direction:input.direction,p_category:category,p_description:description,p_amount:amount,p_payment_method:input.paymentMethod,p_financial_account_id:input.financialAccountId||null})
 if(error)throw error
 return data
}

export type CashSession={id:string;company_id:string;branch_id:string|null;opened_by:string|null;closed_by:string|null;opening_amount:number;closing_amount:number|null;expected_amount:number|null;difference_amount:number|null;status:'open'|'closed';opened_at:string;closed_at:string|null;notes:string|null}
export async function listCompanyCashSessions(companyId:string):Promise<CashSession[]>{
 const {data,error}=await db().from('cash_sessions').select('id,company_id,branch_id,opened_by,closed_by,opening_amount,closing_amount,expected_amount,difference_amount,status,opened_at,closed_at,notes').eq('company_id',companyId).order('opened_at',{ascending:false}).limit(100)
 if(error)throw error
 return (data??[]) as CashSession[]
}
export async function openCompanyCashSession(input:{companyId:string;branchId?:string|null;openingAmount:number;notes?:string}){
 const {data,error}=await db().rpc('open_company_cash_session',{p_company_id:input.companyId,p_branch_id:input.branchId||null,p_opening_amount:input.openingAmount,p_notes:input.notes||null})
 if(error)throw error
 return data as CashSession
}
export async function closeCompanyCashSession(input:{companyId:string;sessionId:string;closingAmount:number;notes?:string}){
 const {data,error}=await db().rpc('close_company_cash_session',{p_company_id:input.companyId,p_session_id:input.sessionId,p_closing_amount:input.closingAmount,p_notes:input.notes||null})
 if(error)throw error
 return data as CashSession
}
export async function getOpenCompanyCashSession(companyId:string,branchId?:string|null):Promise<CashSession|null>{
 let query=db().from('cash_sessions').select('id,company_id,branch_id,opened_by,closed_by,opening_amount,closing_amount,expected_amount,difference_amount,status,opened_at,closed_at,notes').eq('company_id',companyId).eq('status','open')
 query=branchId?query.eq('branch_id',branchId):query.is('branch_id',null)
 const {data,error}=await query.maybeSingle()
 if(error)throw error
 return data as CashSession|null
}
