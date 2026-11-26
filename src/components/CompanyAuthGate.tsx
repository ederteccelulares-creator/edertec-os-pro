import { useCallback, useEffect, useState, type FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { Building2, CreditCard, ExternalLink, LoaderCircle, LogOut, Mail, ShieldCheck, Smartphone } from 'lucide-react'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import { listMyCompanies, registerCompany, type Company, type CompanyMembership } from '../lib/company-data'
import CompanyWorkspace from './CompanyWorkspace'
import PlatformAdminPanel from './PlatformAdminPanel'

export default function CompanyAuthGate() {
  const isAdminRoute = window.location.pathname.replace(/\/+$/, '') === '/admin' || new URLSearchParams(window.location.search).get('admin') === '1'
  const [session, setSession] = useState<Session | null>(null)
  const [memberships, setMemberships] = useState<CompanyMembership[]>([])
  const [platformAdmin, setPlatformAdmin] = useState(false)
  const [selected, setSelected] = useState<Company | null>(null)
  const [mode, setMode] = useState<'login'|'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [quickMode, setQuickMode] = useState(true)
  const [companyCode, setCompanyCode] = useState('')
  const [username, setUsername] = useState('')
  const [pin, setPin] = useState('')
  const [quickCompanyId, setQuickCompanyId] = useState(() => window.localStorage.getItem('edertec_quick_company_id') || '')
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
  const [registrationInfo, setRegistrationInfo] = useState<{companyCode:string;username:string;email:string}|null>(null)

  const refreshMemberships = useCallback(async () => {
    setSelected(null)
    const rows = await listMyCompanies()
    setMemberships(rows)
    const { data, error } = await supabase!.rpc('is_platform_admin')
    if (error) throw error
    setPlatformAdmin(data === true)
    if (rows.length === 1) {
      const membership = rows[0]
      const company = Array.isArray(membership.companies) ? membership.companies[0] : membership.companies
      if (company) {
        setSelected(company)
        // Recover the registration credentials on later logins too.
        // The company may have been created in a previous confirmation session.
        if (membership.role === 'owner') {
          try {
            const { data: teamData, error: teamError } = await supabase!.functions.invoke('company-team', {
              body: { action: 'list', company_id: membership.company_id },
            })
            if (teamError) throw teamError
            const { data: authData } = await supabase!.auth.getUser()
            const owner = (teamData?.members || []).find((member: any) => member.user_id === authData.user?.id)
            setRegistrationInfo({
              companyCode: String(teamData?.company_code || ''),
              username: String(owner?.employee?.username || ''),
              email: String(owner?.email || ''),
            })
          } catch (e) {
            console.error('Não foi possível recuperar os dados de acesso da empresa:', e)
          }
        }
      }
    }
  }, [])


  async function finishPendingCompany(user: { id:string; email?:string; email_confirmed_at?:string; user_metadata?:Record<string,unknown> }) {
    const metadata = user.user_metadata || {}
    const pendingName = String(metadata.signup_company_name || '').trim()
    if (pendingName.length < 2) return
    const existing = await listMyCompanies()
    if (existing.length) return
    const companyId = await registerCompany({
      name: pendingName,
      taxId: String(metadata.signup_company_tax_id || ''),
      phone: String(metadata.signup_company_phone || ''),
    })
    const { data, error } = await supabase!.functions.invoke('company-team', { body: { action: 'list', company_id: companyId } })
    if (error) throw error
    const owner = (data?.members || []).find((member:any) => member.user_id === user.id)
    setRegistrationInfo({
      companyCode: String(data?.company_code || ''),
      username: String(owner?.employee?.username || user.email?.split('@')[0] || ''),
      email: user.email || '',
    })
    await refreshMemberships()
    // The welcome email is sent only after Supabase confirms the owner's email
    // and the company has been created. Email delivery failure must not block access.
    if (user.email_confirmed_at) {
      const { error: welcomeError } = await supabase!.functions.invoke('send-company-welcome', {
        body: { company_id: companyId },
      })
      if (welcomeError) {
        console.error('Falha ao enviar e-mail de boas-vindas:', welcomeError)
        setNotice('Sua assistência foi criada. Não foi possível enviar o e-mail de boas-vindas agora; os dados de acesso estão nesta tela.')
      } else {
        setNotice('Assistência criada e e-mail de boas-vindas enviado.')
      }
    }
  }

  useEffect(() => {
    if (!supabase) { setLoading(false); return }
    let alive = true
    supabase.auth.getSession().then(async ({data}) => {
      if (!alive) return
      setSession(data.session)
      if (data.session) {
        try {
          // A confirmação do e-mail pode abrir o site com uma sessão já criada.
          // Finalize o cadastro pendente também nesse primeiro carregamento,
          // não apenas quando o evento SIGNED_IN é emitido.
          await finishPendingCompany(data.session.user)
          await refreshMemberships()
        } catch (e) {
          if (alive) setError(e instanceof Error ? e.message : 'Não foi possível concluir o acesso. Tente entrar novamente.')
        }
      }
      if (alive) setLoading(false)
    })
    const {data:{subscription}} = supabase.auth.onAuthStateChange((_event,next) => {
      setSession(next)
      if (!next) { setMemberships([]); setSelected(null); setPlatformAdmin(false) }
      else { setMemberships([]); setSelected(null); setPlatformAdmin(false); window.setTimeout(() => { finishPendingCompany(next.user).catch(e => setError(e instanceof Error ? e.message : 'Não foi possível concluir o cadastro da empresa.')) .finally(() => refreshMemberships().catch(e => setError(e instanceof Error ? e.message : 'Erro ao carregar assistências.'))) },0) }
    })
    return () => { alive = false; subscription.unsubscribe() }
  }, [refreshMemberships])


  useEffect(() => { if (selected) { window.localStorage.setItem('edertec_quick_company_id', selected.id); setQuickCompanyId(selected.id) } }, [selected])

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

  async function submitQuickLogin(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setNotice('')
    try {
      const {data,error} = await supabase!.functions.invoke('company-login', {body:{company_code:companyCode,username,pin}})
      if (error) throw error
      if (data?.error) throw new Error(data.error)
      if (!data?.token_hash) throw new Error('Não foi possível iniciar a sessão rápida.')
      const {error:verifyError} = await supabase!.auth.verifyOtp({token_hash:data.token_hash,type:'magiclink'})
      if (verifyError) throw verifyError
    } catch(e) { setError(e instanceof Error ? e.message : 'Falha no acesso rápido.') }
    finally { setBusy(false) }
  }

  async function submitAuth(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setNotice('')
    try {
      if (mode === 'signup') {
        const {data,error} = await supabase!.auth.signUp({
          email,
          password,
          options:{
            emailRedirectTo: 'https://edertecospro.com.br/',
            data:{
              full_name:fullName,
              signup_company_name:companyName.trim(),
              signup_company_tax_id:taxId.trim(),
              signup_company_phone:phone.trim(),
            },
          }
        })
        if (error) throw error
        if (!data.user) throw new Error('Não foi possível criar a conta.')
        if (!data.session) {
          setNotice('Conta criada! Confirme seu e-mail. Depois, ao entrar no sistema, sua assistência será criada automaticamente e o código de acesso será exibido.')
        } else {
          await finishPendingCompany(data.user)
          setNotice('Conta e assistência criadas com sucesso. Seus dados de acesso estão disponíveis na tela inicial.')
        }
      } else {
        const {data,error} = await supabase!.auth.signInWithPassword({email,password})
        if (error) throw error
        if (data.user) await finishPendingCompany(data.user)
      }
    } catch(e) { setError(e instanceof Error ? e.message : 'Falha na autenticação.') }
    finally { setBusy(false) }
  }

  async function submitCompany(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setNotice('')
    try {
      const normalize = (value:string) => value.trim().toLocaleLowerCase('pt-BR').replace(/\s+/g,' ')
      const digits = (value:string) => value.replace(/\D/g,'')
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
    <h1>{mode==='login'?'Acesse sua empresa':'Crie seu acesso'}</h1>
    {mode==='login' && quickMode ? <form onSubmit={submitQuickLogin}>
      <label>Código da empresa<input required autoCapitalize="characters" value={companyCode} onChange={e=>setCompanyCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,10))} placeholder="Ex.: AB12CD34"/></label>
      <label>Nome de usuário<input required autoComplete="username" value={username} onChange={e=>setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g,'').slice(0,30))} placeholder="Ex.: joao"/></label>
      <label>PIN de 6 números<input type="password" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required autoComplete="current-password" value={pin} onChange={e=>setPin(e.target.value.replace(/[^0-9]/g,'').slice(0,6))} placeholder="••••••"/></label>
      {error&&<p className="company-error">{error}</p>}
      <button className="company-primary" disabled={busy}>{busy?'Validando...':'Entrar no sistema'}</button>
      <button type="button" className="company-link" onClick={()=>{setQuickMode(false);setError('')}}>Entrar com e-mail e senha</button>
    </form> : <form onSubmit={submitAuth}>
      {mode==='signup'&&<>
        <label>Seu nome<input required value={fullName} onChange={e=>setFullName(e.target.value)} placeholder="Nome completo"/></label>
        <label>Nome da assistência<input required minLength={2} value={companyName} onChange={e=>setCompanyName(e.target.value)} placeholder="Ex.: Minha Assistência"/></label>
        <label>CPF ou CNPJ (opcional)<input value={taxId} onChange={e=>setTaxId(e.target.value)} placeholder="Documento"/></label>
        <label>Telefone (opcional)<input value={phone} onChange={e=>setPhone(e.target.value)} placeholder="(00) 00000-0000"/></label>
      </>}
      <label>E-mail<input type="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="voce@empresa.com"/></label>
      <label>Senha<input type="password" required minLength={8} value={password} onChange={e=>setPassword(e.target.value)} placeholder="Mínimo de 8 caracteres"/></label>
      {error&&<p className="company-error">{error}</p>}{notice&&<p className="company-notice">{notice}</p>}
      <button className="company-primary" disabled={busy}>{busy?'Aguarde...':mode==='login'?'Entrar':'Criar conta e assistência'}</button>
    </form>}
    {mode==='login' && !quickMode && <button className="company-link" onClick={()=>{setQuickMode(true);setError('')}}>Entrar com código da empresa e PIN</button>}
    <button className="company-link" onClick={()=>{setMode(mode==='login'?'signup':'login');setQuickMode(false);setError('');setNotice('')}}>{mode==='login'?'Ainda não tem conta? Criar acesso':'Já tem conta? Entrar'}</button>
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
    return <><>{registrationInfo && <section className="company-auth-card" style={{margin:'16px auto',maxWidth:520}}>
      <h2>Cadastro concluído!</h2>
      <p>Guarde os dados de acesso da sua empresa:</p>
      <p><b>Código da empresa:</b> {registrationInfo.companyCode || 'Consulte em Equipe'}</p>
      <p><b>Usuário:</b> {registrationInfo.username}</p>
      <p><b>E-mail:</b> {registrationInfo.email}</p>
      <p>Entre com seu e-mail e senha. Para funcionários, use o código da empresa, usuário e PIN.</p>
      <button className="company-link" onClick={()=>setRegistrationInfo(null)}>Continuar</button>
    </section>}</><CompanyWorkspace company={selected} role={memberships.find(m=>m.company_id===selected.id)?.role||'technician'} email={session.user.email||''} onSignOut={signOut}/></>
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
