import { useEffect, useState } from 'react'
import { Building2, ClipboardList, LogOut, Plus, RefreshCw, Smartphone, Users, Boxes, ArrowDownUp, Wallet } from 'lucide-react'
import { changeInventoryStock, createInventoryItem, createFinancialEntry, createServiceOrderWithDevice, listBranches, listCustomers, listFinancialEntries, listInventory, listServiceOrderEvents, listServiceOrders, saveCustomer, updateFinancialEntryStatus, updateServiceOrderStatus } from '../lib/tenant-data'
import type { Organization, Branch } from '../lib/supabase'
import type { ServiceOrderStatus } from '../lib/tenant-data'

type Props = { organization: Organization; role: import('../lib/supabase').OrganizationRole; email: string; onSignOut: () => void }
type Customer = { id: string; name: string; phone: string }
type Order = { id: string; order_number: number; status: string; reported_issue: string; estimated_amount: number; received_at: string; accessories?: string | null; physical_condition?: string | null; diagnosis?: string | null; customers?: { name: string; phone: string } | null; devices?: { brand: string; model: string; imei?: string | null } | null }

const statusLabels: Record<string, string> = {
  received: 'Recebido', diagnosing: 'Em diagnóstico', waiting_approval: 'Aguardando aprovação',
  waiting_parts: 'Aguardando peça', repairing: 'Em conserto', ready: 'Pronto para retirada',
  delivered: 'Entregue', cancelled: 'Cancelado',
}
const statuses = Object.keys(statusLabels)
const money = (value: number) => Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export default function TenantWorkspace({ organization, role, email, onSignOut }: Props) {
  const canUpdateOrders = ['owner', 'admin', 'manager', 'technician'].includes(role)
  const canManageInventory = ['owner', 'admin', 'manager'].includes(role)
  const [branches, setBranches] = useState<Branch[]>([])
  const [branchId, setBranchId] = useState('')
  const [customers, setCustomers] = useState<Customer[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  const [tab, setTab] = useState<'orders' | 'customers' | 'inventory' | 'finance'>('orders')
  const [inventory, setInventory] = useState<Array<{item_id:string;quantity:number;inventory_items:Array<{id:string;sku:string|null;name:string;category:string;cost_price:number;sale_price:number;min_stock:number;active:boolean}>}>>([])
  const [showInventoryForm, setShowInventoryForm] = useState(false)
  const [inventoryForm, setInventoryForm] = useState({name:'',sku:'',category:'Acessórios',costPrice:'0',salePrice:'0',minStock:'0'})
  const [stockTarget, setStockTarget] = useState<string | null>(null)
  const [stockForm, setStockForm] = useState({type:'in' as 'in'|'out'|'adjustment',quantity:'1',reason:''})
  const canManageFinance = ['owner', 'admin', 'manager'].includes(role)
  const [financeRows, setFinanceRows] = useState<Array<{id:string;entry_type:'income'|'expense';description:string;amount:number;payment_method:string;status:'pending'|'paid'|'cancelled';due_date:string|null;created_at:string}>>([])
  const [showFinanceForm, setShowFinanceForm] = useState(false)
  const [financeForm, setFinanceForm] = useState({entryType:'income' as 'income'|'expense',description:'',amount:'',paymentMethod:'pix' as 'cash'|'pix'|'debit_card'|'credit_card'|'bank_transfer'|'boleto'|'other',status:'paid' as 'pending'|'paid',dueDate:'',notes:''})
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [showOrder, setShowOrder] = useState(false)
  const [showCustomer, setShowCustomer] = useState(false)
  const [historyOrder, setHistoryOrder] = useState<Order | null>(null)
  const [printOrder, setPrintOrder] = useState<Order | null>(null)
  const [historyEvents, setHistoryEvents] = useState<Array<{id:string;from_status:string|null;to_status:string;description:string|null;created_at:string}>>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [customer, setCustomer] = useState({ name: '', phone: '', email: '' })
  const [order, setOrder] = useState({ customerId: '', brand: 'Apple', model: '', imei: '', issue: '', amount: '0', accessories: '', condition: '' })

  async function loadBranches() {
    const rows = await listBranches(organization.id)
    setBranches(rows)
    setBranchId(current => rows.some(row => row.id === current) ? current : rows[0]?.id || '')
  }

  async function loadWorkspace(targetBranch = branchId) {
    if (!targetBranch) return
    setLoading(true); setError('')
    try {
      const context = { organizationId: organization.id, branchId: targetBranch }
      const [customerRows, orderRows, stockRows, financeData] = await Promise.all([listCustomers(context), listServiceOrders(context), listInventory(context), canManageFinance ? listFinancialEntries(context) : Promise.resolve([])])
      setCustomers(customerRows as Customer[])
      setOrders(orderRows as unknown as Order[])
      setInventory(stockRows as typeof inventory)
      setFinanceRows(financeData as typeof financeRows)
    } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível carregar os dados.') }
    finally { setLoading(false) }
  }

  useEffect(() => { loadBranches().catch(e => { setError(e.message || 'Erro ao carregar filiais.'); setLoading(false) }) }, [organization.id])
  useEffect(() => { if (branchId) loadWorkspace(branchId) }, [branchId])

  async function submitInventoryItem(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError('')
    try {
      await createInventoryItem({organizationId:organization.id,branchId}, {name:inventoryForm.name,sku:inventoryForm.sku,category:inventoryForm.category,costPrice:Number(inventoryForm.costPrice),salePrice:Number(inventoryForm.salePrice),minStock:Number(inventoryForm.minStock)})
      setInventoryForm({name:'',sku:'',category:'Acessórios',costPrice:'0',salePrice:'0',minStock:'0'});setShowInventoryForm(false);await loadWorkspace()
    } catch(e) { setError(e instanceof Error ? e.message : 'Falha ao cadastrar produto.') }
    finally { setBusy(false) }
  }

  async function submitStockMovement(event: React.FormEvent) {
    event.preventDefault(); if(!stockTarget) return; setBusy(true);setError('')
    try {
      await changeInventoryStock({organizationId:organization.id,branchId},stockTarget,stockForm.type,Number(stockForm.quantity),stockForm.reason)
      setStockTarget(null);setStockForm({type:'in',quantity:'1',reason:''});await loadWorkspace()
    } catch(e) { setError(e instanceof Error ? e.message : 'Falha ao movimentar estoque.') }
    finally { setBusy(false) }
  }

  async function submitFinanceEntry(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError('')
    try {
      await createFinancialEntry({organizationId:organization.id,branchId}, {entryType:financeForm.entryType,description:financeForm.description,amount:Number(financeForm.amount),paymentMethod:financeForm.paymentMethod,status:financeForm.status,dueDate:financeForm.dueDate || undefined,notes:financeForm.notes})
      setFinanceForm({entryType:'income',description:'',amount:'',paymentMethod:'pix',status:'paid',dueDate:'',notes:''}); setShowFinanceForm(false); await loadWorkspace()
    } catch(e) { setError(e instanceof Error ? e.message : 'Falha ao registrar lançamento.') }
    finally { setBusy(false) }
  }

  async function changeFinanceStatus(id: string, status: 'pending'|'paid'|'cancelled') {
    setBusy(true); setError('')
    try { await updateFinancialEntryStatus({organizationId:organization.id,branchId},id,status); await loadWorkspace() }
    catch(e) { setError(e instanceof Error ? e.message : 'Falha ao atualizar lançamento.') }
    finally { setBusy(false) }
  }

  async function submitCustomer(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError('')
    try {
      await saveCustomer({ organizationId: organization.id, branchId }, customer)
      setCustomer({ name: '', phone: '', email: '' }); setShowCustomer(false)
      await loadWorkspace()
    } catch (e) { setError(e instanceof Error ? e.message : 'Falha ao salvar cliente.') }
    finally { setBusy(false) }
  }

  async function submitOrder(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError('')
    try {
      const context = { organizationId: organization.id, branchId }
      const savedCustomer = customers.find(item => item.id === order.customerId)
      if (!savedCustomer) throw new Error('Selecione um cliente cadastrado.')
      await createServiceOrderWithDevice(context, {
        customerId: savedCustomer.id, brand: order.brand, model: order.model, imei: order.imei,
        reportedIssue: order.issue, estimatedAmount: Number(order.amount || 0),
        accessories: order.accessories, physicalCondition: order.condition,
      })
      setShowOrder(false); setOrder({ customerId: '', brand: 'Apple', model: '', imei: '', issue: '', amount: '0', accessories: '', condition: '' })
      await loadWorkspace()
    } catch (e) { setError(e instanceof Error ? e.message : 'Falha ao criar ordem de serviço.') }
    finally { setBusy(false) }
  }

  async function openHistory(item: Order) {
    setHistoryOrder(item); setHistoryLoading(true); setError('')
    try {
      const rows = await listServiceOrderEvents({ organizationId: organization.id, branchId }, item.id)
      setHistoryEvents(rows)
    } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível carregar o histórico.') }
    finally { setHistoryLoading(false) }
  }

  function printServiceOrder(item: Order) {
    setPrintOrder(item)
    window.setTimeout(() => window.print(), 100)
  }

  async function changeStatus(id: string, status: string) {
    setBusy(true); setError('')
    try {
      await updateServiceOrderStatus({ organizationId: organization.id, branchId }, id, status as ServiceOrderStatus)
      await loadWorkspace()
    } catch (e) { setError(e instanceof Error ? e.message : 'Falha ao atualizar status.') }
    finally { setBusy(false) }
  }

  return <main className="tenant-page">
    <header className="tenant-header"><div className="tenant-brand"><span><Smartphone/></span><div><b>EDERTEC <i>OS PRO</i></b><small>{organization.name}</small></div></div><div className="tenant-account"><span>{email}</span><button onClick={onSignOut} title="Sair"><LogOut size={17}/></button></div></header>
    <section className="tenant-content">
      <div className="tenant-heading"><div><small>AMBIENTE EMPRESARIAL</small><h1>{organization.name}</h1><p>Gestão de atendimentos e clientes</p></div><label className="branch-select"><Building2 size={16}/><select value={branchId} onChange={e=>setBranchId(e.target.value)}>{branches.map(branch=><option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label></div>
      <div className="tenant-stats"><article><span>Ordens nesta filial</span><b>{orders.length}</b></article><article><span>Clientes cadastrados</span><b>{customers.length}</b></article><article><span>Em andamento</span><b>{orders.filter(item=>!['delivered','cancelled'].includes(item.status)).length}</b></article></div>
      <div className="tenant-tabs"><button className={tab==='orders'?'selected':''} onClick={()=>setTab('orders')}><ClipboardList size={17}/> Ordens de serviço</button><button className={tab==='customers'?'selected':''} onClick={()=>setTab('customers')}><Users size={17}/> Clientes</button><button className={tab==='inventory'?'selected':''} onClick={()=>setTab('inventory')}><Boxes size={17}/> Estoque</button>{canManageFinance&&<button className={tab==='finance'?'selected':''} onClick={()=>setTab('finance')}><Wallet size={17}/> Financeiro</button>}<button className="refresh" onClick={()=>loadWorkspace()}><RefreshCw size={16}/> Atualizar</button></div>
      {error&&<div className="tenant-error">{error}</div>}
      {tab==='orders'&&<section className="tenant-panel"><div className="tenant-panel-head"><div><b>Ordens de serviço</b><small>Atendimentos registrados na filial selecionada</small></div><button className="tenant-primary" onClick={()=>setShowOrder(v=>!v)}><Plus size={16}/> Nova OS</button></div>
        {showOrder&&<form className="tenant-form" onSubmit={submitOrder}><label>Cliente<select required value={order.customerId} onChange={e=>setOrder({...order,customerId:e.target.value})}><option value="">Selecione um cliente</option>{customers.map(c=><option key={c.id} value={c.id}>{c.name} · {c.phone}</option>)}</select></label><div className="tenant-grid"><label>Marca<select value={order.brand} onChange={e=>setOrder({...order,brand:e.target.value})}>{['Apple','Samsung','Motorola','Xiaomi','Realme','Infinix','Outra'].map(v=><option key={v}>{v}</option>)}</select></label><label>Modelo<input required value={order.model} onChange={e=>setOrder({...order,model:e.target.value})}/></label><label>IMEI / Série<input value={order.imei} onChange={e=>setOrder({...order,imei:e.target.value})}/></label><label>Valor estimado (R$)<input type="number" min="0" step="0.01" value={order.amount} onChange={e=>setOrder({...order,amount:e.target.value})}/></label><label className="wide">Defeito informado<textarea required value={order.issue} onChange={e=>setOrder({...order,issue:e.target.value})}/></label><label>Acessórios<input value={order.accessories} onChange={e=>setOrder({...order,accessories:e.target.value})}/></label><label>Condição física<input value={order.condition} onChange={e=>setOrder({...order,condition:e.target.value})}/></label></div><div className="tenant-form-actions"><button type="button" onClick={()=>setShowOrder(false)}>Cancelar</button><button className="tenant-primary" disabled={busy}>Salvar ordem</button></div></form>}
        {loading?<p className="tenant-empty">Carregando dados...</p>:orders.length===0?<p className="tenant-empty">Nenhuma ordem cadastrada nesta filial.</p>:<div className="tenant-table-wrap"><table><thead><tr><th>Nº</th><th>CLIENTE / APARELHO</th><th>DEFEITO</th><th>VALOR</th><th>STATUS</th><th>HISTÓRICO</th><th>IMPRIMIR</th></tr></thead><tbody>{orders.map(item=><tr key={item.id}><td>#{item.order_number}</td><td><b>{item.customers?.name || 'Cliente'}</b><small>{item.devices?.brand} {item.devices?.model}</small></td><td>{item.reported_issue}</td><td>{money(item.estimated_amount)}</td><td><select value={item.status} disabled={busy || !canUpdateOrders} title={!canUpdateOrders ? 'Seu perfil pode abrir OS, mas não alterar o status.' : 'Atualizar status'} onChange={e=>changeStatus(item.id,e.target.value)}>{statuses.map(status=><option key={status} value={status}>{statusLabels[status]}</option>)}</select></td><td><button className="tenant-history-button" onClick={()=>openHistory(item)}>Ver histórico</button></td><td><button className="tenant-history-button" onClick={()=>printServiceOrder(item)}>Imprimir A4</button></td></tr>)}</tbody></table></div>}
      </section>}
      {tab==='customers'&&<section className="tenant-panel"><div className="tenant-panel-head"><div><b>Clientes</b><small>Cadastro compartilhado dentro da empresa</small></div><button className="tenant-primary" onClick={()=>setShowCustomer(v=>!v)}><Plus size={16}/> Novo cliente</button></div>
        {showCustomer&&<form className="tenant-form" onSubmit={submitCustomer}><div className="tenant-grid"><label>Nome completo<input required value={customer.name} onChange={e=>setCustomer({...customer,name:e.target.value})}/></label><label>Telefone / WhatsApp<input required value={customer.phone} onChange={e=>setCustomer({...customer,phone:e.target.value})}/></label><label className="wide">E-mail<input type="email" value={customer.email} onChange={e=>setCustomer({...customer,email:e.target.value})}/></label></div><div className="tenant-form-actions"><button type="button" onClick={()=>setShowCustomer(false)}>Cancelar</button><button className="tenant-primary" disabled={busy}>Salvar cliente</button></div></form>}
        {loading?<p className="tenant-empty">Carregando clientes...</p>:customers.length===0?<p className="tenant-empty">Nenhum cliente cadastrado.</p>:<div className="tenant-customer-list">{customers.map(item=><article key={item.id}><Users size={18}/><div><b>{item.name}</b><small>{item.phone}</small></div></article>)}</div>}
      </section>}

      {tab==='inventory'&&<section className="tenant-panel"><div className="tenant-panel-head"><div><b>Produtos e estoque</b><small>Saldo da filial selecionada · movimentações auditadas</small></div>{canManageInventory&&<button className="tenant-primary" onClick={()=>setShowInventoryForm(v=>!v)}><Plus size={16}/> Novo produto</button>}</div>
        {showInventoryForm&&canManageInventory&&<form className="tenant-form" onSubmit={submitInventoryItem}><div className="tenant-grid"><label>Nome do produto<input required value={inventoryForm.name} onChange={e=>setInventoryForm({...inventoryForm,name:e.target.value})}/></label><label>SKU / Código<input value={inventoryForm.sku} onChange={e=>setInventoryForm({...inventoryForm,sku:e.target.value})}/></label><label>Categoria<input value={inventoryForm.category} onChange={e=>setInventoryForm({...inventoryForm,category:e.target.value})}/></label><label>Custo (R$)<input type="number" min="0" step="0.01" value={inventoryForm.costPrice} onChange={e=>setInventoryForm({...inventoryForm,costPrice:e.target.value})}/></label><label>Preço de venda (R$)<input type="number" min="0" step="0.01" value={inventoryForm.salePrice} onChange={e=>setInventoryForm({...inventoryForm,salePrice:e.target.value})}/></label><label>Estoque mínimo<input type="number" min="0" step="0.001" value={inventoryForm.minStock} onChange={e=>setInventoryForm({...inventoryForm,minStock:e.target.value})}/></label></div><div className="tenant-form-actions"><button type="button" onClick={()=>setShowInventoryForm(false)}>Cancelar</button><button className="tenant-primary" disabled={busy}>Cadastrar produto</button></div></form>}
        {stockTarget&&<form className="tenant-form" onSubmit={submitStockMovement}><b>Movimentar estoque</b><div className="tenant-grid"><label>Tipo<select value={stockForm.type} onChange={e=>setStockForm({...stockForm,type:e.target.value as 'in'|'out'|'adjustment'})}><option value="in">Entrada</option><option value="out">Saída</option><option value="adjustment">Definir saldo</option></select></label><label>Quantidade<input required type="number" min="0.001" step="0.001" value={stockForm.quantity} onChange={e=>setStockForm({...stockForm,quantity:e.target.value})}/></label><label className="wide">Motivo<input value={stockForm.reason} onChange={e=>setStockForm({...stockForm,reason:e.target.value})} placeholder="Compra, venda, perda, inventário..."/></label></div><div className="tenant-form-actions"><button type="button" onClick={()=>setStockTarget(null)}>Cancelar</button><button className="tenant-primary" disabled={busy}>Confirmar movimentação</button></div></form>}
        {loading?<p className="tenant-empty">Carregando estoque...</p>:inventory.length===0?<p className="tenant-empty">Nenhum produto cadastrado para esta filial.</p>:<div className="tenant-table-wrap"><table><thead><tr><th>PRODUTO</th><th>CATEGORIA</th><th>CUSTO</th><th>VENDA</th><th>SALDO</th><th>SITUAÇÃO</th><th>AÇÃO</th></tr></thead><tbody>{inventory.map(row=>{const item=row.inventory_items?.[0];if(!item)return null;const low=Number(row.quantity)<=Number(item.min_stock);return <tr key={row.item_id}><td><b>{item.name}</b><small>{item.sku||'Sem SKU'}</small></td><td>{item.category}</td><td>{money(Number(item.cost_price))}</td><td>{money(Number(item.sale_price))}</td><td>{Number(row.quantity).toLocaleString('pt-BR')}</td><td><span className={low?'tenant-stock-low':'tenant-stock-ok'}>{low?'Estoque baixo':'Disponível'}</span></td><td>{canManageInventory?<button className="tenant-history-button" onClick={()=>setStockTarget(row.item_id)}><ArrowDownUp size={14}/> Movimentar</button>:<span>Somente leitura</span>}</td></tr>})}</tbody></table></div>}
      </section>}

      {tab==='finance'&&<section className="tenant-panel"><div className="tenant-panel-head"><div><b>Fluxo de caixa</b><small>Entradas, saídas e valores pendentes desta filial</small></div>{canManageFinance&&<button className="tenant-primary" onClick={()=>setShowFinanceForm(v=>!v)}><Plus size={16}/> Novo lançamento</button>}</div>
        <div className="tenant-finance-summary"><article><small>Entradas pagas</small><b>{money(financeRows.filter(x=>x.entry_type==='income'&&x.status==='paid').reduce((n,x)=>n+Number(x.amount),0))}</b></article><article><small>Saídas pagas</small><b>{money(financeRows.filter(x=>x.entry_type==='expense'&&x.status==='paid').reduce((n,x)=>n+Number(x.amount),0))}</b></article><article><small>Saldo realizado</small><b>{money(financeRows.filter(x=>x.status==='paid').reduce((n,x)=>n+(x.entry_type==='income'?1:-1)*Number(x.amount),0))}</b></article></div>
        {showFinanceForm&&canManageFinance&&<form className="tenant-form" onSubmit={submitFinanceEntry}><div className="tenant-grid"><label>Tipo<select value={financeForm.entryType} onChange={e=>setFinanceForm({...financeForm,entryType:e.target.value as 'income'|'expense'})}><option value="income">Entrada</option><option value="expense">Saída</option></select></label><label>Valor (R$)<input required type="number" min="0.01" step="0.01" value={financeForm.amount} onChange={e=>setFinanceForm({...financeForm,amount:e.target.value})}/></label><label className="wide">Descrição<input required value={financeForm.description} onChange={e=>setFinanceForm({...financeForm,description:e.target.value})}/></label><label>Forma de pagamento<select value={financeForm.paymentMethod} onChange={e=>setFinanceForm({...financeForm,paymentMethod:e.target.value as typeof financeForm.paymentMethod})}><option value="cash">Dinheiro</option><option value="pix">PIX</option><option value="debit_card">Débito</option><option value="credit_card">Crédito</option><option value="bank_transfer">Transferência</option><option value="boleto">Boleto</option><option value="other">Outro</option></select></label><label>Situação inicial<select value={financeForm.status} onChange={e=>setFinanceForm({...financeForm,status:e.target.value as 'pending'|'paid'})}><option value="paid">Pago / recebido</option><option value="pending">Pendente</option></select></label><label>Vencimento<input type="date" value={financeForm.dueDate} onChange={e=>setFinanceForm({...financeForm,dueDate:e.target.value})}/></label><label className="wide">Observações<input value={financeForm.notes} onChange={e=>setFinanceForm({...financeForm,notes:e.target.value})}/></label></div><div className="tenant-form-actions"><button type="button" onClick={()=>setShowFinanceForm(false)}>Cancelar</button><button className="tenant-primary" disabled={busy}>Salvar lançamento</button></div></form>}
        {loading?<p className="tenant-empty">Carregando financeiro...</p>:financeRows.length===0?<p className="tenant-empty">Nenhum lançamento registrado nesta filial.</p>:<div className="tenant-table-wrap"><table><thead><tr><th>DATA</th><th>DESCRIÇÃO</th><th>TIPO</th><th>VALOR</th><th>PAGAMENTO</th><th>SITUAÇÃO</th></tr></thead><tbody>{financeRows.map(row=><tr key={row.id}><td>{new Date(row.created_at).toLocaleDateString('pt-BR')}</td><td><b>{row.description}</b><small>{row.due_date?'Vencimento: '+new Date(row.due_date+'T12:00:00').toLocaleDateString('pt-BR'):''}</small></td><td>{row.entry_type==='income'?'Entrada':'Saída'}</td><td>{money(Number(row.amount))}</td><td>{{cash:'Dinheiro',pix:'PIX',debit_card:'Débito',credit_card:'Crédito',bank_transfer:'Transferência',boleto:'Boleto',other:'Outro'}[row.payment_method]||row.payment_method}</td><td>{canManageFinance&&row.status!=='cancelled'?<select value={row.status} disabled={busy} onChange={e=>changeFinanceStatus(row.id,e.target.value as 'pending'|'paid'|'cancelled')}><option value="pending">Pendente</option><option value="paid">Pago</option><option value="cancelled">Cancelado</option></select>:row.status==='paid'?'Pago':row.status==='pending'?'Pendente':'Cancelado'}</td></tr>)}</tbody></table></div>}
      </section>}
      {printOrder && <section className="tenant-print-sheet"><header><div><h1>{organization.name}</h1><p>ORDEM DE SERVIÇO</p></div><strong>OS #{printOrder.order_number}</strong></header><hr/><h2>Dados do cliente</h2><p><b>Nome:</b> {printOrder.customers?.name || '—'}</p><p><b>Telefone:</b> {printOrder.customers?.phone || '—'}</p><h2>Dados do aparelho</h2><p><b>Aparelho:</b> {printOrder.devices?.brand || '—'} {printOrder.devices?.model || ''}</p><p><b>IMEI / Série:</b> {printOrder.devices?.imei || 'Não informado'}</p><h2>Atendimento</h2><p><b>Defeito informado:</b> {printOrder.reported_issue}</p><p><b>Acessórios:</b> {printOrder.accessories || 'Não informado'}</p><p><b>Condição física:</b> {printOrder.physical_condition || 'Não informado'}</p><p><b>Valor estimado:</b> {money(printOrder.estimated_amount)}</p><p><b>Status:</b> {statusLabels[printOrder.status] || printOrder.status}</p><p><b>Recebido em:</b> {new Date(printOrder.received_at).toLocaleString('pt-BR')}</p><div className="tenant-print-terms"><p>O orçamento poderá ser alterado após avaliação técnica e autorização do cliente. Aparelhos e acessórios devem ser conferidos no ato da retirada.</p></div><div className="tenant-print-signatures"><span>Assinatura do cliente</span><span>Assinatura do responsável</span></div><button className="tenant-print-close" onClick={()=>setPrintOrder(null)}>Fechar impressão</button></section>}
      {historyOrder && <div className="tenant-modal-backdrop" onClick={() => setHistoryOrder(null)}>
        <section className="tenant-history-modal" onClick={event => event.stopPropagation()}>
          <div className="tenant-panel-head"><div><b>Histórico da OS #{historyOrder.order_number}</b><small>{historyOrder.customers?.name || 'Cliente'} · {historyOrder.devices?.brand} {historyOrder.devices?.model}</small></div><button className="tenant-modal-close" onClick={() => setHistoryOrder(null)}>Fechar</button></div>
          {historyLoading ? <p className="tenant-empty">Carregando histórico...</p> : historyEvents.length === 0 ? <p className="tenant-empty">Nenhuma alteração registrada ainda.</p> : <div className="tenant-timeline">{historyEvents.map(event => <article key={event.id}><span className="tenant-timeline-dot" /><div><b>{statusLabels[event.to_status] || event.to_status}</b><small>{new Date(event.created_at).toLocaleString('pt-BR')}</small>{event.from_status && <p>De: {statusLabels[event.from_status] || event.from_status}</p>}{event.description && <p>{event.description}</p>}</div></article>)}</div>}
        </section>
      </div>}
      <p className="tenant-footnote">Dados vinculados à empresa e protegidos pelas políticas de acesso do banco. Faça logout ao usar um dispositivo compartilhado.</p>
    </section>
  </main>
}
