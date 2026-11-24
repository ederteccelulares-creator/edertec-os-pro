import {useCallback,useEffect,useMemo,useState} from 'react'
import {RefreshCw,Wallet,ArrowUpCircle,Users,Building2} from 'lucide-react'
import {listCompanyBranches,type Company,type CompanyBranch} from '../lib/company-data'
import {supabase} from '../lib/supabase'

type CashRow={id:string;branch_id:string|null;direction:'in'|'out';category:string;description:string;amount:number;payment_method:string|null;occurred_at:string}
type SettlementLink={cash_transaction_id:string;employee_id:string}
type Employee={id:string;name:string}
type ExpenseRow=CashRow&{employee_name:string|null}
const money=(n:number)=>Number(n||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})
const localDate=(d:Date)=>{const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),day=String(d.getDate()).padStart(2,'0');return y+'-'+m+'-'+day}
export default function CompanyExpenseReportPanel({company}:{company:Company}){
 const now=new Date()
 const [start,setStart]=useState(localDate(new Date(now.getFullYear(),now.getMonth(),1)))
 const [end,setEnd]=useState(localDate(now))
 const [branchId,setBranchId]=useState('all')
 const [branches,setBranches]=useState<CompanyBranch[]>([])
 const [rows,setRows]=useState<ExpenseRow[]>([])
 const [loading,setLoading]=useState(false)
 const [error,setError]=useState('')
 const load=useCallback(async()=>{
  if(!supabase)return
  if(!start||!end||start>end){setError('Selecione um período válido.');return}
  setLoading(true);setError('')
  try{
   const [branchResult,cashResult,settlementResult,employeeResult]=await Promise.all([
    listCompanyBranches(company.id),
    supabase.from('cash_transactions').select('id,branch_id,direction,category,description,amount,payment_method,occurred_at').eq('company_id',company.id).gte('occurred_at',new Date(start+'T00:00:00').toISOString()).lt('occurred_at',new Date(new Date(end+'T00:00:00').getTime()+86400000).toISOString()).order('occurred_at',{ascending:false}).limit(10000),
    supabase.from('company_pos_commission_settlements').select('cash_transaction_id,employee_id').eq('company_id',company.id).not('cash_transaction_id','is',null),
    supabase.from('employees').select('id,name').eq('company_id',company.id)
   ])
   if(cashResult.error)throw cashResult.error
   if(settlementResult.error)throw settlementResult.error
   if(employeeResult.error)throw employeeResult.error
   setBranches(branchResult)
   const employeeNames=new Map((employeeResult.data||[] as Employee[]).map((e:Employee)=>[e.id,e.name]))
   const employeeByTransaction=new Map((settlementResult.data||[] as SettlementLink[]).map((s:SettlementLink)=>[s.cash_transaction_id,s.employee_id]))
   const branchFiltered=(cashResult.data||[] as CashRow[]).filter((r:CashRow)=>branchId==='all'||(branchId==='__none__'?r.branch_id===null:r.branch_id===branchId))
   setRows(branchFiltered.map((r:CashRow)=>({...r,employee_name:employeeNames.get(employeeByTransaction.get(r.id)||'')||null})))
  }catch(e){setError(e instanceof Error?e.message:'Não foi possível carregar o relatório financeiro.')}
  finally{setLoading(false)}
 },[company.id,start,end,branchId])
 useEffect(()=>{void load()},[load])
 const expenses=useMemo(()=>rows.filter(r=>r.direction==='out'),[rows])
 const total=expenses.reduce((s,r)=>s+Number(r.amount),0)
 const byCategory=useMemo(()=>{const map=new Map<string,number>();for(const r of expenses)map.set(r.category,(map.get(r.category)||0)+Number(r.amount));return [...map.entries()].map(([name,value])=>({name,value})).sort((a,b)=>b.value-a.value)},[expenses])
 const byEmployee=useMemo(()=>{const map=new Map<string,number>();for(const r of expenses)if(r.employee_name)map.set(r.employee_name,(map.get(r.employee_name)||0)+Number(r.amount));return [...map.entries()].map(([name,value])=>({name,value})).sort((a,b)=>b.value-a.value)},[expenses])
 const byBranch=useMemo(()=>{const map=new Map<string,number>();for(const r of expenses){const name=r.branch_id?branches.find(b=>b.id===r.branch_id)?.name||'Filial': 'Matriz / sem filial';map.set(name,(map.get(name)||0)+Number(r.amount))}return [...map.entries()].map(([name,value])=>({name,value})).sort((a,b)=>b.value-a.value)},[expenses,branches])
 const income=rows.filter(r=>r.direction==='in').reduce((s,r)=>s+Number(r.amount),0)
 const paymentLabel=(v:string|null)=>({pix:'PIX',cash:'Dinheiro',debit_card:'Débito',credit_card:'Crédito',bank_transfer:'Transferência',boleto:'Boleto',other:'Outro'} as Record<string,string>)[v||'']||'—'
 return <section className="company-panel">
  <div className="company-panel-head"><div><b>Relatório de despesas</b><small>Saídas efetivamente registradas no caixa, por período, categoria, funcionário e filial</small></div><button className="company-secondary" onClick={()=>void load()} disabled={loading}><RefreshCw size={15}/> Atualizar</button></div>
  {error&&<div className="company-error-banner">{error}</div>}
  <div className="company-form-grid company-expense-filters">
   <label>Data inicial<input type="date" value={start} onChange={e=>setStart(e.target.value)}/></label>
   <label>Data final<input type="date" value={end} onChange={e=>setEnd(e.target.value)}/></label>
   <label>Filial<select value={branchId} onChange={e=>setBranchId(e.target.value)}><option value="all">Todas as unidades</option><option value="__none__">Matriz / sem filial</option>{branches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
  </div>
  <div className="company-finance-summary"><article><small><Wallet size={14}/> Despesas pagas</small><b>{money(total)}</b></article><article><small><ArrowUpCircle size={14}/> Entradas no período</small><b>{money(income)}</b></article><article><small>Movimentações consideradas</small><b>{expenses.length}</b></article></div>
  {loading?<p className="company-empty">Carregando relatório...</p>:<div className="company-expense-report-grid">
   <section className="company-panel company-expense-card"><div className="company-panel-head"><div><b>Despesas por categoria</b><small>Somente saídas do caixa</small></div></div>{byCategory.length?byCategory.map(x=><div className="company-expense-line" key={x.name}><span>{x.name}</span><b>{money(x.value)}</b></div>):<p className="company-empty">Nenhuma despesa no período.</p>}</section>
   <section className="company-panel company-expense-card"><div className="company-panel-head"><div><b><Users size={15}/> Despesas por funcionário</b><small>Identificação disponível para pagamentos de comissão</small></div></div>{byEmployee.length?byEmployee.map(x=><div className="company-expense-line" key={x.name}><span>{x.name}</span><b>{money(x.value)}</b></div>):<p className="company-empty">Nenhum pagamento de comissão identificado neste período.</p>}</section>
   <section className="company-panel company-expense-card"><div className="company-panel-head"><div><b><Building2 size={15}/> Despesas por filial</b><small>Distribuição das saídas</small></div></div>{byBranch.length?byBranch.map(x=><div className="company-expense-line" key={x.name}><span>{x.name}</span><b>{money(x.value)}</b></div>):<p className="company-empty">Nenhuma despesa no período.</p>}</section>
  </div>}
  <div className="company-panel-head"><div><b>Detalhamento das saídas</b><small>{expenses.length} movimentações · comissão aparece uma única vez, pelo lançamento de caixa</small></div></div>
  {loading?<p className="company-empty">Carregando...</p>:expenses.length===0?<p className="company-empty">Nenhuma saída registrada no período selecionado.</p>:<div className="company-table-wrap"><table><thead><tr><th>DATA</th><th>DESCRIÇÃO</th><th>CATEGORIA</th><th>FILIAL</th><th>FUNCIONÁRIO</th><th>FORMA</th><th>VALOR</th></tr></thead><tbody>{expenses.map(r=><tr key={r.id}><td>{new Date(r.occurred_at).toLocaleString('pt-BR')}</td><td>{r.description}</td><td>{r.category}</td><td>{r.branch_id?branches.find(b=>b.id===r.branch_id)?.name||'Filial':'Matriz / sem filial'}</td><td>{r.employee_name||'—'}</td><td>{paymentLabel(r.payment_method)}</td><td className="cash-out">{money(Number(r.amount))}</td></tr>)}</tbody></table></div>}
  <p className="company-inventory-note">Este relatório considera apenas despesas efetivamente lançadas em cash_transactions. Contas a pagar ainda em aberto não entram no total. Pagamentos de comissões são vinculados ao funcionário pelo fechamento e não são somados novamente.</p>
 </section>
}
