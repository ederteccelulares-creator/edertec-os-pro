import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { Building2, ClipboardList, LogOut, Plus, RefreshCw, Smartphone, Users, Boxes, ArrowDownUp, Wallet, ShoppingCart, Trash2, ShieldCheck, UserCog, BarChart3, MessageCircle } from 'lucide-react'
import { changeInventoryStock, createInventoryItem, createFinancialEntry, createSale, createServiceOrderWithDevice, listBranches, listCustomers, listDevices, saveDevice, updateDevice, createServiceOrder, listFinancialEntries, listInventory, listSales, listServiceOrderEvents, listServiceOrders, saveCustomer, updateCustomer, listOrganizationTeam, setOrganizationMemberActive, setOrganizationMemberRole, listServiceCatalog, saveServiceCatalogItem, addServiceToOrder, inviteOrganizationMember, updateFinancialEntryStatus, updateServiceOrderStatus, assignServiceOrderTechnician, exportOrganizationBackup, validateOrganizationBackup, restoreOrganizationBackup, uploadServiceOrderIntakeMedia, listServiceOrderIntakeMedia } from '../lib/tenant-data'
import type { Organization, Branch } from '../lib/supabase'
import type { ServiceOrderStatus, TeamMember, ServiceCatalogItem } from '../lib/tenant-data'

type Props = { organization: Organization; role: import('../lib/supabase').OrganizationRole; email: string; onSignOut: () => void }
type Customer = { id: string; name: string; phone: string; email?: string | null; document?: string | null; notes?: string | null }
type CustomerDevice = { id: string; customer_id: string; brand: string; model: string; color?: string | null; storage?: string | null; imei?: string | null; serial_number?: string | null; notes?: string | null; created_at: string }
type Order = { id: string; order_number: number; device_id?: string | null; created_at: string; technician_id?: string | null; status: string; reported_issue: string; estimated_amount: number; received_at: string; accessories?: string | null; physical_condition?: string | null; diagnosis?: string | null; customers?: { name: string; phone: string } | null; devices?: { brand: string; model: string; imei?: string | null } | null }

const statusLabels: Record<string, string> = {
  received: 'Recebido', diagnosing: 'Em diagnóstico', waiting_approval: 'Aguardando aprovação',
  waiting_parts: 'Aguardando peça', repairing: 'Em conserto', ready: 'Pronto para retirada',
  delivered: 'Entregue', cancelled: 'Cancelado',
}
const statuses = Object.keys(statusLabels)
const money = (value: number) => Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export default function TenantWorkspace({ organization, role, email, onSignOut }: Props) {
  const canUpdateOrders = ['owner', 'admin', 'manager', 'technician'].includes(role)
  const canAssignTechnician = ['owner', 'admin', 'manager'].includes(role)
  const canAddServiceToOrder = ['owner','admin','manager','technician'].includes(role)
  const canManageInventory = ['owner', 'admin', 'manager'].includes(role)
  const [branches, setBranches] = useState<Branch[]>([])
  const [branchId, setBranchId] = useState('')
  const [customers, setCustomers] = useState<Customer[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  const [tab, setTab] = useState<'orders' | 'customers' | 'inventory' | 'finance' | 'sales' | 'team' | 'services' | 'reports'>('orders')
  const [orderSearch, setOrderSearch] = useState('')
  const [orderStatusFilter, setOrderStatusFilter] = useState('all')
  const [inventory, setInventory] = useState<Array<{item_id:string;quantity:number;inventory_items:Array<{id:string;sku:string|null;name:string;category:string;cost_price:number;sale_price:number;min_stock:number;active:boolean}>}>>([])
  const [showInventoryForm, setShowInventoryForm] = useState(false)
  const [inventoryForm, setInventoryForm] = useState({name:'',sku:'',category:'Acessórios',costPrice:'0',salePrice:'0',minStock:'0'})
  const [stockTarget, setStockTarget] = useState<string | null>(null)
  const [stockForm, setStockForm] = useState({type:'in' as 'in'|'out'|'adjustment',quantity:'1',reason:''})
  const canManageFinance = ['owner', 'admin', 'manager'].includes(role)
  const [financeRows, setFinanceRows] = useState<Array<{id:string;entry_type:'income'|'expense';description:string;amount:number;payment_method:string;status:'pending'|'paid'|'cancelled';due_date:string|null;created_at:string}>>([])
  const [showFinanceForm, setShowFinanceForm] = useState(false)
  const [financeForm, setFinanceForm] = useState({entryType:'income' as 'income'|'expense',description:'',amount:'',paymentMethod:'pix' as 'cash'|'pix'|'debit_card'|'credit_card'|'bank_transfer'|'boleto'|'other',status:'paid' as 'pending'|'paid',dueDate:'',notes:''})
  const canSell = ['owner','admin','manager','attendant'].includes(role)
  const [salesRows, setSalesRows] = useState<Array<{id:string;sale_number:number;total:number;payment_method:string;payment_status:string;created_at:string;customers:Array<{name:string}>;sale_items:Array<{id:string;product_name:string;quantity:number;line_total:number}>}>>([])
  const [showSaleForm, setShowSaleForm] = useState(false)
  const [saleForm, setSaleForm] = useState({itemId:'',quantity:'1',customerId:'',paymentMethod:'pix' as 'cash'|'pix'|'debit_card'|'credit_card'|'bank_transfer'|'boleto'|'other',paymentStatus:'paid' as 'paid'|'pending',discount:'0',notes:''})
  const [saleCart, setSaleCart] = useState<Array<{itemId:string;name:string;quantity:number;unitPrice:number;costPrice:number}>>([])

  const canManageServices = ['owner','admin','manager'].includes(role)
  const [serviceRows, setServiceRows] = useState<ServiceCatalogItem[]>([])
  const [showServiceForm, setShowServiceForm] = useState(false)
  const [editingServiceId, setEditingServiceId] = useState<string | undefined>()
  const [serviceForm, setServiceForm] = useState({name:'',description:'',category:'Reparo',price:'0',estimatedMinutes:'30',active:true})
  const [serviceForOrder, setServiceForOrder] = useState<Record<string,string>>({})
  const canViewTeam = ['owner','admin','manager'].includes(role)
  const canManageTeam = ['owner','admin'].includes(role)
  const [teamRows, setTeamRows] = useState<TeamMember[]>([])
  const [inviteForm, setInviteForm] = useState({email:'',role:'technician' as Exclude<TeamMember['member_role'],'owner'>})
  const [teamNotice, setTeamNotice] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [backupBusy, setBackupBusy] = useState(false)
  const [backupNotice, setBackupNotice] = useState('')
  const [restoreNotice, setRestoreNotice] = useState('')
  const [restoreBusy, setRestoreBusy] = useState(false)
  const [restoreIdempotencyKey, setRestoreIdempotencyKey] = useState('')
  const [validationBusy, setValidationBusy] = useState(false)
  const [validationReport, setValidationReport] = useState<Awaited<ReturnType<typeof validateOrganizationBackup>> | null>(null)
  const [userMappingDraft, setUserMappingDraft] = useState<Record<string,string>>({})
  const [branchMappingDraft, setBranchMappingDraft] = useState<Record<string,string>>({})
  const [backupDraft, setBackupDraft] = useState<Record<string,unknown> | null>(null)
  const [mappingBusy, setMappingBusy] = useState(false)
  const [mappingDraftDirty, setMappingDraftDirty] = useState(false)
  const [showOrder, setShowOrder] = useState(false)
  const [showCustomer, setShowCustomer] = useState(false)
  const [editingCustomerId, setEditingCustomerId] = useState<string | null>(null)
  const [deviceCustomer, setDeviceCustomer] = useState<Customer | null>(null)
  const [customerDevices, setCustomerDevices] = useState<CustomerDevice[]>([])
  const [deviceForm, setDeviceForm] = useState({brand:'',model:'',color:'',storage:'',imei:'',serialNumber:'',notes:''})
  const [editingDeviceId, setEditingDeviceId] = useState<string | null>(null)
  const [deviceLoading, setDeviceLoading] = useState(false)
  const [deviceHistory, setDeviceHistory] = useState<CustomerDevice | null>(null)
  const [historyOrder, setHistoryOrder] = useState<Order | null>(null)
  const [printOrder, setPrintOrder] = useState<Order | null>(null)
  const [printOrderMedia, setPrintOrderMedia] = useState<Array<{name:string;url:string}>>([])
  const [historyEvents, setHistoryEvents] = useState<Array<{id:string;from_status:string|null;to_status:string;description:string|null;created_at:string}>>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [customer, setCustomer] = useState({ name: '', phone: '', email: '' })
  const [customerSearch, setCustomerSearch] = useState('')
  const [order, setOrder] = useState({ customerId: '', deviceId: '', brand: 'Apple', model: '', imei: '', issue: '', amount: '0', accessories: '', condition: '' })
  const [orderDevices, setOrderDevices] = useState<CustomerDevice[]>([])
  const [orderDevicesLoading, setOrderDevicesLoading] = useState(false)
  const intakeChecklistItems = ['Tela e vidro','Touch / sensibilidade','Câmeras','Áudio e microfone','Botões físicos','Conector de carga','Sinais de queda ou oxidação']
  const [intakeChecklist, setIntakeChecklist] = useState<Record<string, boolean>>({})
  const [intakePhotos, setIntakePhotos] = useState<File[]>([])
  const [signatureHasInk, setSignatureHasInk] = useState(false)
  const signatureCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const signatureDrawingRef = useRef(false)
  const [orderIntakeMedia, setOrderIntakeMedia] = useState<Array<{name:string;url:string}>>([])

  async function inspectBackupFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setValidationBusy(true)
    setValidationReport(null)
    setRestoreNotice('')
    setRestoreIdempotencyKey('')
    setMappingDraftDirty(false)
    setError('')
    try {
      if (file.size > 10 * 1024 * 1024) throw new Error('O arquivo deve ter no máximo 10 MB.')
      const parsed = JSON.parse(await file.text()) as Record<string, unknown>
      setBackupDraft(parsed)
      const report = await validateOrganizationBackup(organization.id, parsed)
      setValidationReport(report)
      setMappingDraftDirty(false)
      setUserMappingDraft(Object.fromEntries(report.source_users
        .filter(source => report.destination_members.some(member => member.user_id === source.source_user_id && member.active))
        .map(source => [source.source_user_id, source.source_user_id])))
      setBranchMappingDraft(Object.fromEntries(report.source_branches
        .filter(source => report.destination_branches.some(branch => branch.id === source.source_branch_id && branch.active))
        .map(source => [source.source_branch_id, source.source_branch_id])))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível validar o arquivo.')
    } finally {
      setValidationBusy(false)
    }
  }
  async function validateUserMappingDraft() {
    if (!backupDraft || !validationReport) return
    setMappingBusy(true)
    setError('')
    try {
      const report = await validateOrganizationBackup(organization.id, backupDraft, userMappingDraft, branchMappingDraft)
      setValidationReport(report)
      setMappingDraftDirty(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível validar as associações.')
    } finally {
      setMappingBusy(false)
    }
  }

  async function restoreBackup() {
    if (!backupDraft || !validationReport?.restore_ready || mappingDraftDirty) return
    const confirmed = window.confirm(
      'Confirma restaurar este backup nesta empresa? A operação só é aceita com as tabelas operacionais vazias. Os dados serão importados em uma única transação; se houver falha, o banco desfaz tudo. Esta ação não pode ser desfeita pelo painel.'
    )
    if (!confirmed) return
    const operationKey = restoreIdempotencyKey || crypto.randomUUID()
    setRestoreIdempotencyKey(operationKey)
    setRestoreBusy(true)
    setError('')
    setRestoreNotice('')
    try {
      const result = await restoreOrganizationBackup(
        organization.id, backupDraft, branchMappingDraft, userMappingDraft, operationKey,
      )
      const restored = Object.entries(result.restored_counts)
        .map(([table, count]) => table + ': ' + count)
        .join(' · ')
      setRestoreNotice(
        (result.replayed ? 'Esta operação já havia sido concluída. ' : 'Restauração concluída. ') +
        'Registros importados: ' + restored
      )
      setBackupDraft(null)
      setValidationReport(null)
      setRestoreIdempotencyKey('')
      await loadWorkspace()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'A restauração falhou. Nenhum dado parcial foi mantido.')
    } finally {
      setRestoreBusy(false)
    }
  }

  async function downloadBackup() {
    setBackupBusy(true)
    setBackupNotice('')
    setError('')
    try {
      const backup = await exportOrganizationBackup(organization.id)
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = 'edertec-backup-' + organization.slug + '-' + new Date().toISOString().slice(0, 10) + '.json'
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
      setBackupNotice('Backup gerado. Guarde o arquivo em local privado e seguro.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível gerar o backup.')
    } finally {
      setBackupBusy(false)
    }
  }

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
      const [customerRows, orderRows, stockRows, financeData, salesData, teamData, serviceData] = await Promise.all([listCustomers(context), listServiceOrders(context), listInventory(context), canManageFinance ? listFinancialEntries(context) : Promise.resolve([]), listSales(context), canViewTeam ? listOrganizationTeam(organization.id) : Promise.resolve([]), listServiceCatalog(organization.id)])
      setCustomers(customerRows as Customer[])
      setOrders(orderRows as unknown as Order[])
      setInventory(stockRows as typeof inventory)
      setFinanceRows(financeData as typeof financeRows)
      setSalesRows(salesData as typeof salesRows)
      setTeamRows(teamData)
      setServiceRows(serviceData)
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

  function addSaleCartItem() {
    const row = inventory.find(entry => entry.item_id === saleForm.itemId)
    const product = row?.inventory_items?.[0]
    if (!row || !product) { setError('Selecione um produto do estoque.'); return }
    const quantity = Number(saleForm.quantity)
    if (!Number.isFinite(quantity) || quantity <= 0) { setError('Informe uma quantidade válida.'); return }
    const already = saleCart.filter(item => item.itemId === product.id).reduce((sum,item)=>sum+item.quantity,0)
    if (already + quantity > Number(row.quantity)) { setError('Quantidade maior que o estoque disponível.'); return }
    setSaleCart(current => [...current,{itemId:product.id,name:product.name,quantity,unitPrice:Number(product.sale_price),costPrice:Number(product.cost_price)}])
    setSaleForm(current=>({...current,itemId:'',quantity:'1'})); setError('')
  }

  async function submitSale(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError('')
    try {
      const subtotal = saleCart.reduce((sum,item)=>sum+item.quantity*item.unitPrice,0)
      const discount = Number(saleForm.discount || 0)
      if (!saleCart.length) throw new Error('Adicione produtos à venda.')
      if (discount < 0 || discount >= subtotal) throw new Error('O desconto deve ser menor que o subtotal.')
      await createSale({organizationId:organization.id,branchId},{
        items:saleCart.map(item=>({itemId:item.itemId,quantity:item.quantity,unitPrice:item.unitPrice})),
        paymentMethod:saleForm.paymentMethod,paymentStatus:saleForm.paymentStatus,
        customerId:saleForm.customerId || undefined,discount,notes:saleForm.notes,
      })
      setSaleCart([]);setSaleForm({itemId:'',quantity:'1',customerId:'',paymentMethod:'pix',paymentStatus:'paid',discount:'0',notes:''})
      setShowSaleForm(false);await loadWorkspace()
    } catch(e) { setError(e instanceof Error ? e.message : 'Falha ao concluir venda.') }
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


  function editService(item: ServiceCatalogItem) {
    setEditingServiceId(item.id)
    setServiceForm({name:item.name,description:item.description||'',category:item.category,price:String(item.price),estimatedMinutes:String(item.estimated_minutes),active:item.active})
    setShowServiceForm(true)
  }

  async function submitService(event: React.FormEvent) {
    event.preventDefault();setBusy(true);setError('')
    try {
      await saveServiceCatalogItem(organization.id,{id:editingServiceId,name:serviceForm.name,description:serviceForm.description,category:serviceForm.category,price:Number(serviceForm.price),estimated_minutes:Number(serviceForm.estimatedMinutes),active:serviceForm.active})
      setServiceRows(await listServiceCatalog(organization.id));setShowServiceForm(false);setEditingServiceId(undefined)
      setServiceForm({name:'',description:'',category:'Reparo',price:'0',estimatedMinutes:'30',active:true})
    } catch(e) { setError(e instanceof Error ? e.message : 'Falha ao salvar serviço.') }
    finally { setBusy(false) }
  }

  async function attachService(orderId: string) {
    const serviceId=serviceForOrder[orderId]
    if(!serviceId) { setError('Selecione um serviço para adicionar à OS.');return }
    setBusy(true);setError('')
    try { await addServiceToOrder(organization.id,branchId,orderId,serviceId);await loadWorkspace();setServiceForOrder(current=>({...current,[orderId]:''})) }
    catch(e) { setError(e instanceof Error ? e.message : 'Falha ao adicionar serviço à OS.') }
    finally { setBusy(false) }
  }

  async function submitTeamInvite(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setTeamNotice('')
    try {
      const result = await inviteOrganizationMember(organization.id, inviteForm.email, inviteForm.role)
      setTeamNotice(result.message || 'Convite enviado com sucesso.')
      setInviteForm({email:'',role:'technician'})
      setTeamRows(await listOrganizationTeam(organization.id))
    } catch(e) { setError(e instanceof Error ? e.message : 'Não foi possível enviar o convite.') }
    finally { setBusy(false) }
  }

  async function updateTeamRole(member: TeamMember, nextRole: TeamMember['member_role']) {
    if (member.member_role===nextRole) return
    setBusy(true);setError('')
    try { await setOrganizationMemberRole(organization.id,member.member_id,nextRole);setTeamRows(await listOrganizationTeam(organization.id)) }
    catch(e) { setError(e instanceof Error ? e.message : 'Não foi possível alterar a função.') }
    finally { setBusy(false) }
  }

  async function toggleTeamAccess(member: TeamMember) {
    setBusy(true);setError('')
    try { await setOrganizationMemberActive(organization.id,member.member_id,!member.is_active);setTeamRows(await listOrganizationTeam(organization.id)) }
    catch(e) { setError(e instanceof Error ? e.message : 'Não foi possível alterar o acesso.') }
    finally { setBusy(false) }
  }

  async function openCustomerDevices(item: Customer) {
    setDeviceCustomer(item); setCustomerDevices([]); setDeviceLoading(true); setError('')
    try {
      const rows = await listDevices({ organizationId: organization.id, branchId }, item.id)
      setCustomerDevices(rows as CustomerDevice[])
    } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível carregar os aparelhos.') }
    finally { setDeviceLoading(false) }
  }

  async function submitCustomerDevice(event: React.FormEvent) {
    event.preventDefault()
    if (!deviceCustomer) return
    setBusy(true); setError('')
    try {
      const context = { organizationId: organization.id, branchId }
      const payload = { customerId: deviceCustomer.id, ...deviceForm }
      if (editingDeviceId) {
        await updateDevice(context, editingDeviceId, payload)
      } else {
        await saveDevice(context, payload)
      }
      setDeviceForm({brand:'',model:'',color:'',storage:'',imei:'',serialNumber:'',notes:''})
      setEditingDeviceId(null)
      const rows = await listDevices(context, deviceCustomer.id)
      setCustomerDevices(rows as CustomerDevice[])
    } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível salvar o aparelho.') }
    finally { setBusy(false) }
  }
  function editCustomerDevice(device: CustomerDevice) {
    setEditingDeviceId(device.id)
    setDeviceForm({brand:device.brand,model:device.model,color:device.color||'',storage:device.storage||'',imei:device.imei||'',serialNumber:device.serial_number||'',notes:device.notes||''})
  }
  async function submitCustomer(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError('')
    try {
      const context = { organizationId: organization.id, branchId }
      if (editingCustomerId) {
        await updateCustomer(context, editingCustomerId, customer)
      } else {
        await saveCustomer(context, customer)
      }
      setCustomer({ name: '', phone: '', email: '' }); setEditingCustomerId(null); setShowCustomer(false)
      await loadWorkspace()
    } catch (e) { setError(e instanceof Error ? e.message : 'Falha ao salvar cliente.') }
    finally { setBusy(false) }
  }

  async function selectOrderCustomer(customerId: string) {
    setOrder(current => ({ ...current, customerId, deviceId: '' }))
    setOrderDevices([])
    if (!customerId) return
    setOrderDevicesLoading(true)
    try {
      const rows = await listDevices({ organizationId: organization.id, branchId }, customerId)
      setOrderDevices(rows as CustomerDevice[])
    } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível carregar os aparelhos do cliente.') }
    finally { setOrderDevicesLoading(false) }
  }
  async function submitOrder(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError('')
    try {
      const context = { organizationId: organization.id, branchId }
      const savedCustomer = customers.find(item => item.id === order.customerId)
      const checkedItems = intakeChecklistItems.filter(label => intakeChecklist[label])
      const intakeNotes = checkedItems.length ? `Checklist de entrada:\n${checkedItems.map(label => `- ${label}: conferido`).join('\n')}` : ''
      const physicalCondition = [order.condition.trim(), intakeNotes].filter(Boolean).join('\n\n')
      if (!savedCustomer) throw new Error('Selecione um cliente cadastrado.')
      let createdOrder: { id: string } | null = null
      if (order.deviceId) {
        createdOrder = await createServiceOrder(context, {
          customerId: savedCustomer.id, deviceId: order.deviceId,
          reportedIssue: order.issue, estimatedAmount: Number(order.amount || 0),
          accessories: order.accessories, physicalCondition,
        })
      } else {
        createdOrder = await createServiceOrderWithDevice(context, {
          customerId: savedCustomer.id, brand: order.brand, model: order.model, imei: order.imei,
          reportedIssue: order.issue, estimatedAmount: Number(order.amount || 0),
          accessories: order.accessories, physicalCondition,
        })
      }
      let mediaWarning = ''
      if (createdOrder?.id && (intakePhotos.length || signatureHasInk)) {
        try {
          const signature = signatureHasInk && signatureCanvasRef.current
            ? await new Promise<Blob | null>(resolve => signatureCanvasRef.current?.toBlob(resolve, 'image/png'))
            : null
          await uploadServiceOrderIntakeMedia(context, createdOrder.id, intakePhotos, signature)
        } catch (mediaError) {
          mediaWarning = mediaError instanceof Error ? mediaError.message : 'Falha ao enviar fotos ou assinatura.'
        }
      }
      setShowOrder(false); setOrder({ customerId: '', deviceId: '', brand: 'Apple', model: '', imei: '', issue: '', amount: '0', accessories: '', condition: '' }); setOrderDevices([]); setIntakeChecklist({}); setIntakePhotos([]); setSignatureHasInk(false)
      if (signatureCanvasRef.current) { const canvas=signatureCanvasRef.current; canvas.getContext('2d')?.clearRect(0,0,canvas.width,canvas.height) }
      await loadWorkspace()
      if (mediaWarning) setError(`OS criada, mas não foi possível anexar a mídia: ${mediaWarning}`)
    } catch (e) { setError(e instanceof Error ? e.message : 'Falha ao criar ordem de serviço.') }
    finally { setBusy(false) }
  }

  async function openHistory(item: Order) {
    setHistoryOrder(item); setHistoryLoading(true); setError('')
    try {
      const context = { organizationId: organization.id, branchId }
      const rows = await listServiceOrderEvents(context, item.id)
      setHistoryEvents(rows)
      setOrderIntakeMedia(await listServiceOrderIntakeMedia(context, item.id))
    } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível carregar o histórico.') }
    finally { setHistoryLoading(false) }
  }

  async function printServiceOrder(item: Order) {
    setBusy(true); setError('')
    try {
      const media = await listServiceOrderIntakeMedia({ organizationId: organization.id, branchId }, item.id)
      setPrintOrderMedia(media)
      setPrintOrder(item)
      window.setTimeout(() => window.print(), 350)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível preparar a ficha de recebimento.')
    } finally {
      setBusy(false)
    }
  }

  function notifyCustomerWhatsApp(item: Order) {
    const rawPhone = (item.customers?.phone || '').replace(/\D/g, '')
    if (!rawPhone) {
      setError('Este cliente não possui telefone cadastrado para contato.')
      return
    }
    const phone = rawPhone.length === 10 || rawPhone.length === 11 ? `55${rawPhone}` : rawPhone
    const device = [item.devices?.brand, item.devices?.model].filter(Boolean).join(' ') || 'aparelho'
    const message = [
      `Olá, ${item.customers?.name || 'tudo bem'}!`,
      `Aqui é da ${organization.name}.`,
      `Atualização da sua ordem de serviço nº ${item.order_number}:`,
      `Aparelho: ${device}.`,
      `Status: ${statusLabels[item.status] || item.status}.`,
      `Defeito informado: ${item.reported_issue}.`,
      'Em caso de dúvidas, responda esta mensagem. Obrigado por escolher nossa assistência!'
    ].join('\n')
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer')
  }

  async function changeStatus(id: string, status: string) {
    setBusy(true); setError('')
    try {
      await updateServiceOrderStatus({ organizationId: organization.id, branchId }, id, status as ServiceOrderStatus)
      await loadWorkspace()
    } catch (e) { setError(e instanceof Error ? e.message : 'Falha ao atualizar status.') }
    finally { setBusy(false) }
  }

  async function changeTechnician(orderId: string, technicianId: string) {
    setBusy(true); setError('')
    try {
      await assignServiceOrderTechnician(
        { organizationId: organization.id, branchId },
        orderId,
        technicianId || null,
      )
      await loadWorkspace()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao atribuir técnico à OS.')
    } finally {
      setBusy(false)
    }
  }

  return <main className="tenant-page">
    <header className="tenant-header"><div className="tenant-brand"><span><Smartphone/></span><div><b>EDERTEC <i>OS PRO</i></b><small>{organization.name}</small></div></div><div className="tenant-account"><span>{email}</span>{['owner','admin'].includes(role)&&<button onClick={downloadBackup} disabled={backupBusy} title="Baixar backup da empresa" aria-label="Baixar backup da empresa"><Boxes size={17}/></button>}<button onClick={onSignOut} title="Sair"><LogOut size={17}/></button></div></header>
    <section className="tenant-content">
      <div className="tenant-heading"><div><small>AMBIENTE EMPRESARIAL</small><h1>{organization.name}</h1><p>Gestão de atendimentos e clientes</p></div><label className="branch-select"><Building2 size={16}/><select value={branchId} onChange={e=>setBranchId(e.target.value)}>{branches.map(branch=><option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label></div>
      <div className="tenant-stats"><article><span>Ordens nesta filial</span><b>{orders.length}</b></article><article><span>Clientes cadastrados</span><b>{customers.length}</b></article><article><span>Em andamento</span><b>{orders.filter(item=>!['delivered','cancelled'].includes(item.status)).length}</b></article></div>
      <div className="tenant-tabs"><button className={tab==='orders'?'selected':''} onClick={()=>setTab('orders')}><ClipboardList size={17}/> Ordens de serviço</button><button className={tab==='customers'?'selected':''} onClick={()=>setTab('customers')}><Users size={17}/> Clientes</button><button className={tab==='inventory'?'selected':''} onClick={()=>setTab('inventory')}><Boxes size={17}/> Estoque</button>{canManageFinance&&<button className={tab==='finance'?'selected':''} onClick={()=>setTab('finance')}><Wallet size={17}/> Financeiro</button>}<button className={tab==='sales'?'selected':''} onClick={()=>setTab('sales')}><ShoppingCart size={17}/> Vendas</button><button className={tab==='reports'?'selected':''} onClick={()=>setTab('reports')}><BarChart3 size={17}/> Relatórios</button><button className={tab==='services'?'selected':''} onClick={()=>setTab('services')}><ClipboardList size={17}/> Serviços</button>{canViewTeam&&<button className={tab==='team'?'selected':''} onClick={()=>setTab('team')}><ShieldCheck size={17}/> Equipe</button>}<button className="refresh" onClick={()=>loadWorkspace()}><RefreshCw size={16}/> Atualizar</button></div>
      {error&&<div className="tenant-error">{error}</div>}{backupNotice&&<div className="tenant-success">{backupNotice}</div>}{restoreNotice&&<div className="tenant-success">{restoreNotice}</div>}{['owner','admin'].includes(role)&&<section className="tenant-panel tenant-backup-panel"><div className="tenant-panel-head"><div><b>Backup e restauração</b><small>Valide um arquivo antes de solicitar restauração assistida</small></div><label className="tenant-history-button">{validationBusy?'Validando...':'Validar arquivo JSON'}<input type="file" accept="application/json,.json" disabled={validationBusy} onChange={inspectBackupFile}/></label></div>{validationReport&&<div className="tenant-backup-report"><b>{validationReport.valid?'Arquivo validado':'Arquivo com problemas'}</b><p>{validationReport.message}</p><b>Prontidão para restauração: {validationReport.restore_ready?'LIBERADA':'NÃO LIBERADA'}</b>{validationReport.restore_blockers.map((item,index)=><small key={"restore-"+index}>{item}</small>)}<p>Empresa: {validationReport.organization.name} · Registros: {validationReport.total_records.toLocaleString('pt-BR')}</p>{validationReport.errors.map((item,index)=><p key={index}>{item}</p>)}<small>A validação é somente leitura. A importação só ocorre após confirmação no botão abaixo.</small>{validationReport.requires_user_mapping&&<><small>Mapeamento obrigatório de usuários do Supabase Auth (contas existentes no destino):</small>{validationReport.user_mapping_requirements.map(item=><small key={item.table+'.'+item.field}>{item.table}.{item.field}: {item.records.toLocaleString('pt-BR')} registros</small>)}<small>Usuários de origem identificados: {validationReport.source_users.length}</small>{validationReport.source_users.map(item=><div className="tenant-form" key={item.source_user_id}><small>Usuário de origem: {item.source_user_id} · {item.references.reduce((sum,ref)=>sum+ref.records,0)} referências</small><label>Associar ao membro ativo do destino<select value={userMappingDraft[item.source_user_id]||''} onChange={event=>{setUserMappingDraft(current=>({...current,[item.source_user_id]:event.target.value}));setMappingDraftDirty(true)}}><option value="">Selecione um membro</option>{validationReport.destination_members.filter(member=>member.active).map(member=><option key={member.user_id} value={member.user_id}>{member.full_name||'Sem nome'} · {member.role} · {member.user_id}</option>)}</select></label></div>)}<small>Mapeamentos preenchidos nesta tela: {Object.values(userMappingDraft).filter(Boolean).length} de {validationReport.source_users.length}. A seleção ainda não é aplicada aos dados.</small><button type="button" className="tenant-history-button" disabled={mappingBusy||!backupDraft||validationReport.source_users.length===0&&validationReport.source_branches.length===0} onClick={validateUserMappingDraft}>{mappingBusy?'Conferindo associações...':'Validar associações'}</button>{mappingDraftDirty?<small>Associações alteradas. Valide novamente antes de considerar o resultado atualizado.</small>:validationReport.mapping_provided&&<small>{validationReport.mapping_valid?'Todas as associações passaram na validação.':'Associações ainda precisam de ajustes.'}</small>}{validationReport.mapping_errors.map((item,index)=><small key={index}>{item}</small>)}</>}
        {validationReport.source_branches.length>0&&<><small>Filiais identificadas no backup e referências operacionais:</small>{validationReport.source_branches.map(item=><div className="tenant-form" key={item.source_branch_id}><small>{item.name} · código {item.code} · {item.references.reduce((sum,ref)=>sum+ref.records,0)} referências · ID {item.source_branch_id}</small><label>Associar à filial ativa do destino<select value={branchMappingDraft[item.source_branch_id]||''} onChange={event=>{setBranchMappingDraft(current=>({...current,[item.source_branch_id]:event.target.value}));setMappingDraftDirty(true)}}><option value="">Selecione uma filial</option>{validationReport.destination_branches.filter(branch=>branch.active).map(branch=><option key={branch.id} value={branch.id}>{branch.name} · {branch.code}</option>)}</select></label></div>)}<small>Associações de filiais preenchidas: {Object.values(branchMappingDraft).filter(Boolean).length} de {validationReport.source_branches.length}.</small>{validationReport.branch_mapping_provided&&!mappingDraftDirty&&<small>{validationReport.branch_mapping_valid?'Associações de filiais validadas no servidor.':'Associações de filiais precisam de ajustes.'}</small>}{validationReport.branch_mapping_errors.map((item,index)=><small key={'branch-map-'+index}>{item}</small>)}</>}{!validationReport.requires_user_mapping&&validationReport.source_branches.length>0&&<button type="button" className="tenant-history-button" disabled={mappingBusy} onClick={validateUserMappingDraft}>{mappingBusy?"Conferindo filiais...":"Validar associações de filiais"}</button>}
        <small>{validationReport.destination_empty?'O destino está vazio nas tabelas operacionais verificadas.':'O destino já possui dados; a restauração deverá ser bloqueada até uma estratégia segura de mesclagem ser definida.'}</small>{validationReport.occupied_tables.length>0&&<small>Registros já existentes no destino: {validationReport.occupied_tables.map(item=>item.table+' ('+item.records+')').join(', ')}. Filiais existentes podem ser reutilizadas pelo mapeamento; outras tabelas precisam estar vazias.</small>}{validationReport.restore_ready&&<div className="tenant-form-actions"><button type="button" className="tenant-primary" disabled={restoreBusy||mappingDraftDirty} onClick={restoreBackup}>{restoreBusy?'Restaurando em transação...':'Restaurar backup nesta empresa'}</button></div>}</div>}</section>}
      {tab==='orders'&&<section className="tenant-panel"><div className="tenant-panel-head"><div><b>Ordens de serviço</b><small>Atendimentos registrados na filial selecionada</small></div><button className="tenant-primary" onClick={()=>setShowOrder(v=>!v)}><Plus size={16}/> Nova OS</button></div>
        <div className="tenant-order-filters"><input type="search" aria-label="Buscar ordens" placeholder="Buscar por número, cliente, aparelho ou defeito..." value={orderSearch} onChange={e=>setOrderSearch(e.target.value)}/><select aria-label="Filtrar ordens por status" value={orderStatusFilter} onChange={e=>setOrderStatusFilter(e.target.value)}><option value="all">Todos os status</option>{statuses.map(status=><option key={status} value={status}>{statusLabels[status]}</option>)}</select><small>{orders.filter(item=>(orderStatusFilter==='all'||item.status===orderStatusFilter)&&[String(item.order_number),item.customers?.name||'',item.devices?.brand||'',item.devices?.model||'',item.reported_issue||''].join(' ').toLocaleLowerCase('pt-BR').includes(orderSearch.trim().toLocaleLowerCase('pt-BR'))).length} ordem(ns)</small></div>
        {showOrder&&<form className="tenant-form" onSubmit={submitOrder}><label>Cliente<select required value={order.customerId} onChange={e=>selectOrderCustomer(e.target.value)}><option value="">Selecione um cliente</option>{customers.map(c=><option key={c.id} value={c.id}>{c.name} · {c.phone}</option>)}</select></label><label>Aparelho cadastrado<select value={order.deviceId} disabled={!order.customerId||orderDevicesLoading} onChange={e=>setOrder({...order,deviceId:e.target.value})}><option value="">{orderDevicesLoading?'Carregando aparelhos...':orderDevices.length?'Cadastrar um novo aparelho':'Nenhum aparelho cadastrado · cadastrar novo'}</option>{orderDevices.map(device=><option key={device.id} value={device.id}>{device.brand} {device.model}{device.imei?' · IMEI '+device.imei:''}</option>)}</select></label>{order.deviceId&&<div className="tenant-order-device-selected"><b>Aparelho vinculado à OS</b><strong>{orderDevices.find(device=>device.id===order.deviceId)?.brand} {orderDevices.find(device=>device.id===order.deviceId)?.model}</strong><small>{[orderDevices.find(device=>device.id===order.deviceId)?.color,orderDevices.find(device=>device.id===order.deviceId)?.storage,orderDevices.find(device=>device.id===order.deviceId)?.imei?("IMEI "+orderDevices.find(device=>device.id===order.deviceId)?.imei):"",orderDevices.find(device=>device.id===order.deviceId)?.serial_number?("Série "+orderDevices.find(device=>device.id===order.deviceId)?.serial_number):""].filter(Boolean).join(" · ")||"Sem detalhes técnicos adicionais cadastrados"}</small></div>}<div className="tenant-grid">{!order.deviceId&&<><label>Marca<select value={order.brand} onChange={e=>setOrder({...order,brand:e.target.value})}>{['Apple','Samsung','Motorola','Xiaomi','Realme','Infinix','Outra'].map(v=><option key={v}>{v}</option>)}</select></label><label>Modelo<input required value={order.model} onChange={e=>setOrder({...order,model:e.target.value})}/></label><label>IMEI / Série<input value={order.imei} onChange={e=>setOrder({...order,imei:e.target.value})}/></label></>}<label>Valor estimado (R$)<input type="number" min="0" step="0.01" value={order.amount} onChange={e=>setOrder({...order,amount:e.target.value})}/></label><label className="wide">Defeito informado<textarea required value={order.issue} onChange={e=>setOrder({...order,issue:e.target.value})}/></label><label>Acessórios<input value={order.accessories} onChange={e=>setOrder({...order,accessories:e.target.value})}/></label><label>Condição física<input value={order.condition} onChange={e=>setOrder({...order,condition:e.target.value})}/></label></div><fieldset className="tenant-intake-checklist"><legend>Checklist de entrada do aparelho</legend><p>Marque os itens que foram testados ou conferidos no recebimento.</p><div>{intakeChecklistItems.map(label=><label key={label}><input type="checkbox" checked={Boolean(intakeChecklist[label])} onChange={e=>setIntakeChecklist(current=>({...current,[label]:e.target.checked}))}/><span>{label}</span></label>)}</div></fieldset><section className="tenant-intake-media"><b>Fotos do aparelho</b><small>Até 5 MB por imagem · JPG, PNG ou WEBP</small><input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={e=>setIntakePhotos(Array.from(e.target.files||[]).slice(0,8))}/>{intakePhotos.length>0&&<small>{intakePhotos.length} foto(s) selecionada(s)</small>}<b>Assinatura do cliente</b><small>Peça ao cliente para assinar no espaço abaixo.</small><canvas ref={signatureCanvasRef} width={640} height={180} className="tenant-signature-canvas" onPointerDown={e=>{const canvas=signatureCanvasRef.current;if(!canvas)return;signatureDrawingRef.current=true;canvas.setPointerCapture(e.pointerId);const rect=canvas.getBoundingClientRect();const ctx=canvas.getContext('2d');if(ctx){ctx.strokeStyle='#111827';ctx.lineWidth=3;ctx.lineCap='round';ctx.lineJoin='round';ctx.beginPath();ctx.moveTo((e.clientX-rect.left)*canvas.width/rect.width,(e.clientY-rect.top)*canvas.height/rect.height)}}} onPointerMove={e=>{const canvas=signatureCanvasRef.current;if(!canvas||!signatureDrawingRef.current)return;const rect=canvas.getBoundingClientRect();const ctx=canvas.getContext('2d');if(ctx){ctx.lineTo((e.clientX-rect.left)*canvas.width/rect.width,(e.clientY-rect.top)*canvas.height/rect.height);ctx.stroke();setSignatureHasInk(true)}}} onPointerUp={()=>{signatureDrawingRef.current=false}} onPointerCancel={()=>{signatureDrawingRef.current=false}}/><button type="button" onClick={()=>{const canvas=signatureCanvasRef.current;canvas?.getContext('2d')?.clearRect(0,0,canvas.width,canvas.height);setSignatureHasInk(false)}}>Limpar assinatura</button></section><div className="tenant-form-actions"><button type="button" onClick={()=>setShowOrder(false)}>Cancelar</button><button className="tenant-primary" disabled={busy}>Salvar ordem</button></div></form>}
        {loading?<p className="tenant-empty">Carregando dados...</p>:orders.filter(item=>(orderStatusFilter==='all'||item.status===orderStatusFilter)&&[String(item.order_number),item.customers?.name||'',item.devices?.brand||'',item.devices?.model||'',item.reported_issue||''].join(' ').toLocaleLowerCase('pt-BR').includes(orderSearch.trim().toLocaleLowerCase('pt-BR'))).length===0?<p className="tenant-empty">{orders.length===0?'Nenhuma ordem cadastrada nesta filial.':'Nenhuma ordem corresponde aos filtros.'}</p>:<div className="tenant-table-wrap"><table><thead><tr><th>Nº</th><th>CLIENTE / APARELHO</th><th>DEFEITO</th><th>VALOR</th><th>STATUS</th>{canAssignTechnician&&<th>TÉCNICO RESPONSÁVEL</th>}<th>HISTÓRICO</th><th>CLIENTE</th>{canAddServiceToOrder&&<th>SERVIÇO</th>}<th>IMPRIMIR</th></tr></thead><tbody>{orders.filter(item=>(orderStatusFilter==='all'||item.status===orderStatusFilter)&&[String(item.order_number),item.customers?.name||'',item.devices?.brand||'',item.devices?.model||'',item.reported_issue||''].join(' ').toLocaleLowerCase('pt-BR').includes(orderSearch.trim().toLocaleLowerCase('pt-BR'))).map(item=><tr key={item.id}><td>#{item.order_number}</td><td><b>{item.customers?.name || 'Cliente'}</b><small>{item.devices?.brand} {item.devices?.model}</small></td><td>{item.reported_issue}</td><td>{money(item.estimated_amount)}</td><td><select value={item.status} disabled={busy || !canUpdateOrders} title={!canUpdateOrders ? 'Seu perfil pode abrir OS, mas não alterar o status.' : 'Atualizar status'} onChange={e=>changeStatus(item.id,e.target.value)}>{statuses.map(status=><option key={status} value={status}>{statusLabels[status]}</option>)}</select></td>{canAssignTechnician&&<td><select value={item.technician_id||''} disabled={busy||['delivered','cancelled'].includes(item.status)} title="Atribuir técnico responsável" onChange={e=>changeTechnician(item.id,e.target.value)}><option value="">Sem técnico</option>{teamRows.filter(member=>member.member_role==='technician'&&member.is_active).map(member=><option key={member.user_id} value={member.user_id}>{member.full_name||member.phone||'Técnico'} </option>)}</select></td>}<td><button className="tenant-history-button" onClick={()=>openHistory(item)}>Ver histórico</button></td><td><button type="button" className="tenant-history-button tenant-whatsapp-button" onClick={()=>notifyCustomerWhatsApp(item)} title="Abrir WhatsApp com mensagem pronta"><MessageCircle size={14}/> Avisar</button></td>{canAddServiceToOrder&&<td><div className="tenant-order-service-action"><select value={serviceForOrder[item.id]||''} onChange={e=>setServiceForOrder(current=>({...current,[item.id]:e.target.value}))} disabled={['delivered','cancelled'].includes(item.status)}><option value="">Adicionar serviço</option>{serviceRows.filter(service=>service.active).map(service=><option key={service.id} value={service.id}>{service.name} · {money(Number(service.price))}</option>)}</select><button className="tenant-history-button" disabled={busy||!serviceForOrder[item.id]||['delivered','cancelled'].includes(item.status)} onClick={()=>attachService(item.id)}>Adicionar</button></div></td>}<td><button className="tenant-history-button" onClick={()=>printServiceOrder(item)}>Imprimir A4</button></td></tr>)}</tbody></table></div>}
      </section>}
      {tab==='customers'&&<section className="tenant-panel"><div className="tenant-panel-head"><div><b>Clientes</b><small>Cadastro compartilhado dentro da empresa</small></div><div className="tenant-customer-tools"><input className="tenant-customer-search" type="search" aria-label="Buscar clientes" placeholder="Buscar por nome, telefone ou e-mail..." value={customerSearch} onChange={e=>setCustomerSearch(e.target.value)}/><button className="tenant-primary" onClick={()=>{setEditingCustomerId(null);setCustomer({name:"",phone:"",email:""});setShowCustomer(v=>!v)}}><Plus size={16}/> Novo cliente</button></div></div>
        {showCustomer&&<form className="tenant-form" onSubmit={submitCustomer}><b>{editingCustomerId?"Editar cliente":"Novo cliente"}</b><div className="tenant-grid"><label>Nome completo<input required value={customer.name} onChange={e=>setCustomer({...customer,name:e.target.value})}/></label><label>Telefone / WhatsApp<input required value={customer.phone} onChange={e=>setCustomer({...customer,phone:e.target.value})}/></label><label className="wide">E-mail<input type="email" value={customer.email} onChange={e=>setCustomer({...customer,email:e.target.value})}/></label></div><div className="tenant-form-actions"><button type="button" onClick={()=>{setShowCustomer(false);setEditingCustomerId(null);setCustomer({name:"",phone:"",email:""})}}>Cancelar</button><button className="tenant-primary" disabled={busy}>{editingCustomerId?"Salvar alterações":"Salvar cliente"}</button></div></form>}
        {loading?<p className="tenant-empty">Carregando clientes...</p>:customers.length===0?<p className="tenant-empty">Nenhum cliente cadastrado.</p>:<div className="tenant-customer-list">{customers.filter(item=>[item.name,item.phone,item.email||""].join(" ").toLocaleLowerCase("pt-BR").includes(customerSearch.trim().toLocaleLowerCase("pt-BR"))).map(item=><article key={item.id}><Users size={18}/><div className="tenant-customer-details"><b>{item.name}</b><small>{item.phone}{item.email?" · "+item.email:""}</small></div><button type="button" className="tenant-history-button" onClick={()=>{setEditingCustomerId(item.id);setCustomer({name:item.name,phone:item.phone,email:item.email||""});setShowCustomer(true)}}>Editar</button><button type="button" className="tenant-history-button" onClick={()=>openCustomerDevices(item)}>Aparelhos</button></article>)}{customers.filter(item=>[item.name,item.phone,item.email||""].join(" ").toLocaleLowerCase("pt-BR").includes(customerSearch.trim().toLocaleLowerCase("pt-BR"))).length===0&&<p className="tenant-empty">Nenhum cliente corresponde à busca.</p>}</div>}
        {deviceCustomer&&<div className="tenant-device-panel"><div className="tenant-panel-head"><div><b>Aparelhos de {deviceCustomer.name}</b><small>Histórico de equipamentos cadastrados para este cliente</small></div><button type="button" className="tenant-history-button" onClick={()=>setDeviceCustomer(null)}>Fechar</button></div>
          <form className="tenant-form" onSubmit={submitCustomerDevice}><b>{editingDeviceId?"Editar ficha técnica":"Cadastrar aparelho"}</b><div className="tenant-grid"><label>Marca<input required value={deviceForm.brand} onChange={e=>setDeviceForm({...deviceForm,brand:e.target.value})} placeholder="Apple, Samsung, Xiaomi..."/></label><label>Modelo<input required value={deviceForm.model} onChange={e=>setDeviceForm({...deviceForm,model:e.target.value})} placeholder="iPhone 15, Galaxy A55..."/></label><label>Cor<input value={deviceForm.color} onChange={e=>setDeviceForm({...deviceForm,color:e.target.value})}/></label><label>Armazenamento<input value={deviceForm.storage} onChange={e=>setDeviceForm({...deviceForm,storage:e.target.value})} placeholder="128 GB"/></label><label>IMEI<input value={deviceForm.imei} onChange={e=>setDeviceForm({...deviceForm,imei:e.target.value})}/></label><label>Número de série<input value={deviceForm.serialNumber} onChange={e=>setDeviceForm({...deviceForm,serialNumber:e.target.value})}/></label><label className="wide">Observações<input value={deviceForm.notes} onChange={e=>setDeviceForm({...deviceForm,notes:e.target.value})}/></label></div><div className="tenant-form-actions">{editingDeviceId&&<button type="button" onClick={()=>{setEditingDeviceId(null);setDeviceForm({brand:'',model:'',color:'',storage:'',imei:'',serialNumber:'',notes:''} )}}>Cancelar edição</button>}<button className="tenant-primary" disabled={busy}>{editingDeviceId?"Salvar alterações":"Salvar aparelho"}</button></div></form>
          {deviceLoading?<p className="tenant-empty">Carregando aparelhos...</p>:customerDevices.length===0?<p className="tenant-empty">Nenhum aparelho cadastrado para este cliente.</p>:<div className="tenant-device-list">{customerDevices.map(device=>{const deviceOrders=orders.filter(item=>item.device_id===device.id);return <article key={device.id}><Smartphone size={18}/><div><b>{device.brand} {device.model}</b><small>{[device.color,device.storage,device.imei?('IMEI '+device.imei):'',device.serial_number?('Série '+device.serial_number):''].filter(Boolean).join(' · ')}</small>{device.notes&&<small>{device.notes}</small>}<div className="tenant-device-actions"><button type="button" className="tenant-history-button" onClick={()=>editCustomerDevice(device)}>Editar ficha</button><button type="button" className="tenant-history-button" onClick={()=>setDeviceHistory(device)}>Ver OS ({deviceOrders.length})</button></div></div><time>{new Date(device.created_at).toLocaleDateString('pt-BR')}</time></article>})}</div>}
        </div>}
      </section>}

      {tab==='inventory'&&<section className="tenant-panel"><div className="tenant-panel-head"><div><b>Produtos e estoque</b><small>Saldo da filial selecionada · movimentações auditadas</small></div>{canManageInventory&&<button className="tenant-primary" onClick={()=>setShowInventoryForm(v=>!v)}><Plus size={16}/> Novo produto</button>}</div>
        {showInventoryForm&&canManageInventory&&<form className="tenant-form" onSubmit={submitInventoryItem}><div className="tenant-grid"><label>Nome do produto<input required value={inventoryForm.name} onChange={e=>setInventoryForm({...inventoryForm,name:e.target.value})}/></label><label>SKU / Código<input value={inventoryForm.sku} onChange={e=>setInventoryForm({...inventoryForm,sku:e.target.value})}/></label><label>Categoria<input value={inventoryForm.category} onChange={e=>setInventoryForm({...inventoryForm,category:e.target.value})}/></label><label>Custo (R$)<input type="number" min="0" step="0.01" value={inventoryForm.costPrice} onChange={e=>setInventoryForm({...inventoryForm,costPrice:e.target.value})}/></label><label>Preço de venda (R$)<input type="number" min="0" step="0.01" value={inventoryForm.salePrice} onChange={e=>setInventoryForm({...inventoryForm,salePrice:e.target.value})}/></label><label>Estoque mínimo<input type="number" min="0" step="0.001" value={inventoryForm.minStock} onChange={e=>setInventoryForm({...inventoryForm,minStock:e.target.value})}/></label></div><div className="tenant-form-actions"><button type="button" onClick={()=>setShowInventoryForm(false)}>Cancelar</button><button className="tenant-primary" disabled={busy}>Cadastrar produto</button></div></form>}
        {stockTarget&&<form className="tenant-form" onSubmit={submitStockMovement}><b>Movimentar estoque</b><div className="tenant-grid"><label>Tipo<select value={stockForm.type} onChange={e=>setStockForm({...stockForm,type:e.target.value as 'in'|'out'|'adjustment'})}><option value="in">Entrada</option><option value="out">Saída</option><option value="adjustment">Definir saldo</option></select></label><label>Quantidade<input required type="number" min="0.001" step="0.001" value={stockForm.quantity} onChange={e=>setStockForm({...stockForm,quantity:e.target.value})}/></label><label className="wide">Motivo<input value={stockForm.reason} onChange={e=>setStockForm({...stockForm,reason:e.target.value})} placeholder="Compra, venda, perda, inventário..."/></label></div><div className="tenant-form-actions"><button type="button" onClick={()=>setStockTarget(null)}>Cancelar</button><button className="tenant-primary" disabled={busy}>Confirmar movimentação</button></div></form>}
        {loading?<p className="tenant-empty">Carregando estoque...</p>:inventory.length===0?<p className="tenant-empty">Nenhum produto cadastrado para esta filial.</p>:<div className="tenant-table-wrap"><table><thead><tr><th>PRODUTO</th><th>CATEGORIA</th><th>CUSTO</th><th>VENDA</th><th>SALDO</th><th>SITUAÇÃO</th><th>AÇÃO</th></tr></thead><tbody>{inventory.map(row=>{const item=row.inventory_items?.[0];if(!item)return null;const low=Number(row.quantity)<=Number(item.min_stock);return <tr key={row.item_id}><td><b>{item.name}</b><small>{item.sku||'Sem SKU'}</small></td><td>{item.category}</td><td>{money(Number(item.cost_price))}</td><td>{money(Number(item.sale_price))}</td><td>{Number(row.quantity).toLocaleString('pt-BR')}</td><td><span className={low?'tenant-stock-low':'tenant-stock-ok'}>{low?'Estoque baixo':'Disponível'}</span></td><td>{canManageInventory?<button className="tenant-history-button" onClick={()=>setStockTarget(row.item_id)}><ArrowDownUp size={14}/> Movimentar</button>:<span>Somente leitura</span>}</td></tr>})}</tbody></table></div>}
      </section>}




      {tab==='services'&&<section className="tenant-panel"><div className="tenant-panel-head"><div><b>Catálogo de serviços</b><small>Preços e tempo estimado · compartilhado entre as filiais</small></div>{canManageServices&&<button className="tenant-primary" onClick={()=>{setEditingServiceId(undefined);setServiceForm({name:'',description:'',category:'Reparo',price:'0',estimatedMinutes:'30',active:true});setShowServiceForm(v=>!v)}}><Plus size={16}/> Novo serviço</button>}</div>
        {showServiceForm&&canManageServices&&<form className="tenant-form" onSubmit={submitService}><div className="tenant-grid"><label>Nome do serviço<input required value={serviceForm.name} onChange={e=>setServiceForm({...serviceForm,name:e.target.value})}/></label><label>Categoria<input value={serviceForm.category} onChange={e=>setServiceForm({...serviceForm,category:e.target.value})}/></label><label>Preço (R$)<input required type="number" min="0" step="0.01" value={serviceForm.price} onChange={e=>setServiceForm({...serviceForm,price:e.target.value})}/></label><label>Tempo estimado (minutos)<input type="number" min="0" step="5" value={serviceForm.estimatedMinutes} onChange={e=>setServiceForm({...serviceForm,estimatedMinutes:e.target.value})}/></label><label className="wide">Descrição<input value={serviceForm.description} onChange={e=>setServiceForm({...serviceForm,description:e.target.value})}/></label><label><input type="checkbox" checked={serviceForm.active} onChange={e=>setServiceForm({...serviceForm,active:e.target.checked})}/> Serviço ativo</label></div><div className="tenant-form-actions"><button type="button" onClick={()=>setShowServiceForm(false)}>Cancelar</button><button className="tenant-primary" disabled={busy}>Salvar serviço</button></div></form>}
        {serviceRows.length===0?<p className="tenant-empty">Nenhum serviço cadastrado. Cadastre troca de tela, bateria, conector e reparo de placa.</p>:<div className="tenant-table-wrap"><table><thead><tr><th>SERVIÇO</th><th>CATEGORIA</th><th>PREÇO</th><th>TEMPO</th><th>SITUAÇÃO</th><th>AÇÃO</th></tr></thead><tbody>{serviceRows.map(item=><tr key={item.id}><td><b>{item.name}</b><small>{item.description||'Sem descrição'}</small></td><td>{item.category}</td><td>{money(Number(item.price))}</td><td>{item.estimated_minutes?item.estimated_minutes+' min':'Não definido'}</td><td><span className={item.active?'tenant-stock-ok':'tenant-stock-low'}>{item.active?'Ativo':'Inativo'}</span></td><td>{canManageServices?<button className="tenant-history-button" onClick={()=>editService(item)}>Editar</button>:<span>Somente leitura</span>}</td></tr>)}</tbody></table></div>}
      </section>}
      {tab==='team'&&canViewTeam&&<section className="tenant-panel"><div className="tenant-panel-head"><div><b>Equipe e permissões</b><small>Gerencie as funções e os acessos dos usuários já vinculados a esta empresa</small></div><button className="tenant-history-button" onClick={()=>listOrganizationTeam(organization.id).then(setTeamRows).catch(e=>setError(e.message||'Falha ao atualizar equipe.'))}><RefreshCw size={14}/> Atualizar equipe</button></div>
        {canManageTeam&&<form className="tenant-form" onSubmit={submitTeamInvite}><b>Convidar novo funcionário</b><div className="tenant-grid"><label className="wide">E-mail do funcionário<input required type="email" maxLength={254} value={inviteForm.email} onChange={e=>setInviteForm({...inviteForm,email:e.target.value})} placeholder="funcionario@email.com"/></label><label>Função<select value={inviteForm.role} onChange={e=>setInviteForm({...inviteForm,role:e.target.value as Exclude<TeamMember['member_role'],'owner'>})}>{role==='owner'&&<option value="admin">Administrador</option>}<option value="manager">Gerente</option><option value="attendant">Atendente</option><option value="technician">Técnico</option></select></label></div><div className="tenant-form-actions"><button className="tenant-primary" disabled={busy||!inviteForm.email.trim()}><Plus size={14}/> Enviar convite por e-mail</button></div></form>}
        {teamNotice&&<div className="tenant-team-notice"><UserCog size={17}/><span>{teamNotice}</span></div>}
        {teamRows.length===0?<p className="tenant-empty">Nenhum membro encontrado ou a migração 0007 ainda não foi aplicada.</p>:<div className="tenant-table-wrap"><table><thead><tr><th>MEMBRO</th><th>FUNÇÃO</th><th>ENTRADA</th><th>ACESSO</th><th>AÇÃO</th></tr></thead><tbody>{teamRows.map(member=><tr key={member.member_id}><td><b>{member.full_name||'Usuário sem nome'}</b><small>{member.phone||member.user_id}</small></td><td>{canManageTeam?<select value={member.member_role} disabled={busy||!member.is_active||member.user_id===undefined} onChange={e=>updateTeamRole(member,e.target.value as TeamMember['member_role'])}><option value="owner">Proprietário</option><option value="admin">Administrador</option><option value="manager">Gerente</option><option value="attendant">Atendente</option><option value="technician">Técnico</option></select>:({owner:'Proprietário',admin:'Administrador',manager:'Gerente',attendant:'Atendente',technician:'Técnico'}[member.member_role])}</td><td>{new Date(member.joined_at).toLocaleDateString('pt-BR')}</td><td><span className={member.is_active?'tenant-stock-ok':'tenant-stock-low'}>{member.is_active?'Ativo':'Inativo'}</span></td><td>{canManageTeam&&member.member_role!=='owner'&&member.user_id!==undefined?<button className="tenant-history-button" disabled={busy} onClick={()=>toggleTeamAccess(member)}>{member.is_active?'Desativar':'Reativar'}</button>:<span>—</span>}</td></tr>)}</tbody></table></div>}
      </section>}
      {tab==='sales'&&<section className="tenant-panel"><div className="tenant-panel-head"><div><b>Vendas</b><small>Venda de produtos com baixa automática no estoque e lançamento no financeiro</small></div>{canSell&&<button className="tenant-primary" onClick={()=>setShowSaleForm(v=>!v)}><Plus size={16}/> Nova venda</button>}</div>
        {showSaleForm&&canSell&&<form className="tenant-form" onSubmit={submitSale}>
          <div className="tenant-grid"><label className="wide">Produto<select value={saleForm.itemId} onChange={e=>setSaleForm({...saleForm,itemId:e.target.value})}><option value="">Selecione um produto</option>{inventory.map(row=>{const item=row.inventory_items?.[0];return item?<option key={item.id} value={item.id}>{item.name} · estoque {Number(row.quantity).toLocaleString('pt-BR')} · {money(Number(item.sale_price))}</option>:null})}</select></label><label>Quantidade<input type="number" min="0.001" step="0.001" value={saleForm.quantity} onChange={e=>setSaleForm({...saleForm,quantity:e.target.value})}/></label><label><span> </span><button type="button" className="tenant-primary" onClick={addSaleCartItem}><Plus size={14}/> Adicionar item</button></label></div>
          {saleCart.length>0&&<div className="tenant-table-wrap"><table><thead><tr><th>PRODUTO</th><th>QTD.</th><th>UNITÁRIO</th><th>TOTAL</th><th></th></tr></thead><tbody>{saleCart.map((item,index)=><tr key={index}><td>{item.name}</td><td>{item.quantity}</td><td>{money(item.unitPrice)}</td><td>{money(item.quantity*item.unitPrice)}</td><td><button type="button" className="tenant-history-button" onClick={()=>setSaleCart(rows=>rows.filter((_,i)=>i!==index))}><Trash2 size={14}/></button></td></tr>)}</tbody></table></div>}
          <div className="tenant-grid"><label>Cliente (opcional)<select value={saleForm.customerId} onChange={e=>setSaleForm({...saleForm,customerId:e.target.value})}><option value="">Venda sem cliente</option>{customers.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label>Desconto (R$)<input type="number" min="0" step="0.01" value={saleForm.discount} onChange={e=>setSaleForm({...saleForm,discount:e.target.value})}/></label><label>Pagamento<select value={saleForm.paymentMethod} onChange={e=>setSaleForm({...saleForm,paymentMethod:e.target.value as typeof saleForm.paymentMethod})}><option value="pix">PIX</option><option value="cash">Dinheiro</option><option value="debit_card">Débito</option><option value="credit_card">Crédito</option><option value="bank_transfer">Transferência</option><option value="boleto">Boleto</option><option value="other">Outro</option></select></label><label>Situação<select value={saleForm.paymentStatus} onChange={e=>setSaleForm({...saleForm,paymentStatus:e.target.value as 'paid'|'pending'})}><option value="paid">Pago</option><option value="pending">Pendente</option></select></label><label className="wide">Observações<input value={saleForm.notes} onChange={e=>setSaleForm({...saleForm,notes:e.target.value})}/></label></div>
          <div className="tenant-sale-total"><span>Total da venda</span><b>{money(saleCart.reduce((sum,item)=>sum+item.quantity*item.unitPrice,0)-Number(saleForm.discount||0))}</b></div>
          <div className="tenant-form-actions"><button type="button" onClick={()=>{setShowSaleForm(false);setSaleCart([])}}>Cancelar</button><button className="tenant-primary" disabled={busy||saleCart.length===0}><ShoppingCart size={15}/> Finalizar venda</button></div>
        </form>}
        {loading?<p className="tenant-empty">Carregando vendas...</p>:salesRows.length===0?<p className="tenant-empty">Nenhuma venda registrada nesta filial.</p>:<div className="tenant-table-wrap"><table><thead><tr><th>VENDA</th><th>DATA</th><th>CLIENTE</th><th>ITENS</th><th>TOTAL</th><th>PAGAMENTO</th><th>SITUAÇÃO</th></tr></thead><tbody>{salesRows.map(sale=><tr key={sale.id}><td>#{sale.sale_number}</td><td>{new Date(sale.created_at).toLocaleDateString('pt-BR')}</td><td>{sale.customers?.[0]?.name||'Consumidor'}</td><td>{sale.sale_items?.map(item=>item.product_name+' × '+item.quantity).join(', ')}</td><td>{money(Number(sale.total))}</td><td>{{cash:'Dinheiro',pix:'PIX',debit_card:'Débito',credit_card:'Crédito',bank_transfer:'Transferência',boleto:'Boleto',other:'Outro'}[sale.payment_method]||sale.payment_method}</td><td>{sale.payment_status==='paid'?'Pago':'Pendente'}</td></tr>)}</tbody></table></div>}
      </section>}
      {tab==='finance'&&<section className="tenant-panel"><div className="tenant-panel-head"><div><b>Fluxo de caixa</b><small>Entradas, saídas e valores pendentes desta filial</small></div>{canManageFinance&&<button className="tenant-primary" onClick={()=>setShowFinanceForm(v=>!v)}><Plus size={16}/> Novo lançamento</button>}</div>
        <div className="tenant-finance-summary"><article><small>Entradas pagas</small><b>{money(financeRows.filter(x=>x.entry_type==='income'&&x.status==='paid').reduce((n,x)=>n+Number(x.amount),0))}</b></article><article><small>Saídas pagas</small><b>{money(financeRows.filter(x=>x.entry_type==='expense'&&x.status==='paid').reduce((n,x)=>n+Number(x.amount),0))}</b></article><article><small>Saldo realizado</small><b>{money(financeRows.filter(x=>x.status==='paid').reduce((n,x)=>n+(x.entry_type==='income'?1:-1)*Number(x.amount),0))}</b></article></div>
        {showFinanceForm&&canManageFinance&&<form className="tenant-form" onSubmit={submitFinanceEntry}><div className="tenant-grid"><label>Tipo<select value={financeForm.entryType} onChange={e=>setFinanceForm({...financeForm,entryType:e.target.value as 'income'|'expense'})}><option value="income">Entrada</option><option value="expense">Saída</option></select></label><label>Valor (R$)<input required type="number" min="0.01" step="0.01" value={financeForm.amount} onChange={e=>setFinanceForm({...financeForm,amount:e.target.value})}/></label><label className="wide">Descrição<input required value={financeForm.description} onChange={e=>setFinanceForm({...financeForm,description:e.target.value})}/></label><label>Forma de pagamento<select value={financeForm.paymentMethod} onChange={e=>setFinanceForm({...financeForm,paymentMethod:e.target.value as typeof financeForm.paymentMethod})}><option value="cash">Dinheiro</option><option value="pix">PIX</option><option value="debit_card">Débito</option><option value="credit_card">Crédito</option><option value="bank_transfer">Transferência</option><option value="boleto">Boleto</option><option value="other">Outro</option></select></label><label>Situação inicial<select value={financeForm.status} onChange={e=>setFinanceForm({...financeForm,status:e.target.value as 'pending'|'paid'})}><option value="paid">Pago / recebido</option><option value="pending">Pendente</option></select></label><label>Vencimento<input type="date" value={financeForm.dueDate} onChange={e=>setFinanceForm({...financeForm,dueDate:e.target.value})}/></label><label className="wide">Observações<input value={financeForm.notes} onChange={e=>setFinanceForm({...financeForm,notes:e.target.value})}/></label></div><div className="tenant-form-actions"><button type="button" onClick={()=>setShowFinanceForm(false)}>Cancelar</button><button className="tenant-primary" disabled={busy}>Salvar lançamento</button></div></form>}
        {loading?<p className="tenant-empty">Carregando financeiro...</p>:financeRows.length===0?<p className="tenant-empty">Nenhum lançamento registrado nesta filial.</p>:<div className="tenant-table-wrap"><table><thead><tr><th>DATA</th><th>DESCRIÇÃO</th><th>TIPO</th><th>VALOR</th><th>PAGAMENTO</th><th>SITUAÇÃO</th></tr></thead><tbody>{financeRows.map(row=><tr key={row.id}><td>{new Date(row.created_at).toLocaleDateString('pt-BR')}</td><td><b>{row.description}</b><small>{row.due_date?'Vencimento: '+new Date(row.due_date+'T12:00:00').toLocaleDateString('pt-BR'):''}</small></td><td>{row.entry_type==='income'?'Entrada':'Saída'}</td><td>{money(Number(row.amount))}</td><td>{{cash:'Dinheiro',pix:'PIX',debit_card:'Débito',credit_card:'Crédito',bank_transfer:'Transferência',boleto:'Boleto',other:'Outro'}[row.payment_method]||row.payment_method}</td><td>{canManageFinance&&row.status!=='cancelled'?<select value={row.status} disabled={busy} onChange={e=>changeFinanceStatus(row.id,e.target.value as 'pending'|'paid'|'cancelled')}><option value="pending">Pendente</option><option value="paid">Pago</option><option value="cancelled">Cancelado</option></select>:row.status==='paid'?'Pago':row.status==='pending'?'Pendente':'Cancelado'}</td></tr>)}</tbody></table></div>}
      </section>}
      {tab==='reports'&&<section className="tenant-panel"><div className="tenant-panel-head"><div><b>Relatórios gerenciais</b><small>Indicadores da filial selecionada com base nos registros carregados</small></div><button className="tenant-history-button" onClick={()=>loadWorkspace()}><RefreshCw size={14}/> Atualizar dados</button></div>
        <div className="tenant-report-grid">
          <article><small>Ordens cadastradas</small><b>{orders.length}</b><span>{orders.filter(x=>!['delivered','cancelled'].includes(x.status)).length} em aberto</span></article>
          <article><small>Ordens entregues</small><b>{orders.filter(x=>x.status==='delivered').length}</b><span>{orders.length?Math.round(orders.filter(x=>x.status==='delivered').length/orders.length*100):0}% do total</span></article>
          <article><small>Vendas registradas</small><b>{salesRows.length}</b><span>{money(salesRows.reduce((sum,x)=>sum+Number(x.total||0),0))} em vendas</span></article>
          <article><small>Produtos cadastrados</small><b>{inventory.length}</b><span>{inventory.filter(row=>Number(row.quantity)<=Number(row.inventory_items?.[0]?.min_stock||0)).length} com estoque baixo</span></article>
          {canManageFinance&&<><article><small>Entradas pagas</small><b>{money(financeRows.filter(x=>x.entry_type==='income'&&x.status==='paid').reduce((sum,x)=>sum+Number(x.amount),0))}</b><span>Fluxo de caixa</span></article><article><small>Saídas pagas</small><b>{money(financeRows.filter(x=>x.entry_type==='expense'&&x.status==='paid').reduce((sum,x)=>sum+Number(x.amount),0))}</b><span>Fluxo de caixa</span></article><article><small>Saldo realizado</small><b>{money(financeRows.filter(x=>x.status==='paid').reduce((sum,x)=>sum+(x.entry_type==='income'?1:-1)*Number(x.amount),0))}</b><span>Entradas menos saídas</span></article></>}
        </div>
        <div className="tenant-report-columns"><div><h3>Ordens por situação</h3>{Object.entries(statusLabels).map(([key,label])=>{const count=orders.filter(x=>x.status===key).length;return <div className="tenant-report-row" key={key}><span>{label}</span><b>{count}</b><i><em style={{width:(orders.length?count/orders.length*100:0)+'%'}}/></i></div>})}</div><div><h3>Alertas de estoque</h3>{inventory.filter(row=>Number(row.quantity)<=Number(row.inventory_items?.[0]?.min_stock||0)).length===0?<p className="tenant-empty">Nenhum produto abaixo do estoque mínimo.</p>:inventory.filter(row=>Number(row.quantity)<=Number(row.inventory_items?.[0]?.min_stock||0)).map(row=><div className="tenant-report-row" key={row.item_id}><span>{row.inventory_items?.[0]?.name||'Produto'}</span><b>{Number(row.quantity).toLocaleString('pt-BR')}</b></div>)}</div></div>
        <p className="tenant-report-note">Os indicadores respeitam a filial selecionada e as permissões da sua função. Os totais refletem os registros retornados pelo sistema, não uma auditoria contábil ou fechamento fiscal.</p>
      </section>}
      {printOrder && <section className="tenant-print-sheet"><header><div><h1>{organization.name}</h1><p>FICHA DE RECEBIMENTO · ORDEM DE SERVIÇO</p></div><strong>OS #{printOrder.order_number}</strong></header><hr/><h2>Dados do cliente</h2><p><b>Nome:</b> {printOrder.customers?.name || '—'}</p><p><b>Telefone:</b> {printOrder.customers?.phone || '—'}</p><h2>Dados do aparelho</h2><p><b>Aparelho:</b> {printOrder.devices?.brand || '—'} {printOrder.devices?.model || ''}</p><p><b>IMEI / Série:</b> {printOrder.devices?.imei || 'Não informado'}</p><h2>Atendimento</h2><p><b>Defeito informado:</b> {printOrder.reported_issue}</p><p><b>Acessórios:</b> {printOrder.accessories || 'Não informado'}</p><p><b>Condição física:</b> {printOrder.physical_condition?.split('Checklist de entrada:')[0]?.trim() || 'Não informado'}</p><p><b>Valor estimado:</b> {money(printOrder.estimated_amount)}</p><p><b>Status:</b> {statusLabels[printOrder.status] || printOrder.status}</p><p><b>Recebido em:</b> {new Date(printOrder.received_at).toLocaleString('pt-BR')}</p>{printOrder.physical_condition?.includes('Checklist de entrada:')&&<><h2>Checklist de entrada</h2><ul className="tenant-print-checklist">{printOrder.physical_condition.split('Checklist de entrada:')[1].trim().split('\n').filter(Boolean).map((line,index)=><li key={index}>{line.replace(/^-\s*/, '☑ ')}</li>)}</ul></>}{printOrderMedia.length>0&&<><h2>Fotos e assinatura do recebimento</h2><div className="tenant-print-media">{printOrderMedia.map(media=><figure key={media.name}><img src={media.url} alt={media.name}/><figcaption>{media.name.startsWith('signature-')?'Assinatura do cliente':'Foto do aparelho'}</figcaption></figure>)}</div></>}<div className="tenant-print-terms"><p>O orçamento poderá ser alterado após avaliação técnica e autorização do cliente. Aparelhos e acessórios devem ser conferidos no ato da retirada.</p></div><div className="tenant-print-signatures"><span>Assinatura do cliente</span><span>Assinatura do responsável</span></div><button className="tenant-print-close" onClick={()=>setPrintOrder(null)}>Fechar impressão</button></section>}
      {deviceHistory && <div className="tenant-modal-backdrop" onClick={() => setDeviceHistory(null)}>
        <section className="tenant-history-modal" onClick={event => event.stopPropagation()}>
          <div className="tenant-panel-head"><div><b>Histórico do aparelho</b><small>{deviceHistory.brand} {deviceHistory.model} · {deviceCustomer?.name || 'Cliente'} · filial atual</small></div><button className="tenant-modal-close" onClick={() => setDeviceHistory(null)}>Fechar</button></div>
          {orders.filter(item => item.device_id === deviceHistory.id).length === 0
            ? <p className="tenant-empty">Nenhuma OS deste aparelho foi registrada nesta filial ainda.</p>
            : <div className="tenant-device-order-history">{orders.filter(item => item.device_id === deviceHistory.id).map(item => <article key={item.id}><div><b>OS #{item.order_number}</b><small>{new Date(item.created_at).toLocaleString('pt-BR')}</small><p>{item.reported_issue}</p></div><span className={'tenant-order-status tenant-order-status-'+item.status}>{statusLabels[item.status] || item.status}</span><strong>{money(Number(item.estimated_amount))}</strong><button type="button" className="tenant-history-button" onClick={() => { setDeviceHistory(null); openHistory(item) }}>Detalhes</button></article>)}</div>}
        </section>
      </div>}
      {historyOrder && <div className="tenant-modal-backdrop" onClick={() => setHistoryOrder(null)}>
        <section className="tenant-history-modal" onClick={event => event.stopPropagation()}>
          <div className="tenant-panel-head"><div><b>Histórico da OS #{historyOrder.order_number}</b><small>{historyOrder.customers?.name || 'Cliente'} · {historyOrder.devices?.brand} {historyOrder.devices?.model}</small></div><button className="tenant-modal-close" onClick={() => setHistoryOrder(null)}>Fechar</button></div>
          {orderIntakeMedia.length>0&&<div className="tenant-history-media"><b>Fotos e assinatura do recebimento</b><div>{orderIntakeMedia.map(media=><a key={media.name} href={media.url} target="_blank" rel="noreferrer"><img src={media.url} alt={media.name}/><small>{media.name.startsWith('signature-')?'Assinatura do cliente':'Foto do aparelho'}</small></a>)}</div></div>}{historyLoading ? <p className="tenant-empty">Carregando histórico...</p> : historyEvents.length === 0 ? <p className="tenant-empty">Nenhuma alteração registrada ainda.</p> : <div className="tenant-timeline">{historyEvents.map(event => <article key={event.id}><span className="tenant-timeline-dot" /><div><b>{statusLabels[event.to_status] || event.to_status}</b><small>{new Date(event.created_at).toLocaleString('pt-BR')}</small>{event.from_status && <p>De: {statusLabels[event.from_status] || event.from_status}</p>}{event.description && <p>{event.description}</p>}</div></article>)}</div>}
        </section>
      </div>}
      <p className="tenant-footnote">Dados vinculados à empresa e protegidos pelas políticas de acesso do banco. Faça logout ao usar um dispositivo compartilhado.</p>
    </section>
  </main>
}
