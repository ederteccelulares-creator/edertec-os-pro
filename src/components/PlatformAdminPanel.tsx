import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Building2, ShieldCheck, CreditCard, Package, RefreshCw, LogOut, Plus, LifeBuoy, Menu, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import PlatformSupportPanel from './PlatformSupportPanel'

type CompanyRow = { id:string; name:string; tax_id:string|null; status:string; created_at:string }
type PlanRow = { id:string; code:string; name:string; description:string|null; price:number; billing_interval:string; max_branches:number|null; max_users:number|null; is_active:boolean }
type SubscriptionRow = { id:string; company_id:string; plan_id:string; status:string; starts_at:string; ends_at:string|null; trial_ends_at?:string|null; companies?:{name:string}|{name:string}[]|null; subscription_plans?:{name:string}|{name:string}[]|null }

type Props = { email:string; onSignOut:()=>void }
const money=(value:number)=>Number(value||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})
const intervalLabels:Record<string,string>={monthly:'Mensal',yearly:'Anual',six_months:'Semestral',lifetime:'Vitalício'}
const PLATFORM_TAB_KEY='edertec-platform-admin-tab-v1'

export default function PlatformAdminPanel({email,onSignOut}:Props) {
  const [tab,setTab]=useState<'companies'|'plans'|'subscriptions'|'support'|'billing'>(()=>{try{const saved=localStorage.getItem(PLATFORM_TAB_KEY);return saved==='billing'||saved==='plans'||saved==='subscriptions'||saved==='support'||saved==='companies'?saved:'companies'}catch{return 'companies'}})
  const [menuOpen,setMenuOpen]=useState(false)
  const [companies,setCompanies]=useState<CompanyRow[]>([])
  const [plans,setPlans]=useState<PlanRow[]>([])
  const [subscriptions,setSubscriptions]=useState<SubscriptionRow[]>([])
  const [openTickets,setOpenTickets]=useState(0)
  const [loading,setLoading]=useState(true)
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const [notice,setNotice]=useState('')
  const [showPlan,setShowPlan]=useState(false)
  const [showCompany,setShowCompany]=useState(false)
  const [companyForm,setCompanyForm]=useState({name:'',taxId:'',phone:''})
  const [planForm,setPlanForm]=useState({code:'',name:'',description:'',price:'0',billing_interval:'monthly',max_branches:'',max_users:''})
  const [billingForm,setBillingForm]=useState({accessToken:'',webhookSecret:''})
  const [billingStatus,setBillingStatus]=useState<{access_token_configured?:boolean;webhook_secret_configured?:boolean;updated_at?:string}|null>(null)
  const [billingLoading,setBillingLoading]=useState(false)
  const [activation,setActivation]=useState({companyId:'',planId:'',status:'active',startsAt:new Date().toISOString().slice(0,10),endsAt:''})

  const load=useCallback(async()=>{
    if(!supabase)return
    setLoading(true);setError('')
    try{
      const [c,p,s,t]=await Promise.all([
        supabase.from('companies').select('id,name,tax_id,status,created_at').order('created_at',{ascending:false}).limit(500),
        supabase.from('subscription_plans').select('id,code,name,description,price,billing_interval,max_branches,max_users,is_active').order('price'),
        supabase.from('company_subscriptions').select('id,company_id,plan_id,status,starts_at,ends_at,trial_ends_at,companies(name),subscription_plans(name)').order('created_at',{ascending:false}).limit(500),
        supabase.from('support_tickets').select('id',{count:'exact',head:true}).eq('status','open'),
      ])
      if(c.error)throw c.error;if(p.error)throw p.error;if(s.error)throw s.error;if(t.error)throw t.error
      setCompanies((c.data||[]) as CompanyRow[]);setPlans((p.data||[]) as PlanRow[]);setSubscriptions((s.data||[]) as SubscriptionRow[]);setOpenTickets(t.count||0)
    }catch(e){setError(e instanceof Error?e.message:'Não foi possível carregar o painel.')}
    finally{setLoading(false)}
  },[])

  useEffect(()=>{void load()},[load])

  // Keep the billing screen and its unfinished fields when the user switches tabs/apps.
  useEffect(()=>{try{localStorage.setItem(PLATFORM_TAB_KEY,tab)}catch{}},[tab])

  useEffect(()=>{
    const client=supabase
    if(!client)return
    const channel=client.channel('platform-dashboard-open-tickets')
      .on('postgres_changes',{event:'*',schema:'public',table:'support_tickets'},()=>{
        void client.from('support_tickets').select('id',{count:'exact',head:true}).eq('status','open')
          .then(({count,error})=>{if(!error)setOpenTickets(count||0)})
      })
      .subscribe()
    return()=>{void client.removeChannel(channel)}
  },[])

  async function createCompany(event:FormEvent){
    event.preventDefault();if(!supabase)return
    setBusy(true);setError('');setNotice('')
    try{
      const {error}=await supabase.rpc('register_company',{
        company_name:companyForm.name.trim(),
        company_tax_id:companyForm.taxId.trim()||null,
        main_phone:companyForm.phone.trim()||null,
      })
      if(error)throw error
      setCompanyForm({name:'',taxId:'',phone:''});setShowCompany(false)
      setNotice('Empresa cadastrada com sucesso. O acesso inicial ficou vinculado à conta Super Admin.')
      await load()
    }catch(e){setError(e instanceof Error?e.message:'Falha ao cadastrar empresa.')}
    finally{setBusy(false)}
  }

  async function updateCompanyStatus(company:CompanyRow,status:string){
    if(!supabase)return
    setBusy(true);setError('');setNotice('')
    try{const {error}=await supabase.from('companies').update({status,updated_at:new Date().toISOString()}).eq('id',company.id);if(error)throw error;setNotice('Situação da empresa atualizada.');await load()}
    catch(e){setError(e instanceof Error?e.message:'Falha ao atualizar empresa.')}
    finally{setBusy(false)}
  }

  async function togglePlan(plan:PlanRow){
    if(!supabase)return
    setBusy(true);setError('');setNotice('')
    try{const {error}=await supabase.from('subscription_plans').update({is_active:!plan.is_active}).eq('id',plan.id);if(error)throw error;setNotice('Plano atualizado.');await load()}
    catch(e){setError(e instanceof Error?e.message:'Falha ao atualizar plano.')}
    finally{setBusy(false)}
  }

  async function createPlan(event:FormEvent){
    event.preventDefault();if(!supabase)return
    setBusy(true);setError('');setNotice('')
    try{
      const {error}=await supabase.from('subscription_plans').insert({
        code:planForm.code.trim().toLowerCase().replace(/[^a-z0-9_-]/g,'-'),
        name:planForm.name.trim(),description:planForm.description.trim()||null,
        price:Number(planForm.price),billing_interval:planForm.billing_interval,
        max_branches:planForm.max_branches?Number(planForm.max_branches):null,
        max_users:planForm.max_users?Number(planForm.max_users):null,is_active:true,
      })
      if(error)throw error
      setPlanForm({code:'',name:'',description:'',price:'0',billing_interval:'monthly',max_branches:'',max_users:''})
      setShowPlan(false);setNotice('Plano criado com sucesso.');await load()
    }catch(e){setError(e instanceof Error?e.message:'Falha ao criar plano.')}
    finally{setBusy(false)}
  }

  async function saveCompanyActivation(event:FormEvent){
    event.preventDefault();if(!supabase)return
    if(!activation.companyId||!activation.planId){setError('Selecione a empresa e o plano.');return}
    if(activation.endsAt&&activation.endsAt<activation.startsAt){setError('O vencimento não pode ser anterior ao início.');return}
    setBusy(true);setError('');setNotice('')
    try{
      const startsAt=new Date(activation.startsAt+'T00:00:00').toISOString()
      const endsAt=activation.endsAt?new Date(activation.endsAt+'T23:59:59').toISOString():null
      const {error}=await supabase.rpc('admin_set_company_subscription',{
        p_company_id:activation.companyId,
        p_plan_id:activation.planId,
        p_status:activation.status,
        p_starts_at:startsAt,
        p_ends_at:endsAt,
      })
      if(error)throw new Error(error.message||error.details||'Não foi possível salvar a ativação.')
      setNotice('Plano e período da empresa salvos com sucesso.')
      await load()
    }catch(e){setError(e instanceof Error?e.message:'Falha ao salvar a ativação.')}
    finally{setBusy(false)}
  }

  async function updateSubscriptionStatus(sub:SubscriptionRow,status:string){
    if(!supabase)return
    setBusy(true);setError('');setNotice('')
    try{const {error}=await supabase.from('company_subscriptions').update({status}).eq('id',sub.id);if(error)throw error;setNotice('Assinatura atualizada.');await load()}
    catch(e){setError(e instanceof Error?e.message:'Falha ao atualizar assinatura.')}
    finally{setBusy(false)}
  }

  useEffect(()=>{
    if(tab!=='billing'||!supabase)return
    let alive=true
    setBillingLoading(true)
    supabase.functions.invoke('mercadopago-billing?action=settings',{method:'GET'})
      .then(({data,error})=>{
        if(!alive)return
        if(error)throw error
        setBillingStatus(data||{})
      })
      .catch(e=>{if(alive)setError(e instanceof Error?e.message:'Não foi possível carregar as configurações de cobrança.')})
      .finally(()=>{if(alive)setBillingLoading(false)})
    return()=>{alive=false}
  },[tab])

  async function saveBillingSettings(event:FormEvent){
    event.preventDefault();if(!supabase)return
    const accessToken=billingForm.accessToken.trim()
    const webhookSecret=billingForm.webhookSecret.trim()
    if(!accessToken&&!webhookSecret){setError('Informe o Access Token ou a assinatura secreta do Webhook.');return}
    if(accessToken&&accessToken.length<20){setError('O Access Token precisa ter pelo menos 20 caracteres.');return}
    if(webhookSecret&&webhookSecret.length<12){setError('A assinatura secreta do Webhook parece inválida.');return}
    setBusy(true);setError('');setNotice('')
    try{
      const {data,error}=await supabase.functions.invoke('mercadopago-billing?action=settings',{
        body:{...(accessToken?{access_token:accessToken}:{}),...(webhookSecret?{webhook_secret:webhookSecret}:{})}
      })
      if(error)throw error
      if(data?.error)throw new Error(data.error)
      setBillingForm({accessToken:'',webhookSecret:''})
      setBillingStatus(current=>({...current,access_token_configured:accessToken?true:current?.access_token_configured,webhook_secret_configured:webhookSecret?true:current?.webhook_secret_configured,updated_at:new Date().toISOString()}))
      setNotice(accessToken&&webhookSecret?'Access Token e assinatura do Webhook salvos com segurança no Supabase Vault.':accessToken?'Access Token salvo com segurança no Supabase Vault.':'Assinatura do Webhook salva com segurança no Supabase Vault.')
    }catch(e){setError(e instanceof Error?e.message:'Falha ao salvar credenciais.')}
    finally{setBusy(false)}
  }

  return <main className="platform-admin">
    <header className="platform-head"><div className="platform-brand"><ShieldCheck/><span><b>EDERTEC OS PRO</b><small>SUPER ADMIN · PAINEL DA PLATAFORMA</small></span></div><div className="platform-user"><span>{email}</span><button onClick={onSignOut}><LogOut size={15}/> Sair</button></div></header>
    <section className="platform-content">
      <div className="platform-title"><div><small>CONTROLE CENTRAL</small><h1>Super Admin</h1><p>Gerencie empresas, planos e assinaturas da plataforma.</p></div><button className="platform-refresh" onClick={()=>void load()}><RefreshCw size={15}/> Atualizar</button></div>
      {error&&<div className="platform-error">{error}</div>}{notice&&<div className="platform-notice">{notice}</div>}
      <div className="platform-stats"><article><Building2/><small>Empresas cadastradas</small><b>{companies.length}</b></article><article><Package/><small>Planos disponíveis</small><b>{plans.filter(p=>p.is_active).length}</b></article><article><CreditCard/><small>Assinaturas</small><b>{subscriptions.length}</b></article><button type="button" className="platform-stat-action" onClick={()=>setTab('support')} aria-label={openTickets+' chamados abertos. Abrir central de suporte'}><LifeBuoy/><small>Chamados abertos</small><b>{openTickets}</b><span>Ver chamados →</span></button></div>
      <div className="platform-menu-wrap"><button type="button" className="platform-menu-toggle" aria-expanded={menuOpen} aria-controls="platform-menu-options" onClick={()=>setMenuOpen(v=>!v)}><span>{menuOpen?<X size={19}/>:<Menu size={19}/>} <b>Menu de opções</b></span><small>{menuOpen?'Fechar':'Abrir'}</small></button><nav id="platform-menu-options" className={menuOpen?'platform-tabs platform-tabs-open':'platform-tabs'} hidden={!menuOpen}><button className={tab==='companies'?'active':''} onClick={()=>{setTab('companies');setMenuOpen(false)}}>Empresas</button><button className={tab==='plans'?'active':''} onClick={()=>{setTab('plans');setMenuOpen(false)}}>Planos</button><button className={tab==='subscriptions'?'active':''} onClick={()=>{setTab('subscriptions');setMenuOpen(false)}}>Assinaturas</button><button className={tab==='support'?'active':''} onClick={()=>{setTab('support');setMenuOpen(false)}}><LifeBuoy size={15}/> Chamados</button><button className={tab==='billing'?'active':''} onClick={()=>{setTab('billing');setMenuOpen(false)}}><CreditCard size={15}/> Mercado Pago</button></nav></div>
      {loading?<p className="platform-empty">Carregando dados da plataforma...</p>:<>
        {tab==='support'&&<PlatformSupportPanel/>}
        {tab==='billing'&&<section className="platform-panel">
          <div className="platform-panel-title"><h2>Integração de pagamentos · Mercado Pago</h2><span className="platform-hint">Credenciais protegidas</span></div>
          <div className="platform-mp-external"><p className="platform-hint">Primeiro, separe esta tela do Edertec OS Pro em uma nova guia. Assim você mantém as configurações abertas enquanto consulta o Mercado Pago.</p><button type="button" className="platform-mp-open" onClick={()=>{window.open(window.location.href,"_blank","noopener,noreferrer")}}>Abrir esta tela do Edertec OS Pro em nova guia ↗</button><p className="platform-hint">Depois, na outra guia, consulte suas credenciais e configure os Webhooks no Mercado Pago.</p><a className="platform-mp-open" href="https://www.mercadopago.com.br/developers/panel" target="_blank" rel="noopener noreferrer" onClick={(event)=>{event.preventDefault();window.open("https://www.mercadopago.com.br/developers/panel","_blank","noopener,noreferrer")}}>Abrir Mercado Pago em nova guia ↗</a></div>
          <p className="platform-hint">Conecte a conta Mercado Pago que receberá as mensalidades e assinaturas do Edertec OS Pro. Informe o Access Token de produção e a assinatura secreta do Webhook. As credenciais ficam protegidas no Supabase Vault e nunca são exibidas novamente.</p>
          {billingLoading?<p className="platform-empty">Verificando configuração...</p>:<div className="platform-stats">
            <article><ShieldCheck/><small>Access Token</small><b>{billingStatus?.access_token_configured?'Configurado':'Pendente'}</b></article><article><ShieldCheck/><small>Webhook Secret</small><b>{billingStatus?.webhook_secret_configured?'Configurado':'Pendente'}</b></article>
          </div>}
          <form className="platform-form" onSubmit={saveBillingSettings}>
            <label className="platform-wide">Mercado Pago Access Token<input type="password" autoComplete="new-password" value={billingForm.accessToken} onChange={e=>setBillingForm(v=>({...v,accessToken:e.target.value}))} placeholder={billingStatus?.access_token_configured?'Token já configurado — digite para substituir':'Access Token de produção (APP_USR-...)'}/></label><label className="platform-wide">Assinatura secreta do Webhook<input type="password" autoComplete="new-password" value={billingForm.webhookSecret} onChange={e=>setBillingForm(v=>({...v,webhookSecret:e.target.value}))} placeholder={billingStatus?.webhook_secret_configured?'Assinatura já configurada — digite para substituir':'Cole a assinatura secreta gerada no Mercado Pago'}/></label>
            <div className="platform-form-actions"><button type="submit" disabled={busy}>{busy?'Salvando...':'Salvar campos preenchidos'}</button></div>
          </form>
          <p className="platform-hint">Última atualização: {billingStatus?.updated_at?new Date(billingStatus.updated_at).toLocaleString('pt-BR'):'Ainda não configurado'}. No painel Mercado Pago, acesse Suas integrações → Webhooks, cadastre a URL abaixo e habilite o evento Pagamentos.</p>
          <div className="platform-form"><label className="platform-wide">URL do Webhook<input readOnly value="https://btouoeftgatyrvuobicr.supabase.co/functions/v1/mercadopago-billing?action=webhook"/></label><div className="platform-form-actions"><button type="button" onClick={()=>{void navigator.clipboard.writeText('https://btouoeftgatyrvuobicr.supabase.co/functions/v1/mercadopago-billing?action=webhook');setNotice('URL do Webhook copiada.')}}>Copiar URL</button></div></div>
        </section>}

        {tab==='companies'&&<section className="platform-panel"><div className="platform-panel-title"><h2>Empresas cadastradas</h2><button onClick={()=>setShowCompany(v=>!v)}><Plus size={15}/> Nova empresa</button></div>
          {showCompany&&<form className="platform-form" onSubmit={createCompany}><label className="platform-wide">Nome da empresa<input required minLength={2} value={companyForm.name} onChange={e=>setCompanyForm(v=>({...v,name:e.target.value}))} placeholder="Ex.: Edertec Assistência Técnica"/></label><label>CNPJ ou CPF<input value={companyForm.taxId} onChange={e=>setCompanyForm(v=>({...v,taxId:e.target.value}))} placeholder="Opcional"/></label><label>Telefone<input value={companyForm.phone} onChange={e=>setCompanyForm(v=>({...v,phone:e.target.value}))} placeholder="(00) 00000-0000"/></label><div className="platform-form-actions"><button type="button" onClick={()=>setShowCompany(false)}>Cancelar</button><button type="submit" disabled={busy}>{busy?'Cadastrando...':'Criar empresa'}</button></div></form>}
          <div className="platform-table-wrap platform-companies-table-wrap"><table><thead><tr><th>EMPRESA</th><th>PLANO</th><th>DOCUMENTO</th><th>CADASTRO</th><th>SITUAÇÃO</th></tr></thead><tbody>{companies.map(c=>{const sub=subscriptions.find(item=>item.company_id===c.id);const planName=(sub?.plan_id?plans.find(plan=>plan.id===sub.plan_id)?.name:null)||(Array.isArray(sub?.subscription_plans)?sub.subscription_plans[0]?.name:sub?.subscription_plans?.name);const subStatus:Record<string,string>={trial:"Em teste",active:"Ativo",past_due:"Em atraso",cancelled:"Cancelado",expired:"Expirado"};return <tr key={c.id}><td><b>{c.name}</b><small>{c.id}</small></td><td>{planName?<><b>{planName}</b><small>{subStatus[sub?.status||'']||sub?.status||'Status não informado'}</small></>:<span className="platform-muted">Sem plano atribuído</span>}</td><td>{c.tax_id||'—'}</td><td>{new Date(c.created_at).toLocaleDateString('pt-BR')}</td><td><select disabled={busy} value={c.status} onChange={e=>void updateCompanyStatus(c,e.target.value)}><option value="active">Ativa</option><option value="suspended">Suspensa</option><option value="cancelled">Cancelada</option></select></td></tr>})}</tbody></table></div></section>}
        {tab==='plans'&&<section className="platform-panel"><div className="platform-panel-title"><h2>Planos e preços</h2><button onClick={()=>setShowPlan(v=>!v)}><Plus size={15}/> Novo plano</button></div>
          {showPlan&&<form className="platform-form" onSubmit={createPlan}><label>Código<input required value={planForm.code} onChange={e=>setPlanForm({...planForm,code:e.target.value})} placeholder="basico"/></label><label>Nome<input required value={planForm.name} onChange={e=>setPlanForm({...planForm,name:e.target.value})} placeholder="Plano Básico"/></label><label>Preço (R$)<input required type="number" min="0" step="0.01" value={planForm.price} onChange={e=>setPlanForm({...planForm,price:e.target.value})}/></label><label>Periodicidade<select value={planForm.billing_interval} onChange={e=>setPlanForm({...planForm,billing_interval:e.target.value})}><option value="monthly">Mensal</option><option value="six_months">Semestral</option><option value="yearly">Anual</option><option value="lifetime">Vitalício</option></select></label><label>Limite de filiais<input type="number" min="1" value={planForm.max_branches} onChange={e=>setPlanForm({...planForm,max_branches:e.target.value})} placeholder="Sem limite"/></label><label>Limite de usuários<input type="number" min="1" value={planForm.max_users} onChange={e=>setPlanForm({...planForm,max_users:e.target.value})} placeholder="Sem limite"/></label><label className="platform-wide">Descrição<input value={planForm.description} onChange={e=>setPlanForm({...planForm,description:e.target.value})}/></label><div className="platform-form-actions"><button type="button" onClick={()=>setShowPlan(false)}>Cancelar</button><button type="submit" disabled={busy}>{busy?'Salvando...':'Criar plano'}</button></div></form>}
          <div className="platform-table-wrap"><table><thead><tr><th>PLANO</th><th>VALOR</th><th>PERÍODO</th><th>LIMITES</th><th>STATUS</th></tr></thead><tbody>{plans.map(p=><tr key={p.id}><td><b>{p.name}</b><small>{p.code}</small></td><td>{money(p.price)}</td><td>{intervalLabels[p.billing_interval]||p.billing_interval}</td><td>{p.max_branches??'∞'} filiais · {p.max_users??'∞'} usuários</td><td><button className="platform-toggle" disabled={busy} onClick={()=>void togglePlan(p)}>{p.is_active?'Ativo':'Inativo'}</button></td></tr>)}</tbody></table></div>
        </section>}
        {tab==='subscriptions'&&<section className="platform-panel"><h2>Gerenciar plano e ativação por empresa</h2>
          <form className="platform-form" onSubmit={saveCompanyActivation}>
            <label className="platform-wide">Empresa<select required value={activation.companyId} onChange={e=>setActivation(v=>({...v,companyId:e.target.value}))}><option value="">Selecione a empresa</option>{companies.map(company=><option key={company.id} value={company.id}>{company.name} · {company.id.slice(0,8)}</option>)}</select></label>
            <label>Plano<select required value={activation.planId} onChange={e=>setActivation(v=>({...v,planId:e.target.value}))}><option value="">Selecione o plano</option>{plans.map(plan=><option key={plan.id} value={plan.id} disabled={!plan.is_active}>{plan.name} · {money(plan.price)} / {intervalLabels[plan.billing_interval]||plan.billing_interval}{!plan.is_active?' (inativo)':''}</option>)}</select></label>
            <label>Status<select value={activation.status} onChange={e=>setActivation(v=>({...v,status:e.target.value}))}><option value="trial">Período de teste</option><option value="active">Ativa</option><option value="past_due">Em atraso</option><option value="cancelled">Cancelada</option><option value="expired">Expirada</option></select></label>
            <label>Início da ativação<input type="date" required value={activation.startsAt} onChange={e=>setActivation(v=>({...v,startsAt:e.target.value}))}/></label>
            <label>Vencimento / fim do teste<input type="date" value={activation.endsAt} onChange={e=>setActivation(v=>({...v,endsAt:e.target.value}))}/></label>
            <div className="platform-form-actions"><button type="submit" disabled={busy||!companies.length||!plans.length}>{busy?'Salvando...':'Salvar ativação da empresa'}</button></div>
          </form>
          <p className="platform-hint">Deixe o vencimento vazio para uma ativação sem data final. Ao salvar, a assinatura existente da empresa será atualizada em vez de criar outra.</p>
          <h2>Assinaturas e vencimentos</h2><div className="platform-table-wrap"><table><thead><tr><th>EMPRESA</th><th>PLANO</th><th>INÍCIO</th><th>VENCIMENTO</th><th>FIM DO TESTE</th><th>SITUAÇÃO</th></tr></thead><tbody>{subscriptions.map(s=><tr key={s.id}><td>{(Array.isArray(s.companies)?s.companies[0]?.name:s.companies?.name)||s.company_id}</td><td>{(Array.isArray(s.subscription_plans)?s.subscription_plans[0]?.name:s.subscription_plans?.name)||'—'}</td><td>{new Date(s.starts_at).toLocaleDateString('pt-BR')}</td><td>{s.ends_at?new Date(s.ends_at).toLocaleDateString('pt-BR'):'Sem vencimento'}</td><td>{s.trial_ends_at?new Date(s.trial_ends_at).toLocaleDateString('pt-BR'):'—'}</td><td><select disabled={busy} value={s.status} onChange={e=>void updateSubscriptionStatus(s,e.target.value)}><option value="trial">Teste</option><option value="active">Ativa</option><option value="past_due">Em atraso</option><option value="cancelled">Cancelada</option><option value="expired">Expirada</option></select></td></tr>)}</tbody></table></div></section>}
      </>}
      <footer className="platform-footer">Ações administrativas protegidas por autorização verificada no banco de dados.</footer>
    </section>
  </main>
}
