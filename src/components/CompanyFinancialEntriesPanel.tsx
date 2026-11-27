import {useCallback,useEffect,useState,type FormEvent} from 'react'
import {createPortal} from 'react-dom'
import {Plus,RefreshCw,ArrowDownCircle,ArrowUpCircle,CheckCircle2} from 'lucide-react'
import {createFinancialEntry,listFinancialEntries,settleFinancialEntry,type FinancialEntry} from '../lib/company-financial-entries'
import {listCompanyBranches,type CompanyBranch,type Company} from '../lib/company-data'
import {supabase} from '../lib/supabase'
const money=(n:number)=>Number(n||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})
const today=()=>{const d=new Date();return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10)}
export default function CompanyFinancialEntriesPanel({company}:{company:Company}){
 const [entries,setEntries]=useState<FinancialEntry[]>([]),[branches,setBranches]=useState<CompanyBranch[]>([]),[accounts,setAccounts]=useState<{id:string;account_name:string;bank_name:string;branch_id:string|null}[]>([])
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[show,setShow]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('')
 const [entryType,setEntryType]=useState<'payable'|'receivable'>('payable'),[branchId,setBranchId]=useState('')
 const [category,setCategory]=useState('Despesas gerais'),[financialAccountId,setFinancialAccountId]=useState(''),[description,setDescription]=useState(''),[counterparty,setCounterparty]=useState(''),[amount,setAmount]=useState(''),[dueDate,setDueDate]=useState(today()),[notes,setNotes]=useState('')
 const [filter,setFilter]=useState<'all'|'open'|'paid'>('all')
 const [search,setSearch]=useState('')
 const [settling,setSettling]=useState<FinancialEntry|null>(null),[settleMethod,setSettleMethod]=useState('pix'),[settleAccountId,setSettleAccountId]=useState('')
 const load=useCallback(async()=>{setLoading(true);setError('');try{const [e,b,a]=await Promise.all([listFinancialEntries(company.id),listCompanyBranches(company.id),supabase!.from('company_financial_accounts').select('id,account_name,bank_name,branch_id').eq('company_id',company.id).eq('is_active',true).order('account_name')]);if(a.error)throw a.error;setEntries(e);setBranches(b);setAccounts(a.data||[])}catch(x){setError(x instanceof Error?x.message:'Erro ao carregar lançamentos.')}finally{setLoading(false)}},[company.id])
 useEffect(()=>{void load()},[load])
 const visible=entries.filter(e=>(filter==='all'||e.status===filter)&&(!search.trim()||[e.counterparty,e.description,e.category,e.notes,String(e.source_order_number||'')].join(' ').toLowerCase().includes(search.trim().toLowerCase())))
 const openPay=entries.filter(e=>e.entry_type==='payable'&&e.status==='open').reduce((s,e)=>s+Number(e.amount),0)
 const openRec=entries.filter(e=>e.entry_type==='receivable'&&e.status==='open').reduce((s,e)=>s+Number(e.amount),0)
 async function submit(e:FormEvent){e.preventDefault();setBusy(true);setError('');setNotice('');try{await createFinancialEntry({companyId:company.id,branchId:branchId||null,entryType,category,description,counterparty,amount:Number(amount),dueDate,notes,financialAccountId});setDescription('');setCounterparty('');setAmount('');setNotes('');setFinancialAccountId('');setShow(false);setNotice('Lançamento financeiro criado.');await load()}catch(x){setError(x instanceof Error?x.message:'Falha ao salvar.')}finally{setBusy(false)}}
 async function settle(){if(!settling)return;setBusy(true);setError('');setNotice('');try{await settleFinancialEntry(company.id,settling.id,settleMethod,settleAccountId||null);setNotice('Lançamento baixado e movimento incluído na conta selecionada.');setSettling(null);setSettleAccountId('');await load()}catch(x){setError(x instanceof Error?x.message:'Falha ao baixar lançamento.')}finally{setBusy(false)}}
 const entryModal = show ? (
  <div className="company-financial-entry-backdrop" role="presentation" onClick={()=>!busy&&setShow(false)}>
   <form className="company-form company-financial-entry-modal" role="dialog" aria-modal="true" aria-labelledby="financial-entry-title" onClick={e=>e.stopPropagation()} onSubmit={submit}>
    <div className="company-financial-entry-modal-head"><h3 id="financial-entry-title">Novo lançamento</h3><button type="button" className="company-secondary company-financial-entry-close" aria-label="Fechar formulário" disabled={busy} onClick={()=>setShow(false)}>×</button></div>
    <div className="company-form-grid">
     <label>Tipo<select value={entryType} onChange={e=>setEntryType(e.target.value as 'payable'|'receivable')}><option value="payable">Conta a pagar</option><option value="receivable">Conta a receber</option></select></label>
     <label>Filial<select value={branchId} onChange={e=>setBranchId(e.target.value)}><option value="">Matriz / não definida</option>{branches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
     <label>Conta bancária<select required value={financialAccountId} onChange={e=>setFinancialAccountId(e.target.value)}><option value="">Selecione a conta cadastrada</option>{accounts.filter(a=>!a.branch_id||a.branch_id===branchId||(!branchId&&!a.branch_id)).map(a=><option key={a.id} value={a.id}>{a.account_name} · {a.bank_name}</option>)}</select></label>
     <label>Categoria<input required value={category} onChange={e=>setCategory(e.target.value)}/></label>
     <label>Descrição<input required value={description} onChange={e=>setDescription(e.target.value)}/></label>
     <label>Fornecedor / cliente<input value={counterparty} onChange={e=>setCounterparty(e.target.value)}/></label>
     <label>Valor (R$)<input required type="number" min="0.01" step="0.01" value={amount} onChange={e=>setAmount(e.target.value)}/></label>
     <label>Vencimento<input required type="date" value={dueDate} onChange={e=>setDueDate(e.target.value)}/></label>
    </div>
    <label>Observações<input value={notes} onChange={e=>setNotes(e.target.value)}/></label>
    <div className="company-form-actions"><button type="button" className="company-secondary" disabled={busy} onClick={()=>setShow(false)}>Cancelar</button><button className="company-primary" disabled={busy}>{busy?'Salvando...':'Salvar lançamento'}</button></div>
   </form>
  </div>
 ) : null
 return <section className="company-panel">
  <div className="company-panel-head"><div><b>Contas a pagar e receber</b><small>{entries.length} lançamentos</small></div><button className="company-primary" onClick={()=>setShow(v=>!v)}><Plus size={16}/> Novo lançamento</button></div>
  {error&&<div className="company-error-banner">{error}</div>}{notice&&<div className="company-notice-banner">{notice}</div>}
  <div className="company-finance-summary"><article><small>A pagar em aberto</small><b>{money(openPay)}</b></article><article><small>A receber em aberto</small><b>{money(openRec)}</b></article><article><small>Saldo previsto</small><b>{money(openRec-openPay)}</b></article></div>
  {window.matchMedia('(max-width: 760px)').matches && entryModal ? createPortal(entryModal, document.body) : entryModal}
  <div className="company-panel-head"><div><b>Movimentações</b><small>Pesquise pelo nome do cliente, número da OS ou origem da fatura</small></div><div className="company-inline-actions"><input className="company-finance-search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar cliente ou OS..."/><select value={filter} onChange={e=>setFilter(e.target.value as typeof filter)}><option value="all">Todas</option><option value="open">Em aberto</option><option value="paid">Pagas / recebidas</option></select><button className="company-secondary" onClick={()=>void load()}><RefreshCw size={15}/></button></div></div>
  {loading?<p className="company-empty">Carregando...</p>:visible.length===0?<p className="company-empty">Nenhum lançamento encontrado.</p>:<div className="company-table-wrap"><table><thead><tr><th>TIPO</th><th>CLIENTE / DESCRIÇÃO</th><th>ORIGEM DA FATURA</th><th>VENCIMENTO</th><th>VALOR</th><th>STATUS</th><th>AÇÃO</th></tr></thead><tbody>{visible.map(item=><tr key={item.id}><td>{item.entry_type==='payable'?<span><ArrowUpCircle size={14}/> A pagar</span>:<span><ArrowDownCircle size={14}/> A receber</span>}</td><td><b>{item.counterparty||'—'}</b><small>{item.description} · {item.category}</small></td><td>{item.source_order_number?'OS #'+item.source_order_number:'Lançamento manual'}</td><td>{new Date(item.due_date+'T12:00:00').toLocaleDateString('pt-BR')}</td><td><b>{money(item.amount)}</b></td><td>{item.status==='open'?'Em aberto':item.status==='paid'?'Pago / recebido':'Cancelado'}</td><td>{item.status==='open'?<button className="company-secondary company-small-action" disabled={busy} onClick={()=>{setSettling(item);setSettleMethod('pix');setSettleAccountId(item.financial_account_id||'')}}><CheckCircle2 size={14}/> Baixar</button>:'—'}</td></tr>)}</tbody></table></div>}
   {settling&&<div className="company-modal-backdrop"><div className="company-form company-payment-modal"><h3>Baixar lançamento</h3><p>{settling.entry_type==='payable'?'Pagamento':'Recebimento'} · {settling.description} · {money(Number(settling.amount))}</p><label>Forma de pagamento<select value={settleMethod} onChange={e=>setSettleMethod(e.target.value)}><option value="pix">PIX</option><option value="cash">Dinheiro</option><option value="debit_card">Cartão de débito</option><option value="credit_card">Cartão de crédito</option><option value="bank_transfer">Transferência</option><option value="boleto">Boleto</option><option value="other">Outro</option></select></label><label>Conta financeira<select value={settleAccountId} onChange={e=>setSettleAccountId(e.target.value)}><option value="">Selecione uma conta</option>{accounts.filter(a=>!a.branch_id||a.branch_id===settling.branch_id).map(a=><option key={a.id} value={a.id}>{a.account_name} · {a.bank_name}</option>)}</select></label><div className="company-form-actions"><button type="button" className="company-secondary" onClick={()=>setSettling(null)}>Cancelar</button><button type="button" className="company-primary" disabled={busy||!settleAccountId} onClick={()=>void settle()}>{busy?'Processando...':'Confirmar baixa'}</button></div></div></div>}
</section>
}
