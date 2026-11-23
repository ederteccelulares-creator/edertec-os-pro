import { useCallback, useEffect, useState, type FormEvent, type ChangeEvent } from 'react'
import { Building2, ClipboardList, Users, Package, Truck, ShoppingCart, Wallet, Plus, RefreshCw, LogOut, Database, Download, LayoutDashboard, Menu, X, Smartphone, Printer, Settings, LifeBuoy, CreditCard, Receipt, ShieldCheck } from 'lucide-react'
import CompanyInventoryPanel from './CompanyInventoryPanel'
import CompanyPOSPanel from './CompanyPOSPanel'
import CompanySuppliersPanel from './CompanySuppliersPanel'
import CompanyPurchasesPanel from './CompanyPurchasesPanel'
import { SimpleReceiptsPage, PartPurchasesPage } from './CompanyReceiptsAndParts'
import CompanyCashPanel from './CompanyCashPanel'
import CompanyFinancialEntriesPanel from './CompanyFinancialEntriesPanel'
import CustomerPortalAdminPanel from './CustomerPortalAdminPanel'
import CompanySupportPanel from './CompanySupportPanel'
import CompanyTeamPanel from './CompanyTeamPanel'
import { recordCompanyServiceOrderPayment, type PaymentMethod } from '../lib/company-service-order-payments'
import { invoiceServiceOrderNet30, listCustomerOverdueReceivables, type OverdueReceivable } from '../lib/company-financial-entries'
import { listCompanyBranches, listCompanyCustomers, saveCompanyCustomer, type Company, type CompanyBranch, type CompanyCustomer, type CompanyRole, updateCompanyProfile } from '../lib/company-data'
import { createCompanyServiceOrder, createCompanyServiceOrderTrackingLink, listCompanyServiceOrders, updateCompanyServiceOrder, updateCompanyServiceOrderStatus, type CompanyServiceOrder } from '../lib/company-service-orders'
import { downloadCompanyBackup, restoreCompanyBackup } from '../lib/company-backups'
import { supabase } from '../lib/supabase'

type Props = { company: Company; role: CompanyRole; email: string; onSignOut: () => void }
const statusLabels: Record<string,string> = {received:'Recebido',diagnosis:'Em diagnóstico',waiting_approval:'Aguardando aprovação',approved:'Aprovado',in_repair:'Em conserto',waiting_parts:'Aguardando peça',ready:'Pronto',delivered:'Entregue',cancelled:'Cancelado',rejected:'Serviço recusado'}
const statusFlow = ['received','diagnosis','waiting_approval','approved','waiting_parts','in_repair','ready','delivered','cancelled','rejected']
const money = (n:number) => Number(n||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})

export default function CompanyWorkspace({company,role,email,onSignOut}:Props) {
  const [tab,setTab] = useState<'dashboard'|'orders'|'customers'|'inventory'|'suppliers'|'purchases'|'receipts'|'partPurchases'|'cash'|'entries'|'pos'|'backup'|'settings'|'customerPortal'|'support'|'team'|'plans'>('dashboard')
  const [menuOpen,setMenuOpen] = useState(false)
  const [companyInfo,setCompanyInfo] = useState(company)
  const [companySaving,setCompanySaving] = useState(false)
  const [logoFile,setLogoFile] = useState<File|null>(null)
  const [logoRemoved,setLogoRemoved] = useState(false)
  const [logoPreview,setLogoPreview] = useState(company.logo_url||'')
  const [companyForm,setCompanyForm] = useState({name:companyInfo.name,legalName:company.legal_name||'',taxId:company.tax_id||'',email:company.email||'',phone:company.phone||''})
  const [printFormat,setPrintFormat] = useState<'a4'|'thermal80'>(() => { try { return localStorage.getItem('edertec-os-print-format')==='thermal80'?'thermal80':'a4' } catch { return 'a4' } })
  const [brasiliaNow,setBrasiliaNow] = useState(()=>new Date())
  const [planInfo,setPlanInfo] = useState<{subscription_status:string|null;trial_ends_at:string|null;ends_at:string|null;plan_name:string|null}|null>(null)
  const [availablePlans,setAvailablePlans] = useState<Array<{id:string;name:string;description:string|null;price:number;billing_interval:string;max_branches:number|null;max_users:number|null}>>([])
  const [plansLoading,setPlansLoading] = useState(false)
  const [planCheckoutBusy,setPlanCheckoutBusy] = useState(false)
  const [branches,setBranches] = useState<CompanyBranch[]>([])
  const [branchId,setBranchId] = useState('')
  const [customers,setCustomers] = useState<CompanyCustomer[]>([])
  const [orders,setOrders] = useState<CompanyServiceOrder[]>([])
  const [loading,setLoading] = useState(true)
  const [busy,setBusy] = useState(false)
  const [backupBusy,setBackupBusy] = useState(false)
  const [error,setError] = useState('')
  const [notice,setNotice] = useState('')
  useEffect(()=>{if(!notice)return;const timer=window.setTimeout(()=>setNotice(''),5000);return()=>window.clearTimeout(timer)},[notice])
  useEffect(()=>{if(!error)return;const timer=window.setTimeout(()=>setError(''),8000);return()=>window.clearTimeout(timer)},[error])
  const [showOrder,setShowOrder] = useState(false)
  const [editingOrder,setEditingOrder] = useState<CompanyServiceOrder|null>(null)
  const [customerSearch,setCustomerSearch] = useState('')
  const [orderListSearch,setOrderListSearch] = useState('')
  const [showCustomer,setShowCustomer] = useState(false)
  const [showOrderCustomerForm,setShowOrderCustomerForm] = useState(false)
  const [paymentOrder,setPaymentOrder] = useState<CompanyServiceOrder|null>(null)
  const [pendingPrintOrder,setPendingPrintOrder] = useState<CompanyServiceOrder|null>(null)
  const [paymentAmount,setPaymentAmount] = useState('0')
  const [paymentMethod,setPaymentMethod] = useState<PaymentMethod>('pix')
  const [paymentNotes,setPaymentNotes] = useState('')
  const [overdueReceivables,setOverdueReceivables]=useState<OverdueReceivable[]>([])
  const [overdueDetailsOpen,setOverdueDetailsOpen]=useState(false)
  const [checkingCustomerDebt,setCheckingCustomerDebt]=useState(false)
  const [customerDebtError,setCustomerDebtError]=useState('')
  const [customerForm,setCustomerForm] = useState({name:'',phone:'',email:'',document:'',notes:''})
  const [orderPhotos,setOrderPhotos] = useState<File[]>([])
  const [orderForm,setOrderForm] = useState({customerId:'',deviceType:'Celular',brand:'',model:'',color:'',serial:'',issue:'',condition:'',accessories:'',priority:'normal' as 'low'|'normal'|'high'|'urgent',price:'0',finalPrice:'0',diagnosis:'',promisedAt:''})

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

  useEffect(()=>{
    const updateClock=()=>setBrasiliaNow(new Date())
    const timer=window.setInterval(updateClock,1000)
    return ()=>window.clearInterval(timer)
  },[])
  const brasiliaDate=new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',day:'2-digit',month:'2-digit',year:'numeric'}).format(brasiliaNow)
  const brasiliaTime=new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(brasiliaNow)

  const loadSubscriptionPlans = useCallback(async () => {
    if(!supabase){setAvailablePlans([]);return}
    setPlansLoading(true)
    try {
      const {data,error}=await supabase.from('subscription_plans')
        .select('id,name,description,price,billing_interval,max_branches,max_users')
        .eq('is_active',true).order('price',{ascending:true})
      if(error)throw error
      setAvailablePlans((data||[]) as Array<{id:string;name:string;description:string|null;price:number;billing_interval:string;max_branches:number|null;max_users:number|null}>)
    } catch(e) {
      setAvailablePlans([])
      setError(e instanceof Error?'Não foi possível carregar os planos do painel administrativo: '+e.message:'Não foi possível carregar os planos do painel administrativo.')
    } finally { setPlansLoading(false) }
  },[])

  useEffect(()=>{
    let alive=true
    if(!supabase){setPlanInfo(null);return}
    void loadSubscriptionPlans()
    supabase.rpc('get_company_access_status',{target_company_id:company.id}).then(({data,error})=>{
      if(!alive)return
      if(error){setPlanInfo(null);return}
      const row=Array.isArray(data)?data[0]:data
      setPlanInfo(row?{subscription_status:row.subscription_status??null,trial_ends_at:row.trial_ends_at??null,ends_at:row.ends_at??null,plan_name:row.plan_name??null}:null)
    })
    return ()=>{alive=false}
  },[company.id,loadSubscriptionPlans])

  const planEndDate=planInfo?.subscription_status==='trial'?planInfo.trial_ends_at:planInfo?.ends_at
  const planEndLabel=planEndDate?new Date(planEndDate).toLocaleDateString('pt-BR'):'Não informado'
  const planDaysLeft=planEndDate?Math.max(0,Math.ceil((new Date(planEndDate).getTime()-Date.now())/86400000)):null
  const planStatusLabel=planInfo?.subscription_status==='trial'?'Período de teste':planInfo?.subscription_status==='active'?'Plano ativo':planInfo?.subscription_status==='cancelled'?'Cancelado':planInfo?.subscription_status==='expired'?'Expirado':'Plano'



  async function saveCompanyDetails(event:FormEvent) {
    event.preventDefault(); setCompanySaving(true); setError(''); setNotice('')
    try {
      let logoUrl=logoRemoved?null:(companyInfo.logo_url||null)
      if(logoFile){
        if(!supabase) throw new Error('Banco de dados não configurado.')
        const ext=logoFile.name.split('.').pop()?.toLowerCase()||'png'
        const path=company.id+'/logo-'+Date.now()+'.'+ext
        const {error:uploadError}=await supabase.storage.from('company-logos').upload(path,logoFile,{upsert:true,contentType:logoFile.type,cacheControl:'3600'})
        if(uploadError) throw uploadError
        const {data}=supabase.storage.from('company-logos').getPublicUrl(path)
        logoUrl=data.publicUrl
      }
      const updated = await updateCompanyProfile({companyId:company.id,...companyForm,logoUrl})
      setCompanyInfo(updated)
      setLogoPreview(updated.logo_url||'');setLogoFile(null);setLogoRemoved(false)
      setCompanyForm({name:updated.name,legalName:updated.legal_name||'',taxId:updated.tax_id||'',email:updated.email||'',phone:updated.phone||''})
      setNotice('Dados da empresa atualizados com sucesso.')
    } catch(e) { setError(e instanceof Error?e.message:'Não foi possível salvar os dados da empresa.') }
    finally { setCompanySaving(false) }
  }

  async function restoreBackup(event:ChangeEvent<HTMLInputElement>) {
    const file=event.target.files?.[0]
    event.target.value=''
    if(!file)return
    if(!window.confirm('A restauração só funciona se os dados operacionais da empresa estiverem vazios. Deseja continuar?'))return
    setBackupBusy(true); setError(''); setNotice('')
    try {
      await restoreCompanyBackup(company.id,file)
      setNotice('Restauração concluída. Atualize os módulos para conferir os dados.')
      await load()
    } catch(e) { setError(e instanceof Error?e.message:'Não foi possível restaurar o backup.') }
    finally { setBackupBusy(false) }
  }

  async function createBackup() {
    setBackupBusy(true); setError(''); setNotice('')
    try {
      await downloadCompanyBackup(company.id)
      setNotice('Backup gerado e baixado com sucesso.')
    } catch(e) {
      setError(e instanceof Error?e.message:'Não foi possível gerar o backup.')
    } finally { setBackupBusy(false) }
  }

  async function submitCustomerFromOrder(event:FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setNotice('')
    try {
      const normalize=(value:string)=>value.replace(/\\D/g,'')
      const document=normalize(customerForm.document)
      const phone=normalize(customerForm.phone)
      const existing=customers.find(item => (document && normalize(item.document||'')===document) || (phone && normalize(item.phone||'')===phone && item.name.trim().toLowerCase()===customerForm.name.trim().toLowerCase()))
      if(existing) {
        await checkSelectedCustomerDebt(existing.id)
        setCustomerSearch(existing.name)
        setShowOrderCustomerForm(false)
        setCustomerForm({name:'',phone:'',email:'',document:'',notes:''})
        setNotice('Este cliente já estava cadastrado. O cadastro existente foi selecionado.')
        return
      }
      const created=await saveCompanyCustomer({companyId:company.id,branchId:branchId||null,...customerForm})
      setCustomers(current=>[created,...current])
      await checkSelectedCustomerDebt(created.id)
      setCustomerSearch(created.name)
      setCustomerForm({name:'',phone:'',email:'',document:'',notes:''})
      setShowOrderCustomerForm(false)
      setNotice('Cliente cadastrado e selecionado na ordem de serviço.')
    } catch(e) {setError(e instanceof Error?e.message:'Falha ao cadastrar cliente na OS.')}
    finally {setBusy(false)}
  }

  async function submitCustomer(event:FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setNotice('')
    try {
      await saveCompanyCustomer({companyId:company.id,branchId:branchId||null,...customerForm})
      setCustomerForm({name:'',phone:'',email:'',document:'',notes:''})
      setShowCustomer(false); setNotice('Cliente cadastrado.'); await load()
    } catch(e) {setError(e instanceof Error?e.message:'Falha ao cadastrar cliente.')}
    finally {setBusy(false)}
  }

  async function prepareOrderPrint(format:'a4'|'thermal80',copies:'both'|'customer'|'assistance'='both') {
    const order=pendingPrintOrder
    if(!order)return
    // Abrir a janela dentro do clique evita bloqueio de pop-up no Safari/iPhone.
    const popup=window.open('','_blank','width=900,height=700')
    if(!popup){setError('Permita janelas pop-up para imprimir a ordem de serviço.');return}
    setBusy(true);setError('')
    try {
      const link=copies==='assistance'?'':await createCompanyServiceOrderTrackingLink({companyId:company.id,orderId:order.id})
      setPendingPrintOrder(null)
      printServiceOrder(order,format,link,popup,copies)
    } catch(e) {
      popup.close()
      setError(e instanceof Error?e.message:'Não foi possível gerar o QR Code.')
    } finally {setBusy(false)}
  }

  function printServiceOrder(order:CompanyServiceOrder,format:'a4'|'thermal80',trackingUrl:string,popup:Window,copies:'both'|'customer'|'assistance'='both') {
    const customer=order.customers
    const safe=(value:unknown)=>String(value??"—").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]||ch))
    const date=(value:string|null|undefined)=>value?new Date(value).toLocaleString("pt-BR"):"—"
    const printedAt=safe(new Date().toLocaleString("pt-BR"))
    const copy=(label:string,customerCopy:boolean)=>'<section class="copy"><div class="copy-label">'+label+'</div>'
      +'<header><div class="brand">'+(companyInfo.logo_url?'<img class="company-logo-print" src="'+safe(companyInfo.logo_url)+'" alt="Logo da empresa">':'')+'<div><h1>'+safe(companyInfo.name)+'</h1><div class="muted">ORDEM DE SERVIÇO · ASSISTÊNCIA TÉCNICA</div></div></div><div class="number">OS #'+safe(order.order_number)+'<div class="muted small">Entrada: '+safe(date(order.received_at))+'</div></div></header>'
      +'<h2>Dados do cliente</h2><div class="grid"><div class="field"><b>Nome</b>'+safe(customer?.name)+'</div><div class="field"><b>Telefone</b>'+safe(customer?.phone)+'</div></div>'
      +'<h2>Equipamento</h2><div class="grid"><div class="field"><b>Tipo</b>'+safe(order.device_type)+'</div><div class="field"><b>Marca</b>'+safe(order.device_brand)+'</div><div class="field"><b>Modelo</b>'+safe(order.device_model)+'</div><div class="field"><b>Cor</b>'+safe(order.device_color)+'</div><div class="field"><b>IMEI / Série</b>'+safe(order.serial_number)+'</div><div class="field"><b>Status</b>'+safe(statusLabels[order.status]||order.status)+'</div><div class="field wide"><b>Defeito informado</b>'+safe(order.reported_issue)+'</div><div class="field wide"><b>Condição de entrada</b>'+safe(order.intake_condition)+'</div><div class="field wide"><b>Acessórios recebidos</b>'+safe(order.included_accessories)+'</div><div class="field"><b>Previsão de entrega</b>'+safe(date(order.promised_at))+'</div><div class="field"><b>Valor estimado</b>'+safe(money(order.final_price>0?order.final_price:order.estimated_price))+'</div>'
      +(customerCopy?'':'<div class="field wide"><b>Diagnóstico / Observações internas</b>'+safe(order.diagnosis||order.notes)+'</div>')+'</div>'
      +(customerCopy?'<div class="terms"><b>Comprovante do cliente:</b> guarde esta via para acompanhar e retirar seu equipamento. A entrega será realizada mediante identificação e quitação dos valores aprovados.</div>':'<div class="terms"><b>Via da assistência:</b> manter anexada ao equipamento e atualizar o andamento do serviço no sistema.</div>')
      +'<div class="signature"><div>Assinatura do cliente</div><div>Assinatura do responsável</div></div>'+(customerCopy?'<div class="qr-tracking"><div class="qr-code"></div><div><b>Acompanhe sua OS pelo celular</b><small>Aponte a câmera para o QR Code</small><small>'+safe(trackingUrl)+'</small></div></div>':'')+'<footer>Via '+label+' · Edertec OS Pro · '+safe(companyInfo.name)+' · Emitido em '+printedAt+'</footer></section>'
    const html=format==='thermal80' ? '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>OS #'+safe(order.order_number)+' — 80mm</title><style>*{box-sizing:border-box}body{font:12px monospace;color:#111;width:72mm;margin:0 auto;padding:3mm} .copy{display:block;padding:1.5mm 0 2mm;border-bottom:1px dashed #333;page-break-after:auto;break-after:auto;page-break-inside:auto;break-inside:auto}.copy:last-child{page-break-after:auto;break-after:auto}.copy-label{text-align:center;font-weight:bold;border:1px solid #111;padding:2px;margin-bottom:3px;font-size:9px}header{text-align:center;border-bottom:1px dashed #111;padding-bottom:3px}.brand{display:flex;align-items:center;justify-content:center;gap:5px}.company-logo-print{max-width:18mm;max-height:12mm;object-fit:contain}h1{font-size:13px;margin:0 0 2px}h2{font-size:10px;margin:4px 0 2px;border-bottom:1px solid #777;padding-bottom:1px}.number{font-size:13px;font-weight:bold;text-align:center;margin-top:2px}.muted{font-size:8px}.grid{display:block}.field{padding:1.5px 0;border-bottom:1px dotted #bbb;overflow-wrap:anywhere;font-size:9px;line-height:1.1}.field b{display:block;font-size:7px;text-transform:uppercase}.wide{grid-column:auto}.terms{margin-top:3px;font-size:8px;line-height:1.15}.signature{margin-top:7px;text-align:center;font-size:8px}.signature div{border-top:1px solid #111;margin:8px 0 0;padding-top:2px}footer{font-size:7px;text-align:center;margin-top:3px}.print-toolbar{position:sticky;top:0;display:flex;gap:8px;justify-content:center;padding:10px;background:#eee;border-bottom:1px solid #aaa;margin:0 -3mm 12px}.print-toolbar button{padding:9px 14px;border:0;border-radius:6px;background:#222;color:#fff;font-weight:bold} .qr-tracking{display:flex;align-items:center;gap:5px;margin-top:3px;font:7px Arial,sans-serif;overflow-wrap:anywhere}.qr-code{width:10mm;height:10mm;flex:0 0 10mm}.qr-code canvas,.qr-code img{display:block;width:10mm;height:10mm;image-rendering:pixelated}.qr-tracking small{display:block;margin-top:1px;overflow-wrap:anywhere}@page{size:80mm auto;margin:1.5mm}@media print{html,body{width:72mm;margin:0;padding:0;font-size:9px}.print-toolbar{display:none}.copy{page-break-inside:avoid;break-inside:avoid}.copy+.copy{page-break-before:always;break-before:page}}</style></head><body>'+'<div class="print-toolbar"><button onclick="window.print()">Imprimir</button><button onclick="window.close()">Voltar ao sistema</button></div>'+(copies==='both'?copy('1ª VIA · ASSISTÊNCIA',false)+copy('2ª VIA · CLIENTE',true):copies==='customer'?copy('VIA · CLIENTE',true):copy('VIA · ASSISTÊNCIA',false))+'<script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script><script>window.onload=()=>{document.querySelectorAll(".qr-code").forEach(el=>{if(window.QRCode)new QRCode(el,{text:'+JSON.stringify(trackingUrl)+',width:512,height:512,correctLevel:QRCode.CorrectLevel.M})});window.focus();setTimeout(()=>window.print(),700)}</script></body></html>' : '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>OS #'+safe(order.order_number)+' — duas vias</title><style>*{box-sizing:border-box}body{font:12px Arial,sans-serif;color:#171717;margin:0;padding:0}.copy{position:relative;min-height:0;padding:5mm 8mm;page-break-after:auto;break-after:auto}.copy+.copy{border-top:1px dashed #888;margin-top:2mm;padding-top:4mm}.copy:last-child{page-break-after:auto;break-after:auto}.copy-label{display:inline-block;background:#202020;color:#fff;padding:3px 8px;font-weight:bold;letter-spacing:.6px;font-size:8px;margin-bottom:5px}header{display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #222;padding-bottom:5px;margin-bottom:5px}.brand{display:flex;align-items:center;gap:10px}.company-logo-print{max-width:32mm;max-height:18mm;object-fit:contain}h1{font-size:15px;margin:0 0 2px}h2{font-size:10px;margin:6px 0 3px;padding-bottom:2px;border-bottom:1px solid #aaa}.muted{color:#555}.small{font-size:10px;font-weight:normal}.number{font-size:16px;font-weight:bold;text-align:right}.grid{display:grid;grid-template-columns:1fr 1fr;gap:2px 10px}.field{padding:2px 0;border-bottom:1px solid #ddd;min-height:0;font-size:9px;line-height:1.15;overflow-wrap:anywhere}.field b{display:block;font-size:7px;text-transform:uppercase;color:#555;margin-bottom:1px}.wide{grid-column:1/-1}.terms{margin-top:5px;padding:5px;border:1px solid #bbb;border-radius:3px;line-height:1.2;font-size:8px}.signature{display:grid;grid-template-columns:1fr 1fr;gap:25px;margin-top:14px}.signature div{border-top:1px solid #333;text-align:center;padding-top:3px;font-size:8px}footer{position:static;margin:4mm 0 0;border-top:1px solid #aaa;padding-top:3px;font-size:7px;color:#555} .qr-tracking{display:flex;align-items:center;gap:6px;margin-top:5px;font:8px Arial,sans-serif;overflow-wrap:anywhere}.qr-code{width:24mm;height:24mm;flex:0 0 24mm}.qr-code canvas,.qr-code img{display:block;width:24mm;height:24mm;image-rendering:pixelated}.qr-tracking small{display:block;margin-top:3px;overflow-wrap:anywhere}@page{size:A4 portrait;margin:5mm}@media print{html,body{width:100%;height:auto;padding:0;margin:0;font-size:8px}.print-toolbar{display:none}.copy,.copy:last-child{page-break-before:auto!important;break-before:auto!important;page-break-after:auto!important;break-after:auto!important;page-break-inside:auto!important;break-inside:auto!important}.copy+.copy{margin-top:1mm;padding-top:2mm}} .print-toolbar{position:sticky;top:0;display:flex;gap:10px;justify-content:center;padding:12px;background:#eee;border-bottom:1px solid #bbb;margin-bottom:14px}.print-toolbar button{padding:10px 16px;border:0;border-radius:6px;background:#222;color:#fff;font-weight:bold;cursor:pointer}</style></head><body>'+'<div class="print-toolbar"><button onclick="window.print()">Imprimir</button><button onclick="window.close()">Voltar ao sistema</button></div>'+
      (copies==='both'?copy("1ª VIA · ASSISTÊNCIA",false)+copy("2ª VIA · CLIENTE",true):copies==='customer'?copy("VIA · CLIENTE",true):copy("VIA · ASSISTÊNCIA",false))
      +'<script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script><script>window.onload=()=>{document.querySelectorAll(".qr-code").forEach(el=>{if(window.QRCode)new QRCode(el,{text:'+JSON.stringify(trackingUrl)+',width:512,height:512,correctLevel:QRCode.CorrectLevel.M})});window.focus();setTimeout(()=>window.print(),700)}</script></body></html>'
    popup.document.open();popup.document.write(html);popup.document.close()
  }

  async function checkSelectedCustomerDebt(customerId:string) {
    setOrderForm(current=>({...current,customerId}));setOverdueReceivables([]);setOverdueDetailsOpen(false);setCustomerDebtError('')
    if(!customerId)return
    setCheckingCustomerDebt(true)
    try{setOverdueReceivables(await listCustomerOverdueReceivables(company.id,customerId))}
    catch(e){setCustomerDebtError(e instanceof Error?e.message:'Não foi possível consultar as contas em atraso.')}
    finally{setCheckingCustomerDebt(false)}
  }

  async function submitOrder(event:FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setNotice('')
    try {
      if(editingOrder) {
        await updateCompanyServiceOrder({companyId:company.id,orderId:editingOrder.id,customerId:orderForm.customerId||null,deviceType:orderForm.deviceType,deviceBrand:orderForm.brand,deviceModel:orderForm.model,deviceColor:orderForm.color,serialNumber:orderForm.serial,reportedIssue:orderForm.issue,intakeCondition:orderForm.condition,includedAccessories:orderForm.accessories,priority:orderForm.priority,estimatedPrice:Number(orderForm.price||0),finalPrice:Number(orderForm.finalPrice||0),diagnosis:orderForm.diagnosis,promisedAt:orderForm.promisedAt?new Date(orderForm.promisedAt).toISOString():null})
        setNotice('OS #'+editingOrder.order_number+' atualizada com sucesso.')
      } else {
        const created = await createCompanyServiceOrder({companyId:company.id,branchId:branchId||null,customerId:orderForm.customerId||null,deviceType:orderForm.deviceType,deviceBrand:orderForm.brand,deviceModel:orderForm.model,deviceColor:orderForm.color,serialNumber:orderForm.serial,reportedIssue:orderForm.issue,intakeCondition:orderForm.condition,includedAccessories:orderForm.accessories,priority:orderForm.priority,estimatedPrice:Number(orderForm.price||0),promisedAt:orderForm.promisedAt?new Date(orderForm.promisedAt).toISOString():null,photos:orderPhotos})
        setNotice('OS #'+created.order_number+' criada com sucesso.')
      }
      setShowOrder(false); setEditingOrder(null); setOrderPhotos([]); setShowOrderCustomerForm(false)
      setOrderForm({customerId:'',deviceType:'Celular',brand:'',model:'',color:'',serial:'',issue:'',condition:'',accessories:'',priority:'normal',price:'0',finalPrice:'0',diagnosis:'',promisedAt:''})
      await load()
    } catch(e) {setError(e instanceof Error?e.message:'Falha ao salvar ordem de serviço.')}
    finally {setBusy(false)}
  }

  function editOrder(order:CompanyServiceOrder) {
    setEditingOrder(order); setOrderPhotos([]); setCustomerSearch('')
    setOrderForm({customerId:order.customer_id||'',deviceType:order.device_type||'Celular',brand:order.device_brand||'',model:order.device_model||'',color:order.device_color||'',serial:order.serial_number||'',issue:order.reported_issue||'',condition:order.intake_condition||'',accessories:order.included_accessories||'',priority:(order.priority||'normal') as typeof orderForm.priority,price:String(order.estimated_price??0),finalPrice:String(order.final_price??0),diagnosis:order.diagnosis||'',promisedAt:order.promised_at?new Date(order.promised_at).toISOString().slice(0,16):''})
    setShowOrder(true)
  }

  async function invoiceOrderNet30(order:CompanyServiceOrder) {
    setBusy(true);setError('');setNotice('')
    try { await invoiceServiceOrderNet30(company.id,order.id);setNotice('OS #'+order.order_number+' faturada para 30 dias. Consulte Contas a pagar/receber.');await load() }
    catch(e){setError(e instanceof Error?e.message:'Não foi possível faturar a OS.')}
    finally{setBusy(false)}
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

  const filteredOrders = orders.filter(o => {
    const term = orderListSearch.trim().toLocaleLowerCase('pt-BR');
    if (!term) return true;
    return [o.order_number,o.customers?.name,o.customers?.phone,o.device_brand,o.device_model,o.device_type,o.serial_number,o.reported_issue,statusLabels[o.status]||o.status]
      .some(value => String(value||'').toLocaleLowerCase('pt-BR').includes(term));
  });
  const activeOrders = orders.filter(o=>!['delivered','cancelled'].includes(o.status))
  const pendingOrders = orders.filter(o=>o.status==='waiting_approval')
  const orderRevenue = orders.reduce((sum,o)=>sum+Number(o.final_price||o.estimated_price||0),0)
  const canManage = role==='owner'||role==='admin'||role==='manager'
  const canAdmin = role==='owner'||role==='admin'
  const navigate = (next: typeof tab) => {
    if(next==='plans'&&!canAdmin)return
    const managementTabs = ['pos','customerPortal','inventory','suppliers','purchases','cash','entries']
    if (managementTabs.includes(next) && !canManage) return
    if ((next==='settings'||next==='backup'||next==='team') && !canAdmin) return
    if (next==='backup' && !canAdmin) return
    setTab(next); setMenuOpen(false); setShowOrder(false); setShowCustomer(false)
  }

  return <div className="company-app">
    <button className={menuOpen?'company-drawer-scrim visible':'company-drawer-scrim'} onClick={()=>setMenuOpen(false)} aria-label="Fechar menu"/>
    <aside className={menuOpen?'company-sidebar drawer-open':'company-sidebar'}>
      <div className="company-logo"><span><Smartphone/></span><div><b>EDERTEC <i>OS PRO</i></b><small>GESTÃO DE ASSISTÊNCIAS</small></div><button className="company-drawer-close" onClick={()=>setMenuOpen(false)} aria-label="Fechar menu"><X/></button></div>
      <div className="company-current">{companyInfo.name}</div>
      <div className="company-branch-switch">
        <label htmlFor="company-branch-select">FILIAL / MATRIZ</label>
        <select id="company-branch-select" value={branchId} onChange={e=>setBranchId(e.target.value)}>
          <option value="">Todas as filiais</option>
          {branches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </div>
      <nav>
        <button className={tab==='dashboard'?'active':''} onClick={()=>navigate('dashboard')}><LayoutDashboard size={18}/> Dashboard</button>
        <button className={tab==='orders'?'active':''} onClick={()=>navigate('orders')}><ClipboardList size={18}/> Ordens de serviço</button>
        {canManage&&<button className={tab==='pos'?'active':''} onClick={()=>navigate('pos')}><ShoppingCart size={18}/> PDV / Vendas</button>}
        <button className={tab==='customers'?'active':''} onClick={()=>navigate('customers')}><Users size={18}/> Clientes</button>
        <button className={tab==='support'?'active':''} onClick={()=>navigate('support')}><LifeBuoy size={18}/> Suporte / Chamados</button>
        {canManage&&<button className={tab==='customerPortal'?'active':''} onClick={()=>navigate('customerPortal')}><Smartphone size={18}/> Área do Cliente</button>}
        {canManage&&<button className={tab==='inventory'?'active':''} onClick={()=>navigate('inventory')}><Package size={18}/> Estoque</button>}
        {canManage&&<button className={tab==='suppliers'?'active':''} onClick={()=>navigate('suppliers')}><Truck size={18}/> Fornecedores</button>}
        {canManage&&<button className={tab==='purchases'?'active':''} onClick={()=>navigate('purchases')}><ShoppingCart size={18}/> Compras</button>}
        {canManage&&<button className={tab==='receipts'?'active':''} onClick={()=>navigate('receipts')}><Receipt size={18}/> Recibo simples</button>}
        {canManage&&<button className={tab==='partPurchases'?'active':''} onClick={()=>navigate('partPurchases')}><ShieldCheck size={18}/> Compra de peças</button>}
        {canManage&&<button className={tab==='cash'?'active':''} onClick={()=>navigate('cash')}><Wallet size={18}/> Fluxo de caixa</button>}
        {canManage&&<button className={tab==='entries'?'active':''} onClick={()=>navigate('entries')}><Wallet size={18}/> Contas a pagar/receber</button>}
        {canAdmin&&<button className={tab==='team'?'active':''} onClick={()=>navigate('team')}><Users size={18}/> Funcionários e usuários</button>}
        {canAdmin&&<button className={tab==='backup'?'active':''} onClick={()=>navigate('backup')}><Database size={18}/> Backup e segurança</button>}
        {canAdmin&&<button className={tab==='plans'?'active':''} onClick={()=>navigate('plans')}><CreditCard size={18}/> Planos e assinatura</button>}
        {canAdmin&&<button className={tab==='settings'?'active':''} onClick={()=>navigate('settings')}><Settings size={18}/> Configurações</button>}
      </nav>
      <div className="company-user"><b>{email}</b><small>Perfil: {role}</small><button onClick={onSignOut}><LogOut size={15}/> Sair</button></div>
    </aside>
    <main className="company-main">
      <div className="company-mobilebar"><button onClick={()=>setMenuOpen(true)} aria-label="Abrir menu"><Menu/></button><div><b>EDERTEC <i>OS PRO</i></b><small>{companyInfo.name}</small></div><span className="company-mobile-avatar">{(email[0]||'U').toUpperCase()}</span></div>
      <header className="company-top"><div><small>PAINEL DA ASSISTÊNCIA</small><h1>{tab==='dashboard'?'Dashboard':tab==='orders'?'Ordens de serviço':tab==='customers'?'Clientes':tab==='inventory'?'Estoque e produtos':tab==='suppliers'?'Fornecedores':tab==='purchases'?'Compras e recebimento':tab==='receipts'?'Recibo simples':tab==='partPurchases'?'Registro de compra de peças':tab==='backup'?'Backup de dados':tab==='settings'?'Configurações':tab==='team'?'Funcionários e usuários':tab==='customerPortal'?'Compartilhar Área do Cliente':tab==='support'?'Suporte e chamados':tab==='pos'?'PDV / Vendas':tab==='plans'?'Planos e assinatura':'Financeiro'}</h1></div><div className="company-top-actions"><div className="company-brasilia-clock"><b>{brasiliaTime}</b><span>{brasiliaDate}</span><small>Horário de Brasília</small></div><div className={'company-plan-period '+(planInfo?.subscription_status==='trial'?'is-trial':!planInfo?.subscription_status||planInfo?.subscription_status==='expired'?'is-unsubscribed':'')}>
          <b>{planInfo?.plan_name||(planInfo?.subscription_status==='trial'?'Período de teste':'Nenhum plano contratado')}</b>
          {planInfo?.subscription_status==='trial'?<>
            <span>Você está no período de teste</span>
            <small>{planDaysLeft===null?'Consulte a data de encerramento':planDaysLeft===0?'Seu teste termina hoje':'Restam '+planDaysLeft+' dia(s) de teste'}</small>
          </>:!planInfo?.subscription_status||planInfo?.subscription_status==='expired'?<>
            <span>{planInfo?.subscription_status==='expired'?'Seu período de acesso terminou':'Sua empresa está sem plano contratado'}</span>
            <small>Escolha um plano para manter o acesso ao sistema.</small>
          </>:<>
            <span>{planStatusLabel} · até {planEndLabel}</span>
            {planDaysLeft!==null&&<small>{planDaysLeft===0?'Vence hoje':planDaysLeft+' dia(s) restante(s)'}</small>}
          </>}
          {canAdmin&&(planInfo?.subscription_status==='trial'||!planInfo?.subscription_status||planInfo?.subscription_status==='expired')&&<button type="button" onClick={()=>navigate('plans')}>{planInfo?.subscription_status==='trial'?'Ver planos':'Contratar plano'}</button>}
        </div><button className="company-icon-button" onClick={()=>void load()} title="Atualizar"><RefreshCw size={16}/></button></div></header>
      {tab==='customerPortal'&&<CustomerPortalAdminPanel company={company} customers={customers}/>}
      {tab==='support'&&<CompanySupportPanel companyId={company.id} companyName={company.name}/ >}
      {tab==='team'&&canAdmin&&<CompanyTeamPanel companyId={company.id} actorRole={role}/ >}
      {tab==='plans'&&canAdmin&&<section className="company-panel company-subscription-panel">
        <div className="company-panel-head"><div><b>Meu plano e assinatura</b><small>Planos publicados pelo Super Admin para contratação</small></div><button className="company-secondary" onClick={()=>void loadSubscriptionPlans()} disabled={plansLoading}><RefreshCw size={15}/> {plansLoading?'Carregando...':'Atualizar planos'}</button></div>
        <div className="company-subscription-current"><div><small>PLANO ATUAL</small><h2>{planInfo?.plan_name||'Nenhum plano contratado'}</h2><p>{planStatusLabel} · {planEndDate?'Válido até '+new Date(planEndDate).toLocaleDateString('pt-BR'):'Vencimento não informado'}</p></div><span>{planInfo?.subscription_status==='active'||planInfo?.subscription_status==='trial'?'Em dia':'Verificar assinatura'}</span></div>
        <h3>Planos disponíveis</h3>
         {plansLoading ? (
           <p className="company-subscription-note">Carregando planos cadastrados pelo Super Admin...</p>
         ) : availablePlans.length === 0 ? (
           <p className="company-subscription-note">Nenhum plano ativo foi publicado para contratação no momento. Verifique o cadastro e o status dos planos no Painel Super Admin.</p>
         ) : (
           <div className="company-subscription-grid">
             {availablePlans.map((plan) => (
               <article key={plan.id}>
                 <small>EDERTEC OS PRO</small>
                 <h3>{plan.name}</h3>
                 <p>{plan.description || 'Acesso ao sistema de gestão para assistência técnica.'}</p>
                 <strong>{money(Number(plan.price))}</strong>
                 <span>{plan.billing_interval === 'yearly' ? 'por ano' : plan.billing_interval === 'monthly' ? 'por mês' : plan.billing_interval === 'six_months' ? 'por 6 meses' : plan.billing_interval === 'lifetime' ? 'pagamento único' : plan.billing_interval}</span>
                 <p>{plan.max_branches === null ? 'Filiais sem limite' : plan.max_branches + ' filial(is)'} · {plan.max_users === null ? 'Usuários sem limite' : plan.max_users + ' usuário(s)'}</p>
                 <button className="company-primary" disabled={planCheckoutBusy || Number(plan.price) <= 0} onClick={async () => {
                   if (!supabase) return;
                   setPlanCheckoutBusy(true);
                   setError('');
                   try {
                     const { data, error } = await supabase.functions.invoke('mercadopago-billing', { body: { company_id: company.id, plan_id: plan.id } });
                     if (error) throw error;
                     if (!data?.checkout_url) throw new Error(data?.error || 'Não foi possível abrir o checkout.');
                     window.location.assign(data.checkout_url);
                   } catch (e) {
                     setError(e instanceof Error ? e.message : 'Falha ao iniciar pagamento.');
                     setPlanCheckoutBusy(false);
                   }
                 }}>{planCheckoutBusy ? 'Abrindo checkout...' : 'Contratar / Renovar'}</button>
               </article>
             ))}
           </div>
         )}
        <p className="company-subscription-note">Ao contratar ou renovar, você será direcionado ao checkout seguro do Mercado Pago. O plano será atualizado após a confirmação do pagamento.</p>
      </section>}

      {tab==='dashboard'&&<section className="company-dashboard">
        <p className="company-dashboard-subtitle">Visão geral da assistência técnica</p>
        <div className="company-dashboard-stats">
          <article className="pink"><span><ClipboardList/></span><div><b>OS Ativas</b><strong>{activeOrders.length}</strong><small>ordens em andamento</small></div></article>
          <article className="blue"><span><Users/></span><div><b>Clientes</b><strong>{customers.length}</strong><small>cadastrados</small></div></article>
          <article className="green"><span><Package/></span><div><b>Aguardando aprovação</b><strong>{pendingOrders.length}</strong><small>aguardando retorno do cliente</small></div></article>
          {canManage&&<article className="orange"><span><Wallet/></span><div><b>Valores em OS</b><strong>{money(orderRevenue)}</strong><small>valor total registrado</small></div></article>}
        </div>
        <section className="company-panel company-dashboard-recent"><div className="company-panel-head"><div><b>Últimas ordens de serviço</b><small>Acompanhe os atendimentos recentes</small></div><button className="company-text-link" onClick={()=>navigate('orders')}>Ver todas →</button></div>
          {loading?<p className="company-empty">Carregando...</p>:orders.length===0?<p className="company-empty">Nenhuma OS registrada</p>:orders.slice(0,5).map(o=><div className="company-dashboard-order" key={o.id}><span>#{o.order_number}</span><div><b>{o.customers?.name||'Cliente não informado'}</b><small>{[o.device_brand,o.device_model].filter(Boolean).join(' ')}</small></div><em>{statusLabels[o.status]||o.status}</em></div>)}
        </section>
      </section>}
      {error&&<div className="company-error-banner">{error}</div>}{notice&&<div className="company-notice-banner">{notice}</div>}
      {tab==='orders'&&<section className="company-panel">
        <div className="company-panel-head"><div><b>Ordens cadastradas</b><small>{filteredOrders.length} de {orders.length} ordens</small></div><button className="company-primary" onClick={()=>setShowOrder(v=>!v)}><Plus size={16}/> Nova OS</button></div>
        <label className="company-order-search"><span>Procurar ordem de serviço</span><input type="search" placeholder="Número da OS, cliente, telefone, aparelho, IMEI ou defeito..." value={orderListSearch} onChange={e=>setOrderListSearch(e.target.value)}/></label>
        {showOrder&&<form className="company-form" onSubmit={submitOrder}>
          <h3>{editingOrder ? 'Editar ordem de serviço #' + editingOrder.order_number : 'Dados do atendimento'}</h3>
          <label>Buscar cliente<input type="search" placeholder="Digite nome, telefone ou CPF/CNPJ..." value={customerSearch} onChange={e=>setCustomerSearch(e.target.value)}/></label>
          <label>Selecionar cliente<select value={orderForm.customerId} onChange={e=>void checkSelectedCustomerDebt(e.target.value)}><option value="">Cliente não selecionado</option>{customers.filter(c=>!customerSearch.trim()||[c.name,c.phone,c.document].some(v=>String(v||"").toLowerCase().includes(customerSearch.trim().toLowerCase()))).map(c=><option key={c.id} value={c.id}>{c.name} · {c.phone||"sem telefone"}</option>)}</select></label>
          {customerSearch.trim()&&customers.filter(c=>[c.name,c.phone,c.document].some(v=>String(v||"").toLowerCase().includes(customerSearch.trim().toLowerCase()))).length===0&&<small>Nenhum cliente encontrado. Você pode cadastrá-lo aqui mesmo.</small>}
          <div className="company-inline-actions"><button type="button" className="company-secondary company-small-action" onClick={()=>{setCustomerForm({name:customerSearch.trim(),phone:'',email:'',document:'',notes:''});setShowOrderCustomerForm(v=>!v)}}><Plus size={14}/> Cadastrar novo cliente</button></div>
          {showOrderCustomerForm&&<form className="company-form company-order-customer-form" onSubmit={submitCustomerFromOrder}>
            <h4>Novo cliente para esta OS</h4>
            <div className="company-form-grid">
              <label>Nome completo<input required autoFocus value={customerForm.name} onChange={e=>setCustomerForm({...customerForm,name:e.target.value})} placeholder="Nome do cliente"/></label>
              <label>Telefone / WhatsApp<input value={customerForm.phone} onChange={e=>setCustomerForm({...customerForm,phone:e.target.value})} placeholder="(00) 00000-0000"/></label>
              <label>CPF / CNPJ<input value={customerForm.document} onChange={e=>setCustomerForm({...customerForm,document:e.target.value})} placeholder="Documento do cliente"/></label>
              <label>E-mail<input type="email" value={customerForm.email} onChange={e=>setCustomerForm({...customerForm,email:e.target.value})} placeholder="cliente@email.com"/></label>
            </div>
            <label>Observações<input value={customerForm.notes} onChange={e=>setCustomerForm({...customerForm,notes:e.target.value})} placeholder="Informações adicionais (opcional)"/></label>
            <div className="company-form-actions"><button type="button" className="company-secondary" onClick={()=>setShowOrderCustomerForm(false)}>Cancelar</button><button className="company-primary" disabled={busy}><Plus size={14}/> Salvar e selecionar cliente</button></div>
          </form>}
          {checkingCustomerDebt&&<div className="company-debt-checking">Consultando contas em atraso do cliente...</div>}
          {customerDebtError&&<div className="company-error-banner">{customerDebtError}</div>}
          {overdueReceivables.length>0&&<div className="company-overdue-alert"><div className="company-overdue-alert-head"><b>⚠ Cliente possui dívida em atraso</b><strong>{money(overdueReceivables.reduce((sum,item)=>sum+Number(item.amount),0))}</strong></div><p>Existem {overdueReceivables.length} conta(s) a receber vencida(s) para este cliente.</p><div className="company-inline-actions"><button type="button" className="company-secondary company-small-action" onClick={()=>setOverdueDetailsOpen(v=>!v)}>{overdueDetailsOpen?'Ocultar detalhes':'Ver detalhes da dívida'}</button><button type="button" className="company-primary company-small-action" onClick={()=>setOverdueReceivables([])}>Prosseguir com a nova OS</button></div>{overdueDetailsOpen&&<div className="company-overdue-details">{overdueReceivables.map(item=><div key={item.id}><b>{item.source_order_number?'OS #'+item.source_order_number:item.description}</b><span>{item.description}</span><strong>{money(item.amount)}</strong><small>Vencimento: {new Date(item.due_date+'T12:00:00').toLocaleDateString('pt-BR')}</small></div>)}</div>}</div>}
          <div className="company-form-grid"><label>Tipo<input value={orderForm.deviceType} onChange={e=>setOrderForm({...orderForm,deviceType:e.target.value})}/></label><label>Marca<input value={orderForm.brand} onChange={e=>setOrderForm({...orderForm,brand:e.target.value})}/></label><label>Modelo<input required value={orderForm.model} onChange={e=>setOrderForm({...orderForm,model:e.target.value})}/></label><label>Cor<input value={orderForm.color} onChange={e=>setOrderForm({...orderForm,color:e.target.value})}/></label><label>IMEI / Série<input value={orderForm.serial} onChange={e=>setOrderForm({...orderForm,serial:e.target.value})}/></label><label>Prioridade<select value={orderForm.priority} onChange={e=>setOrderForm({...orderForm,priority:e.target.value as typeof orderForm.priority})}><option value="low">Baixa</option><option value="normal">Normal</option><option value="high">Alta</option><option value="urgent">Urgente</option></select></label></div>
          <label>Defeito informado<textarea required rows={3} value={orderForm.issue} onChange={e=>setOrderForm({...orderForm,issue:e.target.value})}/></label>{role!=='attendant'&&<label>Diagnóstico / serviço a realizar<textarea rows={3} value={orderForm.diagnosis} onChange={e=>setOrderForm({...orderForm,diagnosis:e.target.value})}/></label>}
          <div className="company-form-grid"><label>Condição de entrada<input value={orderForm.condition} onChange={e=>setOrderForm({...orderForm,condition:e.target.value})}/></label><label>Acessórios<input value={orderForm.accessories} onChange={e=>setOrderForm({...orderForm,accessories:e.target.value})}/></label>{canManage&&<><label>Valor estimado (R$)<input type="number" min="0" step="0.01" value={orderForm.price} onChange={e=>setOrderForm({...orderForm,price:e.target.value})}/></label><label>Valor final do orçamento (R$)<input type="number" min="0" step="0.01" value={orderForm.finalPrice} onChange={e=>setOrderForm({...orderForm,finalPrice:e.target.value})}/></label></>}<label>Previsão de entrega<input type="datetime-local" value={orderForm.promisedAt} onChange={e=>setOrderForm({...orderForm,promisedAt:e.target.value})}/></label></div>
          {!editingOrder&&<div className="company-os-photo-upload"><b>Fotos do aparelho (somente no sistema)</b><small>As imagens ficam anexadas à OS e não aparecem nas vias impressas.</small>
            <div className="company-os-photo-actions">
              <label className="company-secondary"><span>📷 Tirar foto</span><input type="file" accept="image/*" capture="environment" multiple onChange={e=>setOrderPhotos(old=>[...old,...Array.from(e.target.files||[])].slice(0,10))}/></label>
              <label className="company-secondary"><span>＋ Anexar da galeria</span><input type="file" accept="image/*" multiple onChange={e=>setOrderPhotos(old=>[...old,...Array.from(e.target.files||[])].slice(0,10))}/></label>
            </div>
            {orderPhotos.length>0&&<div className="company-os-photo-previews">{orderPhotos.map((file,index)=><div key={index}><img src={URL.createObjectURL(file)} alt={file.name}/><button type="button" onClick={()=>setOrderPhotos(old=>old.filter((_,i)=>i!==index))}>Remover</button></div>)}</div>}
            <small>{orderPhotos.length}/10 fotos selecionadas · JPG, PNG ou WebP · até 8 MB cada</small>
          </div>}
          <div className="company-form-actions"><button type="button" className="company-secondary" onClick={()=>{setShowOrder(false);setEditingOrder(null)}}>Cancelar</button><button className="company-primary" disabled={busy}>{busy?'Salvando...':editingOrder?'Salvar alterações':'Criar ordem de serviço'}</button></div>
        </form>}
        {loading?<p className="company-empty">Carregando...</p>:orders.length===0?<p className="company-empty">Nenhuma OS cadastrada nesta filial.</p>:filteredOrders.length===0?<p className="company-empty">Nenhuma ordem encontrada para essa pesquisa.</p>:<div className="company-table-wrap"><table><thead><tr><th>OS</th><th>CLIENTE</th><th>APARELHO</th><th>DEFEITO</th>{canManage&&<th>VALOR</th>}<th>STATUS</th><th>GARANTIA</th><th>PAGAMENTO</th><th>FOTOS</th><th>AÇÕES</th></tr></thead><tbody>{filteredOrders.map(o=><tr key={o.id}><td><b>#{o.order_number}</b><small>{new Date(o.received_at).toLocaleDateString('pt-BR')}</small></td><td>{o.customers?.name||'—'}<small>{o.customers?.phone||''}</small></td><td>{[o.device_brand,o.device_model].filter(Boolean).join(' ')||o.device_type||'—'}<small>{o.serial_number||''}</small></td><td>{o.reported_issue}</td>{canManage&&<td>{money(o.estimated_price)}</td>}<td><select disabled={busy||role==='attendant'} value={o.status} onChange={e=>void changeStatus(o,e.target.value)}>{statusFlow.map(s=><option key={s} value={s}>{statusLabels[s]}</option>)}</select></td><td>{o.warranty_expires_at&&o.warranty_started_at?<small><b>{new Date(o.warranty_expires_at).getTime()>=Date.now()?'Garantia ativa':'Garantia expirada'}</b><br/>Até {new Date(o.warranty_expires_at).toLocaleDateString('pt-BR')}<br/>{Math.max(0,Math.ceil((new Date(o.warranty_expires_at).getTime()-Date.now())/86400000))} dia(s) restantes</small>:o.status==='delivered'?<small>Garantia não registrada</small>:<small>Inicia na entrega</small>}</td>{canManage&&<td><div className="company-inline-actions"><button className="company-secondary company-small-action" disabled={busy||o.status==='cancelled'} onClick={()=>{setPaymentOrder(o);setPaymentAmount(String(o.final_price>0?o.final_price:o.estimated_price));setPaymentMethod('pix')}}>Receber</button><button className="company-secondary company-small-action" disabled={busy||o.status==='cancelled'||o.status==='rejected'||!o.customer_id} onClick={()=>void invoiceOrderNet30(o)}>Faturar 30 dias</button></div></td>}<td>{o.photo_urls?.length?<div className="company-os-photo-list">{o.photo_urls.map((url,i)=><a key={i} href={url} target="_blank" rel="noreferrer"><img src={url} alt={`Foto da OS ${o.order_number} ${i+1}`}/></a>)}</div>:<small>—</small>}<button className="company-secondary company-small-action" onClick={()=>setPendingPrintOrder(o)} title="Imprimir ordem de serviço"><Printer size={15}/> Imprimir</button><button className="company-secondary company-small-action" disabled={busy} onClick={()=>editOrder(o)} title="Editar ordem de serviço">Editar</button></td></tr>)}</tbody></table></div>}
      </section>}
      {pendingPrintOrder&&<div className="company-modal-backdrop"><div className="company-form company-payment-modal"><h3>Escolher formato de impressão</h3><p>OS #{pendingPrintOrder.order_number} · {pendingPrintOrder.customers?.name||'Cliente'}</p><div className="company-form-actions"><button type="button" className="company-primary" disabled={busy} onClick={()=>void prepareOrderPrint(printFormat,'both')}>Imprimir duas vias · {printFormat==='a4'?'A4':'Térmica 80 mm'}</button><button type="button" className="company-secondary" disabled={busy} onClick={()=>void prepareOrderPrint(printFormat,'customer')}>Somente via do cliente</button><button type="button" className="company-secondary" disabled={busy} onClick={()=>void prepareOrderPrint(printFormat,'assistance')}>Somente via da assistência</button><button type="button" className="company-secondary" disabled={busy} onClick={()=>void prepareOrderPrint(printFormat==='a4'?'thermal80':'a4','both')}>Alternar para {printFormat==='a4'?'térmica 80 mm':'A4'}</button><button type="button" className="company-secondary" onClick={()=>setPendingPrintOrder(null)}>Cancelar</button></div></div></div>}
      {canManage&&paymentOrder&&<div className="company-modal-backdrop"><form className="company-form company-payment-modal" onSubmit={submitOrderPayment}><h3>Receber pagamento · OS #{paymentOrder.order_number}</h3><p>{paymentOrder.customers?.name||'Cliente não informado'} · {[paymentOrder.device_brand,paymentOrder.device_model].filter(Boolean).join(' ')}</p><label>Valor recebido (R$)<input required type="number" min="0.01" step="0.01" value={paymentAmount} onChange={e=>setPaymentAmount(e.target.value)}/></label><label>Forma de pagamento<select value={paymentMethod} onChange={e=>setPaymentMethod(e.target.value as PaymentMethod)}><option value="pix">PIX</option><option value="cash">Dinheiro</option><option value="debit_card">Cartão de débito</option><option value="credit_card">Cartão de crédito</option><option value="bank_transfer">Transferência</option><option value="boleto">Boleto</option><option value="other">Outro</option></select></label><label>Observações<input value={paymentNotes} onChange={e=>setPaymentNotes(e.target.value)}/></label><div className="company-form-actions"><button type="button" className="company-secondary" onClick={()=>setPaymentOrder(null)}>Cancelar</button><button className="company-primary" disabled={busy}>{busy?'Registrando...':'Confirmar recebimento'}</button></div></form></div>}
      {tab==='pos'&&<CompanyPOSPanel company={company}/>}{tab==='inventory'&&<CompanyInventoryPanel company={company}/>}{tab==='suppliers'&&<CompanySuppliersPanel company={company}/>}{tab==='purchases'&&<CompanyPurchasesPanel company={company}/>}{tab==='receipts'&&<SimpleReceiptsPage company={company}/>}{tab==='partPurchases'&&<PartPurchasesPage company={company}/>}{tab==='cash'&&<CompanyCashPanel company={company}/>}{tab==='entries'&&<CompanyFinancialEntriesPanel company={company}/>}
      {tab==='backup'&&(role==='owner'||role==='admin')&&<section className="company-panel">
        <div className="company-panel-head"><div><b>Backup da assistência</b><small>Exportação segura dos dados operacionais desta empresa</small></div><Database size={22}/></div>
        <div className="company-backup-content">
          <p>Gere um arquivo JSON com filiais, clientes, funcionários, serviços, produtos, ordens de serviço, estoque, compras e registros financeiros.</p>
          <p>O backup pertence exclusivamente a <strong>{companyInfo.name}</strong>. Dados de acesso, senhas, usuários de autenticação e assinaturas não são incluídos.</p>
          <button className="company-primary" disabled={backupBusy} onClick={()=>void createBackup()}><Download size={16}/>{backupBusy?'Processando...':'Baixar backup agora'}</button>
          <div className="company-backup-restore"><b>Restaurar backup</b><p>Use somente um arquivo JSON desta mesma empresa. A restauração é bloqueada se já existirem dados operacionais para evitar mesclagem ou duplicação.</p><label className="company-secondary">Selecionar arquivo JSON<input type="file" accept="application/json,.json" disabled={backupBusy} onChange={restoreBackup}/></label></div>
          <small>Recomendação: guarde uma cópia em local seguro e faça novos backups regularmente.</small>
        </div>
      </section>}
      {tab==='customers'&&<section className="company-panel">
        <div className="company-panel-head"><div><b>Cadastro de clientes</b><small>{customers.length} clientes cadastrados</small></div><button className="company-primary" onClick={()=>setShowCustomer(v=>!v)}><Plus size={16}/> Novo cliente</button></div>
        {showCustomer&&<form className="company-form" onSubmit={submitCustomer}><div className="company-form-grid"><label>Nome<input required value={customerForm.name} onChange={e=>setCustomerForm({...customerForm,name:e.target.value})}/></label><label>Telefone<input value={customerForm.phone} onChange={e=>setCustomerForm({...customerForm,phone:e.target.value})}/></label><label>E-mail<input type="email" value={customerForm.email} onChange={e=>setCustomerForm({...customerForm,email:e.target.value})}/></label><label>CPF / CNPJ<input value={customerForm.document} onChange={e=>setCustomerForm({...customerForm,document:e.target.value})}/></label></div><label>Observações<input value={customerForm.notes} onChange={e=>setCustomerForm({...customerForm,notes:e.target.value})}/></label><div className="company-form-actions"><button type="button" className="company-secondary" onClick={()=>setShowCustomer(false)}>Cancelar</button><button className="company-primary" disabled={busy}>Salvar cliente</button></div></form>}
        {loading?<p className="company-empty">Carregando...</p>:customers.length===0?<p className="company-empty">Nenhum cliente cadastrado.</p>:<div className="company-table-wrap"><table><thead><tr><th>NOME</th><th>TELEFONE</th><th>E-MAIL</th><th>DOCUMENTO</th></tr></thead><tbody>{customers.map(c=><tr key={c.id}><td>{c.name}</td><td>{c.phone||'—'}</td><td>{c.email||'—'}</td><td>{c.document||'—'}</td></tr>)}</tbody></table></div>}
      </section>}
      {tab==='settings'&&<section className="company-settings-stack">
        <div className="company-panel">
          <div className="company-panel-head"><div><b>Dados da empresa</b><small>Informações exibidas nas ordens de serviço</small></div><Building2 size={22}/></div>
          <form className="company-print-settings" onSubmit={saveCompanyDetails}>
            <label>Nome fantasia<input required minLength={2} value={companyForm.name} onChange={e=>setCompanyForm(v=>({...v,name:e.target.value}))} placeholder="Nome da assistência"/></label>
            <label>Razão social<input value={companyForm.legalName} onChange={e=>setCompanyForm(v=>({...v,legalName:e.target.value}))} placeholder="Razão social"/></label>
            <label>CPF ou CNPJ<input value={companyForm.taxId} onChange={e=>setCompanyForm(v=>({...v,taxId:e.target.value}))} placeholder="Documento da empresa"/></label>
            <label>E-mail<input type="email" value={companyForm.email} onChange={e=>setCompanyForm(v=>({...v,email:e.target.value}))} placeholder="contato@empresa.com"/></label>
            <label>Telefone / WhatsApp<input value={companyForm.phone} onChange={e=>setCompanyForm(v=>({...v,phone:e.target.value}))} placeholder="(00) 00000-0000"/></label>
            <label>Logo da empresa (PNG, JPG ou WebP · até 5 MB)<input type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>{const file=e.target.files?.[0]||null;if(file&&file.size>5*1024*1024){setError('A logo deve ter no máximo 5 MB.');e.target.value='';return}setLogoFile(file);if(file){setLogoRemoved(false);setLogoPreview(URL.createObjectURL(file))}}}/></label>
            {logoPreview&&<div className="company-logo-preview"><img src={logoPreview} alt="Prévia da logo da empresa"/><button type="button" className="company-secondary" onClick={()=>{setLogoFile(null);setLogoPreview('');setLogoRemoved(true)}}>Remover logo</button></div>}
            <small>A logo será exibida no cabeçalho das vias impressas da OS.</small>
            <button className="company-primary" type="submit" disabled={companySaving}>{companySaving?'Salvando...':'Salvar dados da empresa'}</button>
          </form>
        </div>
        <div className="company-panel">
        <div className="company-panel-head"><div><b>Configurações de impressão</b><small>Escolha o formato padrão das ordens de serviço</small></div><Printer size={22}/></div>
        <div className="company-print-settings">
          <label htmlFor="os-print-format">Formato da impressão</label>
          <select id="os-print-format" value={printFormat} onChange={e=>{const value=e.target.value as 'a4'|'thermal80';setPrintFormat(value);try{localStorage.setItem('edertec-os-print-format',value)}catch{}}}>
            <option value="a4">A4 — duas vias em páginas A4</option>
            <option value="thermal80">Térmica 80 mm — bobina, duas vias</option>
          </select>
          <p>{printFormat==='thermal80'?'A OS será formatada para impressora térmica de 80 mm, com uma via da assistência e outra do cliente.':'A OS será gerada em duas páginas A4, uma para a assistência e outra para o cliente.'}</p>
        </div>
        </div>
      </section>}
      <footer className="company-footer">Dados protegidos por políticas de acesso do banco · {companyInfo.name}</footer>
    </main>
  </div>
}
