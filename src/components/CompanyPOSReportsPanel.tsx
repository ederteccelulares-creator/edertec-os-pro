import {useCallback,useEffect,useMemo,useState} from 'react'
import {BarChart3,RefreshCw,TrendingUp,ShoppingBag,Wallet,Package} from 'lucide-react'
import {listCompanyBranches,type Company,type CompanyBranch} from '../lib/company-data'
import {supabase} from '../lib/supabase'

type Sale={id:string;sale_number:number;branch_id:string|null;created_at:string;subtotal:number;discount:number;total:number;payment_method:string;status:string;seller_employee_id:string|null;commission_rate:number;commission_amount:number;commission_settlement_id:string|null}
type Employee={id:string;name:string;branch_id:string|null;commission_percent:number;is_active:boolean}
type Item={sale_id:string;product_id:string|null;product_name:string;quantity:number;unit_price:number;unit_cost:number;line_total:number}
type CommissionSettlement={id:string;employee_id:string;branch_id:string|null;period_start:string;period_end:string;sale_count:number;total_amount:number;status:'pending'|'paid';created_at:string;paid_at:string|null;payment_method:string|null;payment_reference:string|null;cash_transaction_id:string|null}
type FinancialAccount={id:string;account_name:string;bank_name:string;branch_id:string|null}
const money=(n:number)=>Number(n||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})
const dateValue=(d:Date)=>{const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),day=String(d.getDate()).padStart(2,'0');return y+'-'+m+'-'+day}
const methods:Record<string,string>={pix:'PIX',cash:'Dinheiro',debit_card:'Débito',credit_card:'Crédito',bank_transfer:'Transferência',other:'Outro'}
export default function CompanyPOSReportsPanel({company}:{company:Company}){
 const today=new Date()
 const [start,setStart]=useState(dateValue(new Date(today.getFullYear(),today.getMonth(),1)))
 const [end,setEnd]=useState(dateValue(today))
 const [branchId,setBranchId]=useState('')
 const [branches,setBranches]=useState<CompanyBranch[]>([])
 const [sales,setSales]=useState<Sale[]>([])
 const [items,setItems]=useState<Item[]>([])
 const [employees,setEmployees]=useState<Employee[]>([])
 const [settlements,setSettlements]=useState<CommissionSettlement[]>([])
 const [financialAccounts,setFinancialAccounts]=useState<FinancialAccount[]>([])
 const [paymentDraft,setPaymentDraft]=useState<{settlementId:string;method:string;accountId:string;reference:string}|null>(null)\n const [settlementEmployeeFilter,setSettlementEmployeeFilter]=useState('')\n const [settlementStatusFilter,setSettlementStatusFilter]=useState<'all'|'pending'|'paid'>('all')
 const [settlementBusy,setSettlementBusy]=useState<string|null>(null)
 const [commissionDrafts,setCommissionDrafts]=useState<Record<string,string>>({})
 const [savingEmployee,setSavingEmployee]=useState<string|null>(null)
 const [commissionNotice,setCommissionNotice]=useState('')
 const [loading,setLoading]=useState(false)
 const [error,setError]=useState('')
 const load=useCallback(async()=>{
  if(!supabase)return
  if(!start||!end||start>end){setError('Informe um período válido.');return}
  setLoading(true);setError('')
  try{
   const [branchResult,employeeResult,accountResult]=await Promise.all([listCompanyBranches(company.id),supabase.from('employees').select('id,name,branch_id,commission_percent,is_active').eq('company_id',company.id).order('name'),supabase.from('company_financial_accounts').select('id,account_name,bank_name,branch_id').eq('company_id',company.id).eq('is_active',true).order('account_name')]);if(employeeResult.error)throw employeeResult.error;if(accountResult.error)throw accountResult.error;setBranches(branchResult);setFinancialAccounts((accountResult.data||[]) as FinancialAccount[]);const employeeRows=(employeeResult.data||[]) as Employee[];setEmployees(employeeRows);setCommissionDrafts(Object.fromEntries(employeeRows.map(e=>[e.id,String(e.commission_percent)])))
   const startAt=new Date(start+'T00:00:00');const endAt=new Date(end+'T00:00:00');endAt.setDate(endAt.getDate()+1)
   let query=supabase.from('company_pos_sales').select('id,sale_number,branch_id,created_at,subtotal,discount,total,payment_method,status,seller_employee_id,commission_rate,commission_amount,commission_settlement_id').eq('company_id',company.id).gte('created_at',startAt.toISOString()).lt('created_at',endAt.toISOString()).order('created_at',{ascending:false}).limit(10000)
   if(branchId==='__none__')query=query.is('branch_id',null);else if(branchId)query=query.eq('branch_id',branchId)
   const {data,error:queryError}=await query
   if(queryError)throw queryError
   const rows=(data||[]) as Sale[]
   const completed=rows.filter(s=>s.status==='completed')
   const ids=completed.map(s=>s.id)
   let lineItems:Item[]=[]
   for(let offset=0;offset<ids.length;offset+=150){
    const batch=ids.slice(offset,offset+150)
    if(!batch.length)continue
    const {data:part,error:itemError}=await supabase.from('company_pos_sale_items').select('sale_id,product_id,product_name,quantity,unit_price,unit_cost,line_total').eq('company_id',company.id).in('sale_id',batch)
    if(itemError)throw itemError
    lineItems=lineItems.concat((part||[]) as Item[])
   }
   setSales(rows);setItems(lineItems);const {data:settlementRows,error:settlementError}=await supabase.from('company_pos_commission_settlements').select('id,employee_id,branch_id,period_start,period_end,sale_count,total_amount,status,created_at,paid_at,payment_method,payment_reference,cash_transaction_id').eq('company_id',company.id).gte('period_end',start).lte('period_start',end).order('created_at',{ascending:false});if(settlementError)throw settlementError;let visibleSettlements=(settlementRows||[]) as CommissionSettlement[];if(branchId==='__none__')visibleSettlements=visibleSettlements.filter(s=>s.branch_id===null);else if(branchId)visibleSettlements=visibleSettlements.filter(s=>s.branch_id===branchId);setSettlements(visibleSettlements)
  }catch(e){setError(e instanceof Error?e.message:'Não foi possível carregar os relatórios do PDV.')}
  finally{setLoading(false)}
 },[company.id,start,end,branchId])
 useEffect(()=>{void load()},[load])
 const completed=sales.filter(s=>s.status==='completed')
 const cancelled=sales.filter(s=>s.status==='cancelled')
 const revenue=completed.reduce((n,s)=>n+Number(s.total),0)
 const discounts=completed.reduce((n,s)=>n+Number(s.discount),0)
 const cost=items.reduce((n,i)=>n+Number(i.unit_cost)*Number(i.quantity),0)
 const grossProfit=revenue-cost
 const commissionTotal=completed.reduce((n,s)=>n+Number(s.commission_amount||0),0)
 const employeeTotals=useMemo(()=>{const map=new Map<string,{id:string;name:string;total:number;commission:number;count:number}>();for(const sale of completed){if(!sale.seller_employee_id)continue;const employee=employees.find(e=>e.id===sale.seller_employee_id);const name=employee?.name||'Funcionário';const row=map.get(sale.seller_employee_id)||{id:sale.seller_employee_id,name,total:0,commission:0,count:0};row.total+=Number(sale.total);row.commission+=Number(sale.commission_amount||0);row.count++;map.set(sale.seller_employee_id,row)}return [...map.values()].sort((a,b)=>b.total-a.total)},[completed,employees])
 const visibleSettlements=settlements.filter(s=>(!settlementEmployeeFilter||s.employee_id===settlementEmployeeFilter)&&(settlementStatusFilter==='all'||s.status===settlementStatusFilter))\n const pendingSettlements=settlements.filter(s=>s.status==='pending')\n const paidSettlements=settlements.filter(s=>s.status==='paid')\n const pendingCommissionAmount=pendingSettlements.reduce((n,s)=>n+Number(s.total_amount),0)\n const paidCommissionAmount=paidSettlements.reduce((n,s)=>n+Number(s.total_amount),0)\n const soldUnits=items.reduce((n,i)=>n+Number(i.quantity),0)
 const avg=completed.length?revenue/completed.length:0
 const paymentTotals=useMemo(()=>Object.entries(completed.reduce((acc,s)=>{acc[s.payment_method]=(acc[s.payment_method]||0)+Number(s.total);return acc},{} as Record<string,number>)).sort((a,b)=>b[1]-a[1]),[completed])
 const productTotals=useMemo(()=>{const map=new Map<string,{name:string;qty:number;revenue:number;profit:number}>();for(const i of items){const v=map.get(i.product_id||i.product_name)||{name:i.product_name,qty:0,revenue:0,profit:0};v.qty+=Number(i.quantity);v.revenue+=Number(i.line_total);v.profit+=Number(i.line_total)-Number(i.unit_cost)*Number(i.quantity);map.set(i.product_id||i.product_name,v)}return [...map.values()].sort((a,b)=>b.qty-a.qty).slice(0,10)},[items])
 const branchTotals=useMemo(()=>{const map=new Map<string,{name:string;total:number;count:number}>();for(const s of completed){const name=branches.find(b=>b.id===s.branch_id)?.name||(s.branch_id?'Filial':'Matriz / sem filial');const v=map.get(name)||{name,total:0,count:0};v.total+=Number(s.total);v.count++;map.set(name,v)}return [...map.values()].sort((a,b)=>b.total-a.total)},[completed,branches])
 async function closeCommission(employeeId:string){
  if(!supabase)return
  setSettlementBusy(employeeId);setError('');setCommissionNotice('')
  try{
   const {data,error}=await supabase.rpc('create_company_pos_commission_settlement',{p_company_id:company.id,p_employee_id:employeeId,p_branch_id:branchId==='__none__'?null:branchId,p_period_start:start,p_period_end:end,p_idempotency_key:crypto.randomUUID()})
   if(error)throw error
   setCommissionNotice('Fechamento criado. As vendas incluídas foram vinculadas a este fechamento e não serão fechadas novamente.')
   await load()
  }catch(e){setError(e instanceof Error?e.message:'Não foi possível fechar as comissões.')}
  finally{setSettlementBusy(null)}
 }
 function payCommission(settlementId:string){
  setError('');setCommissionNotice('')
  setPaymentDraft({settlementId,method:'pix',accountId:'',reference:''})
 }
 async function submitCommissionPayment(){
  if(!supabase||!paymentDraft)return
  const draft=paymentDraft
  if(!draft.method){setError('Selecione a forma de pagamento.');return}
  const settlement=settlements.find(s=>s.id===draft.settlementId)
  if(!settlement){setError('Fechamento de comissão não encontrado. Atualize o relatório.');return}
  if(!window.confirm('Confirmar o pagamento de '+money(Number(settlement.total_amount))+'? O sistema registrará uma saída no caixa e, se selecionada, atualizará a conta financeira.'))return
  setSettlementBusy(draft.settlementId);setError('');setCommissionNotice('')
  try{
   const {error}=await supabase.rpc('pay_company_pos_commission_settlement',{
    p_company_id:company.id,
    p_settlement_id:draft.settlementId,
    p_payment_method:draft.method,
    p_payment_reference:draft.reference.trim()||null,
    p_financial_account_id:draft.accountId||null
   })
   if(error)throw error
   setPaymentDraft(null)
   setCommissionNotice('Pagamento confirmado e saída registrada no fluxo de caixa. A movimentação foi vinculada à conta escolhida quando informada.')
   await load()
  }catch(e){setError(e instanceof Error?e.message:'Não foi possível confirmar o pagamento e registrar a saída.')}
  finally{setSettlementBusy(null)}
 }
 async function saveCommission(employeeId:string){const value=Number(commissionDrafts[employeeId]);if(!Number.isFinite(value)||value<0||value>100){setError('A comissão deve ficar entre 0% e 100%.');return}setSavingEmployee(employeeId);setError('');setCommissionNotice('');try{const {error}=await supabase!.from('employees').update({commission_percent:value}).eq('company_id',company.id).eq('id',employeeId);if(error)throw error;setEmployees(old=>old.map(e=>e.id===employeeId?{...e,commission_percent:value}:e));setCommissionNotice('Comissão atualizada. A nova taxa será aplicada somente às próximas vendas.')}catch(e){setError(e instanceof Error?e.message:'Não foi possível salvar a comissão.')}finally{setSavingEmployee(null)}}
 return <section className="company-pos-reports">
  <div className="company-panel">
   <div className="company-panel-head"><div><b><BarChart3 size={17}/> Relatórios do PDV</b><small>Vendas, margens, pagamentos e desempenho por filial</small></div><button type="button" className="company-secondary" onClick={()=>void load()} disabled={loading}><RefreshCw size={15}/> Atualizar</button></div>
   <div className="company-pos-report-filters"><label>Data inicial<input type="date" value={start} max={end||undefined} onChange={e=>setStart(e.target.value)}/></label><label>Data final<input type="date" value={end} min={start||undefined} onChange={e=>setEnd(e.target.value)}/></label><label>Filial<select value={branchId} onChange={e=>setBranchId(e.target.value)}><option value="">Todas as unidades</option><option value="__none__">Matriz / sem filial</option>{branches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label></div>
   {error&&<div className="company-error-banner">{error}</div>}{commissionNotice&&<div className="company-notice-banner">{commissionNotice}</div>}
   {loading?<p className="company-empty">Calculando relatórios...</p>:<>
    <div className="company-pos-report-cards">
     <article><span><Wallet size={16}/> Faturamento líquido</span><strong>{money(revenue)}</strong><small>{completed.length} vendas concluídas</small></article>
     <article><span><TrendingUp size={16}/> Lucro bruto estimado</span><strong>{money(grossProfit)}</strong><small>Receita menos custo dos produtos</small></article>
     <article><span><ShoppingBag size={16}/> Ticket médio</span><strong>{money(avg)}</strong><small>{cancelled.length} vendas canceladas</small></article>
     <article><span><Package size={16}/> Itens vendidos</span><strong>{soldUnits.toLocaleString('pt-BR')}</strong><small>Descontos concedidos: {money(discounts)}</small></article>
     <article><span><Wallet size={16}/> Comissões apuradas</span><strong>{money(commissionTotal)}</strong><small>Somente vendas concluídas com funcionário vinculado</small></article>
    </div>
    <div className="company-pos-report-columns">
     <div className="company-pos-report-block"><h4>Vendas por forma de pagamento</h4>{paymentTotals.length?paymentTotals.map(([method,value])=><div className="company-pos-report-row" key={method}><span>{methods[method]||method}</span><b>{money(value)}</b></div>):<p className="company-empty">Sem vendas no período.</p>}</div>
     <div className="company-pos-report-block"><h4>Desempenho por filial</h4>{branchTotals.length?branchTotals.map(b=><div className="company-pos-report-row" key={b.name}><span>{b.name}<small>{b.count} vendas</small></span><b>{money(b.total)}</b></div>):<p className="company-empty">Sem vendas no período.</p>}</div>
    </div>
    <div className="company-pos-report-columns">
     <div className="company-pos-report-block"><h4>Desempenho e comissões por funcionário</h4>{employeeTotals.length?employeeTotals.map(e=><div className="company-pos-report-row" key={e.id}><span>{e.name}<small>{e.count} vendas · Comissão {money(e.commission)}</small></span><b>{money(e.total)}</b></div>):<p className="company-empty">Ainda não há vendas atribuídas a funcionários neste período.</p>}</div>
     <div className="company-pos-report-block"><h4>Configurar comissão por funcionário</h4><p className="company-pos-report-note">Percentual sobre o valor final da venda. A alteração vale para novas vendas; registros anteriores não são recalculados.</p>{employees.filter(e=>e.is_active).length?employees.filter(e=>e.is_active).map(e=><div className="company-pos-commission-edit" key={e.id}><label>{e.name}<small>{e.branch_id?branches.find(b=>b.id===e.branch_id)?.name||'Filial':'Todas as unidades'}</small></label><div><input type="number" min="0" max="100" step="0.25" value={commissionDrafts[e.id]??'0'} onChange={event=>setCommissionDrafts(old=>({...old,[e.id]:event.target.value}))}/><span>%</span><button type="button" className="company-secondary" disabled={savingEmployee===e.id} onClick={()=>void saveCommission(e.id)}>{savingEmployee===e.id?'Salvando':'Salvar'}</button></div></div>):<p className="company-empty">Nenhum funcionário ativo cadastrado.</p>}</div>
    </div>
    <div className="company-pos-report-block"><h4>Comissões · pagamentos e pendências</h4><p className="company-pos-report-note">Acompanhe os valores fechados, pagos e pendentes no período e na unidade selecionados. A confirmação do pagamento também registra a saída no fluxo de caixa.</p>
 <div className="company-pos-report-cards">
  <article><span>Fechamentos pendentes</span><strong>{pendingSettlements.length}</strong><small>{money(pendingCommissionAmount)} a pagar</small></article>
  <article><span>Fechamentos pagos</span><strong>{paidSettlements.length}</strong><small>{money(paidCommissionAmount)} pagos</small></article>
  <article><span>Total de comissões fechadas</span><strong>{money(pendingCommissionAmount+paidCommissionAmount)}</strong><small>{settlements.length} fechamentos no período</small></article>
 </div>
 <div className="company-pos-report-filters">
  <label>Funcionário<select value={settlementEmployeeFilter} onChange={event=>setSettlementEmployeeFilter(event.target.value)}><option value="">Todos os funcionários</option>{employees.map(e=><option key={e.id} value={e.id}>{e.name}{e.is_active?'':' (inativo)'}</option>)}</select></label>
  <label>Status<select value={settlementStatusFilter} onChange={event=>setSettlementStatusFilter(event.target.value as typeof settlementStatusFilter)}><option value="all">Todos</option><option value="pending">Pendentes</option><option value="paid">Pagos</option></select></label>
 </div>{employeeTotals.length?employeeTotals.map(e=>{const employee=employees.find(x=>x.id===e.id);const pending=completed.filter(s=>s.seller_employee_id===employee?.id&&!s.commission_settlement_id&&Number(s.commission_amount)>0).reduce((n,s)=>n+Number(s.commission_amount),0);return <div className="company-pos-report-row" key={e.id}><span>{e.name}<small>Comissão ainda não fechada: {money(pending)}</small></span><button type="button" className="company-secondary" disabled={!employee||!branchId||pending<=0||settlementBusy===employee?.id} onClick={()=>employee&&void closeCommission(employee.id)}>{settlementBusy===employee?.id?'Fechando':'Fechar período'}</button></div>}):<p className="company-empty">Nenhuma comissão pendente para fechar neste período.</p>}{paymentDraft&&<form className="company-form" onSubmit={event=>{event.preventDefault();void submitCommissionPayment()}}>
 <h4>Confirmar pagamento da comissão</h4>
 <p className="company-pos-report-note">Ao confirmar, o sistema cria uma única saída no fluxo de caixa. Se houver caixa aberto na unidade do fechamento, a saída também ficará vinculada a ele.</p>
 <div className="company-form-grid">
  <label>Forma de pagamento<select required value={paymentDraft.method} onChange={event=>setPaymentDraft(old=>old?{...old,method:event.target.value}:old)}><option value="pix">PIX</option><option value="cash">Dinheiro</option><option value="debit_card">Cartão de débito</option><option value="credit_card">Cartão de crédito</option><option value="bank_transfer">Transferência</option><option value="boleto">Boleto</option><option value="other">Outro</option></select></label>
  <label>Conta financeira (opcional)<select value={paymentDraft.accountId} onChange={event=>setPaymentDraft(old=>old?{...old,accountId:event.target.value}:old)}><option value="">Não vincular conta</option>{financialAccounts.filter(a=>!a.branch_id||a.branch_id===settlements.find(s=>s.id===paymentDraft.settlementId)?.branch_id).map(a=><option key={a.id} value={a.id}>{a.account_name} · {a.bank_name}</option>)}</select></label>
  <label>Comprovante / referência (opcional)<input maxLength={160} value={paymentDraft.reference} onChange={event=>setPaymentDraft(old=>old?{...old,reference:event.target.value}:old)} placeholder="ID do PIX, número do comprovante..."/></label>
 </div>
 <div className="company-form-actions"><button type="button" className="company-secondary" onClick={()=>setPaymentDraft(null)}>Cancelar</button><button type="submit" className="company-primary" disabled={settlementBusy===paymentDraft.settlementId}>{settlementBusy===paymentDraft.settlementId?'Registrando...':'Confirmar pagamento e lançar saída'}</button></div>
 </form>}{visibleSettlements.length>0&&<div className="company-table-wrap"><table><thead><tr><th>FUNCIONÁRIO</th><th>PERÍODO</th><th>VENDAS</th><th>VALOR</th><th>STATUS</th><th>SAÍDA NO CAIXA</th><th>AÇÃO</th></tr></thead><tbody>{visibleSettlements.map(s=><tr key={s.id}><td>{employees.find(e=>e.id===s.employee_id)?.name||'Funcionário'}</td><td>{s.period_start} a {s.period_end}</td><td>{s.sale_count}</td><td>{money(Number(s.total_amount))}</td><td>{s.status==='paid'?'Pago':'Pendente'}</td><td>{s.cash_transaction_id?'Registrada':'—'}</td><td>{s.status==='pending'?<button type="button" className="company-secondary" disabled={settlementBusy===s.id} onClick={()=>void payCommission(s.id)}>{settlementBusy===s.id?'Salvando':'Confirmar pagamento'}</button>:<small>{s.payment_method||'Pago'} · {s.paid_at?new Date(s.paid_at).toLocaleDateString('pt-BR'):''}</small>}</td></tr>)}</tbody></table></div>}</div>
    <div className="company-pos-report-block"><h4>10 produtos mais vendidos</h4>{productTotals.length?<div className="company-table-wrap"><table><thead><tr><th>PRODUTO</th><th>QTD.</th><th>FATURAMENTO</th><th>LUCRO BRUTO*</th></tr></thead><tbody>{productTotals.map(p=><tr key={p.name}><td>{p.name}</td><td>{p.qty}</td><td>{money(p.revenue)}</td><td>{money(p.profit)}</td></tr>)}</tbody></table></div>:<p className="company-empty">Sem itens vendidos no período.</p>}<small className="company-pos-report-note">* Lucro bruto por produto antes da distribuição dos descontos da venda. O lucro geral considera os descontos concedidos.</small></div>
   </>}
  </div>
 </section>
}
