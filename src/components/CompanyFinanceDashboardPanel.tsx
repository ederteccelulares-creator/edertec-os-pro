import {useCallback,useEffect,useMemo,useState} from 'react'
import {ArrowDownCircle,ArrowUpCircle,Wallet,CalendarClock,RefreshCw,TrendingUp} from 'lucide-react'
import {supabase} from '../lib/supabase'

type Movement={id:string;direction:'in'|'out';category:string;description:string;amount:number;occurred_at:string;branch_id:string|null}
type Entry={id:string;entry_type:'payable'|'receivable';amount:number;due_date:string;status:string;branch_id:string|null;description:string;counterparty:string|null}
type Balance={account_id:string;current_balance:number}
const money=(n:number)=>Number(n||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})
const dateKey=(d:Date)=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')
const monthLabel=(d:Date)=>d.toLocaleDateString('pt-BR',{month:'short'})
export default function CompanyFinanceDashboardPanel({companyId,branchId}:{companyId:string;branchId:string}){
 const [movements,setMovements]=useState<Movement[]>([])
 const [entries,setEntries]=useState<Entry[]>([])
 const [accountBalance,setAccountBalance]=useState<number|null>(null)
 const [loading,setLoading]=useState(true)
 const [error,setError]=useState('')
 const [updatedAt,setUpdatedAt]=useState<Date|null>(null)
 const load=useCallback(async()=>{
  if(!supabase)return
  setLoading(true);setError('')
  try{
   const now=new Date()
   const start=new Date(now.getFullYear(),now.getMonth()-5,1)
   const monthStart=dateKey(new Date(now.getFullYear(),now.getMonth(),1))
   const monthEnd=dateKey(new Date(now.getFullYear(),now.getMonth()+1,1))
   let movementQuery=supabase.from('cash_transactions').select('id,direction,category,description,amount,occurred_at,branch_id').eq('company_id',companyId).gte('occurred_at',start.toISOString()).order('occurred_at',{ascending:false}).limit(1500)
   let entryQuery=supabase.from('company_financial_entries').select('id,entry_type,amount,due_date,status,branch_id,description,counterparty').eq('company_id',companyId).eq('status','open').order('due_date',{ascending:true}).limit(1500)
   let accountQuery=supabase.from('company_financial_accounts').select('id,branch_id').eq('company_id',companyId).eq('is_active',true)
   if(branchId){movementQuery=movementQuery.eq('branch_id',branchId);entryQuery=entryQuery.eq('branch_id',branchId);accountQuery=accountQuery.or('branch_id.is.null,branch_id.eq.'+branchId)}
   const [m,e,a]=await Promise.all([movementQuery,entryQuery,accountQuery])
   if(m.error)throw m.error
   if(e.error)throw e.error
   if(a.error)throw a.error
   setMovements((m.data||[]) as Movement[])
   setEntries((e.data||[]) as Entry[])
   const accountIds=(a.data||[]).map((x:{id:string})=>x.id)
   if(accountIds.length){
    const {data,error:balanceError}=await supabase.rpc('list_company_financial_account_balances',{p_company_id:companyId})
    if(balanceError)throw balanceError
    const balances=(data||[]) as Balance[]
    setAccountBalance(balances.filter(x=>accountIds.includes(x.account_id)).reduce((sum,x)=>sum+Number(x.current_balance||0),0))
   }else setAccountBalance(0)
   setUpdatedAt(new Date())
   void monthStart;void monthEnd
  }catch(e){setError(e instanceof Error?e.message:'Não foi possível carregar o resumo financeiro.')}
  finally{setLoading(false)}
 },[companyId,branchId])
 useEffect(()=>{void load()},[load])
 const now=new Date()
 const monthStart=new Date(now.getFullYear(),now.getMonth(),1)
 const monthMovements=movements.filter(x=>new Date(x.occurred_at)>=monthStart)
 const income=monthMovements.filter(x=>x.direction==='in').reduce((s,x)=>s+Number(x.amount),0)
 const expense=monthMovements.filter(x=>x.direction==='out').reduce((s,x)=>s+Number(x.amount),0)
 const payables=entries.filter(x=>x.entry_type==='payable')
 const receivables=entries.filter(x=>x.entry_type==='receivable')
 const overdue=[...entries].filter(x=>x.due_date<dateKey(now))
 const monthBars=useMemo(()=>Array.from({length:6},(_,i)=>{
  const d=new Date(now.getFullYear(),now.getMonth()-5+i,1)
  const key=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')
  const rows=movements.filter(x=>x.occurred_at.slice(0,7)===key)
  return {label:monthLabel(d),income:rows.filter(x=>x.direction==='in').reduce((s,x)=>s+Number(x.amount),0),expense:rows.filter(x=>x.direction==='out').reduce((s,x)=>s+Number(x.amount),0)}
 }),[movements])
 const maxBar=Math.max(1,...monthBars.flatMap(x=>[x.income,x.expense]))
 const recent=movements.slice(0,8)
 return <section className="company-finance-dashboard">
  <div className="company-panel-head"><div><b>Resumo financeiro</b><small>{branchId?'Filial selecionada':'Todas as filiais'} · valores registrados no fluxo de caixa</small></div><button className="company-secondary" onClick={()=>void load()} disabled={loading}><RefreshCw size={15}/> {loading?'Atualizando...':'Atualizar'}</button></div>
  {error&&<div className="company-error-banner">{error}</div>}
  <div className="company-dashboard-stats company-finance-kpis">
   <article className="green"><span><ArrowDownCircle/></span><div><b>Entradas do mês</b><strong>{loading?'—':money(income)}</strong><small>Recebimentos efetivamente lançados</small></div></article>
   <article className="orange"><span><ArrowUpCircle/></span><div><b>Saídas do mês</b><strong>{loading?'—':money(expense)}</strong><small>Pagamentos efetivamente lançados</small></div></article>
   <article className={income-expense>=0?'blue':'pink'}><span><TrendingUp/></span><div><b>Resultado do mês</b><strong>{loading?'—':money(income-expense)}</strong><small>Entradas menos saídas registradas</small></div></article>
   <article className="purple"><span><Wallet/></span><div><b>Saldo das contas</b><strong>{loading||accountBalance===null?'—':money(accountBalance)}</strong><small>Contas financeiras ativas</small></div></article>
  </div>
  <div className="company-finance-dashboard-grid">
   <section className="company-panel"><div className="company-panel-head"><div><b>Movimentação dos últimos 6 meses</b><small>Comparativo de entradas e saídas</small></div></div>
    {loading?<p className="company-empty">Carregando...</p>:<div className="company-finance-bars">{monthBars.map((m,i)=><div className="company-finance-bar-month" key={i}><div className="company-finance-bar-pair"><div className="company-finance-bar income" style={{height:Math.max(3,m.income/maxBar*126)+'px'}} title={'Entradas: '+money(m.income)}/><div className="company-finance-bar expense" style={{height:Math.max(3,m.expense/maxBar*126)+'px'}} title={'Saídas: '+money(m.expense)}/></div><small>{m.label}</small></div>)}</div>}
    <div className="company-finance-legend"><span><i className="income"/> Entradas</span><span><i className="expense"/> Saídas</span></div>
   </section>
   <section className="company-panel"><div className="company-panel-head"><div><b>Contas em aberto</b><small>Previsão financeira</small></div></div>
    <div className="company-finance-open-row"><span>A pagar</span><b>{loading?'—':money(payables.reduce((s,x)=>s+Number(x.amount),0))}</b></div>
    <div className="company-finance-open-row"><span>A receber</span><b>{loading?'—':money(receivables.reduce((s,x)=>s+Number(x.amount),0))}</b></div>
    <div className="company-finance-open-row"><span>Saldo previsto</span><b>{loading?'—':money(receivables.reduce((s,x)=>s+Number(x.amount),0)-payables.reduce((s,x)=>s+Number(x.amount),0))}</b></div>
    <div className="company-finance-open-row overdue"><span>Contas vencidas</span><b>{loading?'—':overdue.length}</b></div>
    <small className="company-finance-footnote">Contas em aberto não são somadas novamente às entradas e saídas realizadas.</small>
   </section>
  </div>
  <section className="company-panel"><div className="company-panel-head"><div><b>Últimas movimentações</b><small>Registros mais recentes do caixa</small></div></div>
   {loading?<p className="company-empty">Carregando...</p>:recent.length===0?<p className="company-empty">Nenhuma movimentação financeira encontrada.</p>:<div className="company-table-wrap"><table><thead><tr><th>DATA</th><th>TIPO</th><th>DESCRIÇÃO</th><th>CATEGORIA</th><th>VALOR</th></tr></thead><tbody>{recent.map(x=><tr key={x.id}><td>{new Date(x.occurred_at).toLocaleDateString('pt-BR')}</td><td>{x.direction==='in'?'Entrada':'Saída'}</td><td>{x.description}</td><td>{x.category}</td><td><b>{x.direction==='in'?'+':'−'} {money(Number(x.amount))}</b></td></tr>)}</tbody></table></div>}
  </section>
  {updatedAt&&<p className="company-finance-footnote"><CalendarClock size={13}/> Atualizado em {updatedAt.toLocaleString('pt-BR')}</p>}
 </section>
}
