import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Building2, ClipboardList, Users, Package, Truck, ShoppingCart, Wallet, Plus, RefreshCw, LogOut } from 'lucide-react'
import CompanyInventoryPanel from './CompanyInventoryPanel'
import CompanySuppliersPanel from './CompanySuppliersPanel'
import CompanyPurchasesPanel from './CompanyPurchasesPanel'
import CompanyCashPanel from './CompanyCashPanel'
import { recordCompanyServiceOrderPayment, type PaymentMethod } from '../lib/company-service-order-payments'
import { listCompanyBranches, listCompanyCustomers, saveCompanyCustomer, type Company, type CompanyBranch, type CompanyCustomer, type CompanyRole } from '../lib/company-data'
import { createCompanyServiceOrder, listCompanyServiceOrders, updateCompanyServiceOrderStatus, type CompanyServiceOrder } from '../lib/company-service-orders'

type Props = { company: Company; role: CompanyRole; email: string; onSignOut: () => void }
const statusLabels: Record<string,string> = {received:'Recebido',diagnosis:'Em diagnóstico',waiting_approval:'Aguardando aprovação',approved:'Aprovado',in_repair:'Em conserto',waiting_parts:'Aguardando peça',ready:'Pronto',delivered:'Entregue',cancelled:'Cancelado'}
const statusFlow = ['received','diagnosis','waiting_approval','approved','waiting_parts','in_repair','ready','delivered','cancelled']
const money = (n:number) => Number(n||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})

export default function CompanyWorkspace({company,role,email,onSignOut}:Props) {
  const [tab,setTab] = useState<'orders'|'customers'|'inventory'|'suppliers'|'purchases'|'cash'>('orders')
  const [branches,setBranches] = useState<CompanyBranch[]>([])
  const [branchId,setBranchId] = useState('')
  const [customers,setCustomers] = useState<CompanyCustomer[]>([])
  const [orders,setOrders] = useState<CompanyServiceOrder[]>([])
  const [loading,setLoading] = useState(true)
  const [busy,setBusy] = useState(false)
  const [error,setError] = useState('')
  const [notice,setNotice] = useState('')
  const [showOrder,setShowOrder] = useState(false)
  const [showCustomer,setShowCustomer] = useState(false)
  const [paymentOrder,setPaymentOrder] = useState<CompanyServiceOrder|null>(null)
  const [paymentAmount,setPaymentAmount] = useState('0')
  const [paymentMethod,setPaymentMethod] = useState<PaymentMethod>('pix')
  const [paymentNotes,setPaymentNotes] = useState('')
  const [customerForm,setCustomerForm] = useState({name:'',phone:'',email:'',document:'',notes:''})
  const [orderForm,setOrderForm] = useState({customerId:'',deviceType:'Celular',brand:'',model:'',color:'',serial:'',issue:'',condition:'',accessories:'',priority:'normal' as 'low'|'normal'|'high'|'urgent',price:'0',promisedAt:''})

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const [b,c,o] = await Promise.all([
        listCompanyBranches(company.id),
        listCompanyCustomers(company.id),
        listCompanyServiceOrders({companyId:company.id,branchId:branchId||null,limit:250}),
      ])
      setBranches(b); setCustomers(c); setOrders(o)
    } catch(e) { setError(e instanceof Error?e.message:'Erro ao carregar dados.') }
    finally { setLoading(false) }
  },[company.id,branchId])

  useEffect(()=>{void load()},[load])

  async function submitCustomer(event:FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setNotice('')
    try {
      await saveCompanyCustomer({companyId:company.id,branchId:branchId||null,...customerForm})
      setCustomerForm({name:'',phone:'',email:'',document:'',notes:''})
      setShowCustomer(false); setNotice('Cliente cadastrado.'); await load()
    } catch(e) {setError(e instanceof Error?e.message:'Falha ao cadastrar cliente.')}
    finally {setBusy(false)}
  }

  async function submitOrder(event:FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setNotice('')
    try {
      const created = await createCompanyServiceOrder({
        companyId:company.id,branchId:branchId||null,customerId:orderForm.customerId||null,
        deviceType:orderForm.deviceType,deviceBrand:orderForm.brand,deviceModel:orderForm.model,
        deviceColor:orderForm.color,serialNumber:orderForm.serial,reportedIssue:orderForm.issue,
        intakeCondition:orderForm.condition,includedAccessories:orderForm.accessories,
        priority:orderForm.priority,estimatedPrice:Number(orderForm.price||0),
        promisedAt:orderForm.promisedAt?new Date(orderForm.promisedAt).toISOString():null,
      })
      setShowOrder(false); setNotice('OS #'+created.order_number+' criada com sucesso.')
      setOrderForm({customerId:'',deviceType:'Celular',brand:'',model:'',color:'',serial:'',issue:'',condition:'',accessories:'',priority:'normal',price:'0',promisedAt:''})
      await load()
    } catch(e) {setError(e instanceof Error?e.message:'Falha ao criar ordem de serviço.')}
    finally {setBusy(false)}
  }

  async function submitOrderPayment(event:FormEvent) {
    event.preventDefault(); if(!paymentOrder)return; setBusy(true); setError(''); setNotice('')
    try { await recordCompanyServiceOrderPayment({companyId:company.id,serviceOrderId:paymentOrder.id,amount:Number(paymentAmount),method:paymentMethod,notes:paymentNotes}); setPaymentOrder(null); setPaymentNotes(''); setNotice('Pagamento registrado e lançado no fluxo de caixa.'); await load() }
    catch(e) {setError(e instanceof Error?e.message:'Falha ao registrar pagamento.')}
    finally {setBusy(false)}
  }

  async function changeStatus(order:CompanyServiceOrder,status:string) {
    setBusy(true); setError('')
    try { await updateCompanyServiceOrderStatus({companyId:company.id,orderId:order.id,status}); await load() }
    catch(e) {setError(e instanceof Error?e.message:'Não foi possível atualizar o status.')}
    finally {setBusy(false)}
  }

  return <div className="company-app">
    <aside className="company-sidebar">
      <div className="company-logo"><span><Building2/></span><div><b>EDERTEC <i>OS PRO</i></b><small>GESTÃO DE ASSISTÊNCIAS</small></div></div>
      <div className="company-current">{company.name}</div>
      <nav><button className={tab==='orders'?'active':''} onClick={()=>setTab('orders')}><ClipboardList size={17}/> Ordens de serviço</button><button className={tab==='customers'?'active':''} onClick={()=>setTab('customers')}><Users size={17}/> Clientes</button><button className={tab==='inventory'?'active':''} onClick={()=>setTab('inventory')}><Package size={17}/> Estoque</button><button className={tab==='suppliers'?'active':''} onClick={()=>setTab('suppliers')}><Truck size={17}/> Fornecedores</button><button className={tab==='purchases'?'active':''} onClick={()=>setTab('purchases')}><ShoppingCart size={17}/> Compras</button><button className={tab==='cash'?'active':''} onClick={()=>setTab('cash')}><Wallet size={17}/> Financeiro</button></nav>
      <div className="company-user"><b>{email}</b><small>Perfil: {role}</small><button onClick={onSignOut}><LogOut size={15}/> Sair</button></div>
    </aside>
    <main className="company-main">
      <header className="company-top"><div><small>PAINEL DA ASSISTÊNCIA</small><h1>{tab==='orders'?'Ordens de serviço':tab==='customers'?'Clientes':tab==='inventory'?'Estoque e produtos':tab==='suppliers'?'Fornecedores':tab==='purchases'?'Compras e recebimento':'Financeiro'}</h1></div><div className="company-top-actions"><select value={branchId} onChange={e=>setBranchId(e.target.value)}><option value="">Todas as filiais</option>{branches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select><button className="company-icon-button" onClick={()=>void load()} title="Atualizar"><RefreshCw size={16}/></button></div></header>
      {error&&<div className="company-error-banner">{error}</div>}{notice&&<div className="company-notice-banner">{notice}</div>}
      {tab==='orders'&&<section className="company-panel">
        <div className="company-panel-head"><div><b>Ordens cadastradas</b><small>{orders.length} registros nesta visualização</small></div><button className="company-primary" onClick={()=>setShowOrder(v=>!v)}><Plus size={16}/> Nova OS</button></div>
        {showOrder&&<form className="company-form" onSubmit={submitOrder}>
          <h3>Dados do atendimento</h3>
          <label>Cliente<select value={orderForm.customerId} onChange={e=>setOrderForm({...orderForm,customerId:e.target.value})}><option value="">Cliente não selecionado</option>{customers.map(c=><option key={c.id} value={c.id}>{c.name} · {c.phone||'sem telefone'}</option>)}</select></label>
          <div className="company-form-grid"><label>Tipo<input value={orderForm.deviceType} onChange={e=>setOrderForm({...orderForm,deviceType:e.target.value})}/></label><label>Marca<input value={orderForm.brand} onChange={e=>setOrderForm({...orderForm,brand:e.target.value})}/></label><label>Modelo<input required value={orderForm.model} onChange={e=>setOrderForm({...orderForm,model:e.target.value})}/></label><label>Cor<input value={orderForm.color} onChange={e=>setOrderForm({...orderForm,color:e.target.value})}/></label><label>IMEI / Série<input value={orderForm.serial} onChange={e=>setOrderForm({...orderForm,serial:e.target.value})}/></label><label>Prioridade<select value={orderForm.priority} onChange={e=>setOrderForm({...orderForm,priority:e.target.value as typeof orderForm.priority})}><option value="low">Baixa</option><option value="normal">Normal</option><option value="high">Alta</option><option value="urgent">Urgente</option></select></label></div>
          <label>Defeito informado<textarea required rows={3} value={orderForm.issue} onChange={e=>setOrderForm({...orderForm,issue:e.target.value})}/></label>
          <div className="company-form-grid"><label>Condição de entrada<input value={orderForm.condition} onChange={e=>setOrderForm({...orderForm,condition:e.target.value})}/></label><label>Acessórios<input value={orderForm.accessories} onChange={e=>setOrderForm({...orderForm,accessories:e.target.value})}/></label><label>Valor estimado (R$)<input type="number" min="0" step="0.01" value={orderForm.price} onChange={e=>setOrderForm({...orderForm,price:e.target.value})}/></label><label>Previsão de entrega<input type="datetime-local" value={orderForm.promisedAt} onChange={e=>setOrderForm({...orderForm,promisedAt:e.target.value})}/></label></div>
          <div className="company-form-actions"><button type="button" className="company-secondary" onClick={()=>setShowOrder(false)}>Cancelar</button><button className="company-primary" disabled={busy}>{busy?'Salvando...':'Criar ordem de serviço'}</button></div>
        </form>}
        {loading?<p className="company-empty">Carregando...</p>:orders.length===0?<p className="company-empty">Nenhuma OS cadastrada nesta filial.</p>:<div className="company-table-wrap"><table><thead><tr><th>OS</th><th>CLIENTE</th><th>APARELHO</th><th>DEFEITO</th><th>VALOR</th><th>STATUS</th><th>PAGAMENTO</th></tr></thead><tbody>{orders.map(o=><tr key={o.id}><td><b>#{o.order_number}</b><small>{new Date(o.received_at).toLocaleDateString('pt-BR')}</small></td><td>{o.customers?.name||'—'}<small>{o.customers?.phone||''}</small></td><td>{[o.device_brand,o.device_model].filter(Boolean).join(' ')||o.device_type||'—'}<small>{o.serial_number||''}</small></td><td>{o.reported_issue}</td><td>{money(o.estimated_price)}</td><td><select disabled={busy} value={o.status} onChange={e=>void changeStatus(o,e.target.value)}>{statusFlow.map(s=><option key={s} value={s}>{statusLabels[s]}</option>)}</select></td><td><button className="company-secondary company-small-action" disabled={busy||o.status==='cancelled'} onClick={()=>{setPaymentOrder(o);setPaymentAmount(String(o.final_price>0?o.final_price:o.estimated_price));setPaymentMethod('pix')}}>Receber</button></td></tr>)}</tbody></table></div>}
      </section>}
      {paymentOrder&&<div className="company-modal-backdrop"><form className="company-form company-payment-modal" onSubmit={submitOrderPayment}><h3>Receber pagamento · OS #{paymentOrder.order_number}</h3><p>{paymentOrder.customers?.name||'Cliente não informado'} · {[paymentOrder.device_brand,paymentOrder.device_model].filter(Boolean).join(' ')}</p><label>Valor recebido (R$)<input required type="number" min="0.01" step="0.01" value={paymentAmount} onChange={e=>setPaymentAmount(e.target.value)}/></label><label>Forma de pagamento<select value={paymentMethod} onChange={e=>setPaymentMethod(e.target.value as PaymentMethod)}><option value="pix">PIX</option><option value="cash">Dinheiro</option><option value="debit_card">Cartão de débito</option><option value="credit_card">Cartão de crédito</option><option value="bank_transfer">Transferência</option><option value="boleto">Boleto</option><option value="other">Outro</option></select></label><label>Observações<input value={paymentNotes} onChange={e=>setPaymentNotes(e.target.value)}/></label><div className="company-form-actions"><button type="button" className="company-secondary" onClick={()=>setPaymentOrder(null)}>Cancelar</button><button className="company-primary" disabled={busy}>{busy?'Registrando...':'Confirmar recebimento'}</button></div></form></div>}
      {tab==='inventory'&&<CompanyInventoryPanel company={company}/>}{tab==='suppliers'&&<CompanySuppliersPanel company={company}/>}{tab==='purchases'&&<CompanyPurchasesPanel company={company}/>}{tab==='cash'&&<CompanyCashPanel company={company}/>}
      {tab==='customers'&&<section className="company-panel">
        <div className="company-panel-head"><div><b>Cadastro de clientes</b><small>{customers.length} clientes cadastrados</small></div><button className="company-primary" onClick={()=>setShowCustomer(v=>!v)}><Plus size={16}/> Novo cliente</button></div>
        {showCustomer&&<form className="company-form" onSubmit={submitCustomer}><div className="company-form-grid"><label>Nome<input required value={customerForm.name} onChange={e=>setCustomerForm({...customerForm,name:e.target.value})}/></label><label>Telefone<input value={customerForm.phone} onChange={e=>setCustomerForm({...customerForm,phone:e.target.value})}/></label><label>E-mail<input type="email" value={customerForm.email} onChange={e=>setCustomerForm({...customerForm,email:e.target.value})}/></label><label>CPF / CNPJ<input value={customerForm.document} onChange={e=>setCustomerForm({...customerForm,document:e.target.value})}/></label></div><label>Observações<input value={customerForm.notes} onChange={e=>setCustomerForm({...customerForm,notes:e.target.value})}/></label><div className="company-form-actions"><button type="button" className="company-secondary" onClick={()=>setShowCustomer(false)}>Cancelar</button><button className="company-primary" disabled={busy}>Salvar cliente</button></div></form>}
        {loading?<p className="company-empty">Carregando...</p>:customers.length===0?<p className="company-empty">Nenhum cliente cadastrado.</p>:<div className="company-table-wrap"><table><thead><tr><th>NOME</th><th>TELEFONE</th><th>E-MAIL</th><th>DOCUMENTO</th></tr></thead><tbody>{customers.map(c=><tr key={c.id}><td>{c.name}</td><td>{c.phone||'—'}</td><td>{c.email||'—'}</td><td>{c.document||'—'}</td></tr>)}</tbody></table></div>}
      </section>}
      <footer className="company-footer">Dados protegidos por políticas de acesso do banco · {company.name}</footer>
    </main>
  </div>
}
