import { useCallback, useEffect, useState, type FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { Building2, CreditCard, ExternalLink, LoaderCircle, LogOut, Mail, ShieldCheck, Smartphone } from 'lucide-react'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import { listMyCompanies, registerCompany, type Company, type CompanyMembership } from '../lib/company-data'
import CompanyWorkspace from './CompanyWorkspace'
import PlatformAdminPanel from './PlatformAdminPanel'

export default function CompanyAuthGate() {
  const isAdminRoute = window.location.pathname.replace(/\/+$/, '') === '/admin'
  const [session, setSession] = useState<Session | null>(null)
  const [memberships, setMemberships] = useState<CompanyMembership[]>([])
  const [platformAdmin, setPlatformAdmin] = useState(false)
  const [selected, setSelected] = useState<Company | null>(null)
  const [mode, setMode] = useState<'login'|'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [taxId, setTaxId] = useState('')
  const [phone, setPhone] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [accessStatus, setAccessStatus] = useState<any>(null)
  const [checkingAccess, setCheckingAccess] = useState(false)
  const [availablePlans, setAvailablePlans] = useState<Array<{id:string;name:string;price:number;billing_interval:string}>>([])
  const [selectedPlanId, setSelectedPlanId] = useState('')
  const [startingCheckout, setStartingCheckout] = useState(false)

  const refreshMemberships = useCallback(async () => {
    setSelected(null)
    const rows = await listMyCompanies()
    setMemberships(rows)
    const { data, error } = await supabase!.rpc('is_platform_admin')
    if (error) throw error
    setPlatformAdmin(data === true)
    if (rows.length === 1) {
      const company = Array.isArray(rows[0].companies) ? rows[0].companies[0] : rows[0].companies
      if (company) setSelected(company)
    }
  }, [])

  useEffect(() => {
    if (!supabase) { setLoading(false); return }
    let alive = true
    supabase.auth.getSession().then(async ({data}) => {
      if (!alive) return
      setSession(data.session)
      if (data.session) {
        try { await refreshMemberships() }
        catch (e) { if (alive) setError(e instanceof Error ? e.message : 'Não foi possível carregar suas assistências.') }
      }
      if (alive) setLoading(false)
    })
    const {data:{subscription}} = supabase.auth.onAuthStateChange((_event,next) => {
      setSession(next)
      if (!next) { setMemberships([]); setSelected(null); setPlatformAdmin(false) }
      else { setMemberships([]); setSelected(null); setPlatformAdmin(false); window.setTimeout(() => { refreshMemberships().catch(e => setError(e instanceof Error ? e.message : 'Erro ao carregar assistências.')) },0) }
    })
    return () => { alive = false; subscription.unsubscribe() }
  }, [refreshMemberships])


  useEffect(() => {
    if (!selected || !supabase || platformAdmin) { setAccessStatus(null); return }
    let alive = true
    setCheckingAccess(true)
    supabase.rpc('get_company_access_status', { target_company_id: selected.id }).then(({data,error}) => {
      if (!alive) return
      if (error) {
        setAccessStatus({is_allowed:false,company_status:'unknown',subscription_status:null,trial_ends_at:null,ends_at:null,plan_name:null})
        setError('Não foi possível validar a assinatura. Entre em contato com o suporte.')
      } else {
        const row = Array.isArray(data) ? data[0] : data
        setAccessStatus(row || {is_allowed:false,company_status:'unknown',subscription_status:null,trial_ends_at:null,ends_at:null,plan_name:null})
      }
      setCheckingAccess(false)
    })
    return () => { alive = false }
  }, [selected, platformAdmin])

  useEffect(() => {
    if (!selected || platformAdmin || accessStatus?.is_allowed !== false) return
    let alive = true
    supabase!.from('subscription_plans').select('id,name,price,billing_interval').eq('is_active', true).order('price')
      .then(({data,error}) => {
        if (!alive || error) return
        const rows = (data || []) as Array<{id:string;name:string;price:number;billing_interval:string}>
        setAvailablePlans(rows)
        if (rows[0]) setSelectedPlanId(rows[0].id)
      })
    return () => { alive = false }
  }, [selected, platformAdmin, accessStatus?.is_allowed])

  async function startPlanCheckout() {
    if (!selected || !selectedPlanId) return
    setStartingCheckout(true); setError('')
    try {
      const {data,error} = await supabase!.functions.invoke('mercadopago-billing', { body: { company_id: selected.id, plan_id: selectedPlanId } })
      if (error) throw error
      if (!data?.checkout_url) throw new Error('O Mercado Pago não retornou o link de pagamento.')
      window.location.assign(data.checkout_url)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível iniciar o pagamento.')
      setStartingCheckout(false)
    }
  }

  if (!isSupabaseConfigured || !supabase) return <main className="company-auth"><section className="company-auth-card"><h1>EDERTEC OS PRO</h1><p>Configure VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY para conectar o banco.</p></section></main>
  if (loading) return <main className="company-auth"><div className="company-auth-card"><LoaderCircle className="spin"/> Verificando acesso...</div></main>

  async function submitAuth(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setNotice('')
    try {
      if (mode === 'signup') {
        const {data,error} = await supabase!.auth.signUp({email,password,options:{data:{full_name:fullName}}})
        if (error) throw error
        if (!data.session) setNotice('Cadastro recebido. Confirme seu e-mail e depois entre no sistema.')
        else setNotice('Conta criada. Agora cadastre sua assistência.')
      } else {
        const {error} = await supabase!.auth.signInWithPassword({email,password})
        if (error) throw error
      }
    } catch(e) { setError(e instanceof Error ? e.message : 'Falha na autenticação.') }
    finally { setBusy(false) }
  }

  async function submitCompany(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setNotice('')
    try {
      const normalize = (value:string) => value.trim().toLocaleLowerCase('pt-BR').replace(/\\s+/g,' ')
      const digits = (value:string) => value.replace(/\\D/g,'')
      const existing = memberships.find(m => {
        const company = Array.isArray(m.companies) ? m.companies[0] : m.companies
        if (!company || m.role !== 'owner') return false
        return normalize(company.name) === normalize(companyName)
          || (!!taxId.trim() && !!company.tax_id && digits(company.tax_id) === digits(taxId))
      })
      if (existing) {
        const company = Array.isArray(existing.companies) ? existing.companies[0] : existing.companies
        if (company) setSelected(company)
        setNotice('Esta assistência já está cadastrada na sua conta. Abrimos o ambiente existente.')
      } else {
        await registerCompany({name:companyName,taxId,phone})
        await refreshMemberships()
        setNotice('Assistência cadastrada com sucesso.')
      }
    } catch(e) { setError(e instanceof Error ? e.message : 'Não foi possível cadastrar a assistência.') }
    finally { setBusy(false) }
  }

  async function signOut() {
    await supabase!.auth.signOut()
    setSession(null); setMemberships([]); setSelected(null); setPlatformAdmin(false)
  }

  if (!session) return <main className="company-auth"><section className="company-auth-card">
    <div className="company-auth-brand"><Smartphone size={25}/><div><b>EDERTEC <i>OS PRO</i></b><small>GESTÃO PARA ASSISTÊNCIAS</small></div></div>
    <h1>{mode==='login'?'Acesse sua conta':'Crie seu acesso'}</h1>
    <form onSubmit={submitAuth}>
      {mode==='signup'&&<label>Seu nome<input required value={fullName} onChange={e=>setFullName(e.target.value)} placeholder="Nome completo"/></label>}
      <label>E-mail<input type="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="voce@empresa.com"/></label>
      <label>Senha<input type="password" required minLength={8} value={password} onChange={e=>setPassword(e.target.value)} placeholder="Mínimo de 8 caracteres"/></label>
      {error&&<p className="company-error">{error}</p>}{notice&&<p className="company-notice">{notice}</p>}
      <button className="company-primary" disabled={busy}>{busy?'Aguarde...':mode==='login'?'Entrar':'Criar conta'}</button>
    </form>
    <button className="company-link" onClick={()=>{setMode(mode==='login'?'signup':'login');setError('');setNotice('')}}>{mode==='login'?'Ainda não tem conta? Criar acesso':'Já tem conta? Entrar'}</button>
  </section></main>

  if (platformAdmin) return <PlatformAdminPanel email={session.user.email||''} onSignOut={signOut}/>

  if (isAdminRoute) return <main className="company-auth"><section className="company-auth-card">
    <div className="company-auth-brand"><ShieldCheck size={25}/><div><b>EDERTEC <i>OS PRO</i></b><small>ÁREA ADMINISTRATIVA</small></div></div>
    <h1>Acesso restrito</h1>
    <p>Esta área é exclusiva da conta Super Admin da plataforma. Sua conta não possui essa autorização.</p>
    <button className="company-primary" onClick={()=>window.location.assign('/')}>Voltar ao sistema</button>
    <button className="company-link" onClick={signOut}>Sair da conta</button>
  </section></main>


  if (selected) {
    if (checkingAccess || !accessStatus) return <main className="company-auth"><section className="company-auth-card"><LoaderCircle className="spin"/> Verificando período de teste e assinatura...</section></main>
    if (!accessStatus.is_allowed) return <main className="company-auth"><section className="company-auth-card">
      <div className="company-auth-brand"><ShieldCheck size={25}/><div><b>EDERTEC <i>OS PRO</i></b><small>ASSINATURA DA EMPRESA</small></div></div>
      <h1>{accessStatus.company_status!=='active'?'Acesso suspenso':'Seu período de teste terminou'}</h1>
      <p>O acesso aos módulos está bloqueado. Seus clientes, ordens de serviço, produtos, fotos e demais dados continuam armazenados e serão liberados após a contratação ou renovação de um plano.</p>
      {accessStatus.plan_name&&<p>Plano: <b>{accessStatus.plan_name}</b></p>}
      {availablePlans.length>0&&<div className="company-billing-choice">
        <label>Escolha seu plano
          <select value={selectedPlanId} onChange={e=>setSelectedPlanId(e.target.value)}>
            {availablePlans.map(plan=><option key={plan.id} value={plan.id}>{plan.name} · {Number(plan.price).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})} / {plan.billing_interval==='monthly'?'mês':plan.billing_interval==='six_months'?'6 meses':plan.billing_interval==='yearly'?'ano':'vitalício'}</option>)}
          </select>
        </label>
        <button className="company-primary" disabled={startingCheckout||!selectedPlanId} onClick={startPlanCheckout}><CreditCard size={17}/>{startingCheckout?'Preparando pagamento...':'Pagar com Mercado Pago'}</button>
      </div>}
      {error&&<p className="company-error">{error}</p>}
      <button className="company-link" onClick={()=>window.open('https://wa.me/5547992454773?text='+encodeURIComponent('Olá! Quero contratar um plano do Edertec OS Pro para minha empresa: '+selected.name),'_blank','noopener,noreferrer')}><ExternalLink size={15}/> Falar com atendimento pelo WhatsApp</button>
      <button className="company-link" onClick={signOut}>Sair da conta</button>
    </section></main>
    return <CompanyWorkspace company={selected} role={memberships.find(m=>m.company_id===selected.id)?.role||'technician'} email={session.user.email||''} onSignOut={signOut}/>
  }

  if (memberships.length>1) return <main className="company-auth"><section className="company-auth-card"><h1>Selecione sua assistência</h1><div className="company-select-list">{memberships.map(m=>{const c=Array.isArray(m.companies)?m.companies[0]:m.companies;return c?<button key={m.company_id} onClick={()=>setSelected(c)}><Building2/><span><b>{c.name}</b><small>{m.role}</small></span></button>:null})}</div><button className="company-link" onClick={signOut}><LogOut size={15}/> Sair</button></section></main>

  return <main className="company-auth"><section className="company-auth-card">
    <div className="company-auth-brand"><Building2 size={25}/><div><b>EDERTEC <i>OS PRO</i></b><small>NOVA ASSISTÊNCIA</small></div></div>
    <h1>Cadastre sua assistência</h1><p>Seu ambiente será isolado dos dados de outras empresas.</p>
    <form onSubmit={submitCompany}>
      <label>Nome da assistência<input required minLength={2} value={companyName} onChange={e=>setCompanyName(e.target.value)} placeholder="Ex.: Edertec"/></label>
      <label>CNPJ ou CPF (opcional)<input value={taxId} onChange={e=>setTaxId(e.target.value)} placeholder="Documento"/></label>
      <label>Telefone (opcional)<input value={phone} onChange={e=>setPhone(e.target.value)} placeholder="(00) 00000-0000"/></label>
      {error&&<p className="company-error">{error}</p>}{notice&&<p className="company-notice">{notice}</p>}
      <button className="company-primary" disabled={busy}>{busy?'Salvando...':'Criar ambiente'}</button>
    </form><button className="company-link" onClick={signOut}>Sair da conta</button>
  </section></main>
}
