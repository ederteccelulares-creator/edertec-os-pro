import {useCallback,useEffect,useMemo,useState,type FormEvent} from 'react'
import {ArrowDownCircle,ArrowUpCircle,Plus,RefreshCw,Wallet} from 'lucide-react'
import {createCompanyCashTransaction,listCompanyCashTransactions,type CashTransaction} from '../lib/company-cash'
import {listCompanyBranches,type Company,type CompanyBranch} from '../lib/company-data'
const money=(n:number)=>Number(n||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})
const methods=[['pix','PIX'],['cash','Dinheiro'],['debit_card','Cartão de débito'],['credit_card','Cartão de crédito'],['bank_transfer','Transferência'],['boleto','Boleto'],['other','Outro']]
export default function CompanyCashPanel({company}:{company:Company}){
 const [rows,setRows]=useState<CashTransaction[]>([]),[branches,setBranches]=useState<CompanyBranch[]>([])
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[show,setShow]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('')
 const [direction,setDirection]=useState<'in'|'out'>('in'),[branchId,setBranchId]=useState(''),[category,setCategory]=useState('Serviços'),[description,setDescription]=useState(''),[amount,setAmount]=useState(''),[method,setMethod]=useState('pix')
 const load=useCallback(async()=>{setLoading(true);setError('');try{const [r,b]=await Promise.all([listCompanyCashTransactions(company.id),listCompanyBranches(company.id)]);setRows(r);setBranches(b)}catch(e){setError(e instanceof Error?e.message:'Erro ao carregar fluxo de caixa.')}finally{setLoading(false)}},[company.id])
 useEffect(()=>{void load()},[load])
 const totals=useMemo(()=>rows.reduce((a,r)=>{if(r.direction==='in')a.income+=Number(r.amount);else a.expense+=Number(r.amount);return a},{income:0,expense:0}),[rows])
 async function submit(e:FormEvent){e.preventDefault();setBusy(true);setError('');setNotice('');try{await createCompanyCashTransaction({companyId:company.id,branchId:branchId||null,direction,category,description,amount:Number(amount),paymentMethod:method});setDescription('');setAmount('');setShow(false);setNotice('Movimentação registrada.');await load()}catch(e){setError(e instanceof Error?e.message:'Falha ao registrar movimentação.')}finally{setBusy(false)}}
 return <section className="company-panel">
  <div className="company-panel-head"><div><b>Fluxo de caixa</b><small>Entradas e saídas registradas manualmente</small></div><button className="company-primary" onClick={()=>setShow(v=>!v)}><Plus size={16}/> Lançar movimentação</button></div>
  {error&&<div className="company-error-banner">{error}</div>}{notice&&<div className="company-notice-banner">{notice}</div>}
  <div className="company-cash-stats"><article><ArrowDownCircle/><small>Entradas listadas</small><b>{money(totals.income)}</b></article><article><ArrowUpCircle/><small>Saídas listadas</small><b>{money(totals.expense)}</b></article><article><Wallet/><small>Saldo líquido listado</small><b>{money(totals.income-totals.expense)}</b></article></div>
  {show&&<form className="company-form" onSubmit={submit}><h3>Nova movimentação</h3><div className="company-form-grid">
   <label>Tipo<select value={direction} onChange={e=>setDirection(e.target.value as 'in'|'out')}><option value="in">Entrada</option><option value="out">Saída</option></select></label>
   <label>Filial<select value={branchId} onChange={e=>setBranchId(e.target.value)}><option value="">Não especificada</option>{branches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
   <label>Categoria<input required value={category} onChange={e=>setCategory(e.target.value)} placeholder="Ex.: Serviços, peças, aluguel"/></label>
   <label>Valor (R$)<input required type="number" min="0.01" step="0.01" value={amount} onChange={e=>setAmount(e.target.value)}/></label>
   <label>Forma de pagamento<select value={method} onChange={e=>setMethod(e.target.value)}>{methods.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
   <label className="company-cash-description">Descrição<input required value={description} onChange={e=>setDescription(e.target.value)} placeholder="Descreva a movimentação"/></label>
  </div><div className="company-form-actions"><button type="button" className="company-secondary" onClick={()=>setShow(false)}>Cancelar</button><button className="company-primary" disabled={busy}>{busy?'Salvando...':'Registrar'}</button></div></form>}
  <div className="company-panel-head company-cash-history"><div><b>Últimas movimentações</b><small>{rows.length} lançamentos</small></div><button className="company-secondary" onClick={()=>void load()}><RefreshCw size={14}/> Atualizar</button></div>
  {loading?<p className="company-empty">Carregando...</p>:rows.length===0?<p className="company-empty">Nenhuma movimentação registrada.</p>:<div className="company-table-wrap"><table><thead><tr><th>DATA</th><th>DESCRIÇÃO</th><th>CATEGORIA</th><th>FORMA</th><th>VALOR</th></tr></thead><tbody>{rows.map(r=><tr key={r.id}><td>{new Date(r.occurred_at).toLocaleString('pt-BR')}</td><td>{r.description}</td><td>{r.category}</td><td>{methods.find(m=>m[0]===r.payment_method)?.[1]||'—'}</td><td className={r.direction==='in'?'cash-in':'cash-out'}>{r.direction==='in'?'+ ':'− '}{money(r.amount)}</td></tr>)}</tbody></table></div>}
  <p className="company-inventory-note">Resumo calculado sobre os últimos 300 lançamentos carregados. Pagamentos de OS e contas a pagar/receber ainda serão integrados automaticamente nesta tela.</p>
 </section>
}
