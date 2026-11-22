import { useCallback, useEffect, useState, type FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { Building2, LoaderCircle, LogOut, Mail, ShieldCheck, Smartphone } from 'lucide-react'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import { listMyCompanies, registerCompany, type Company, type CompanyMembership } from '../lib/company-data'
import CompanyWorkspace from './CompanyWorkspace'

export default function CompanyAuthGate() {
  const [session, setSession] = useState<Session | null>(null)
  const [memberships, setMemberships] = useState<CompanyMembership[]>([])
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

  const refreshMemberships = useCallback(async () => {
    const rows = await listMyCompanies()
    setMemberships(rows)
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
      if (!next) { setMemberships([]); setSelected(null) }
      else window.setTimeout(() => { refreshMemberships().catch(e => setError(e instanceof Error ? e.message : 'Erro ao carregar assistências.')) },0)
    })
    return () => { alive = false; subscription.unsubscribe() }
  }, [refreshMemberships])

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
      await registerCompany({name:companyName,taxId,phone})
      await refreshMemberships()
      setNotice('Assistência cadastrada com sucesso.')
    } catch(e) { setError(e instanceof Error ? e.message : 'Não foi possível cadastrar a assistência.') }
    finally { setBusy(false) }
  }

  async function signOut() {
    await supabase!.auth.signOut()
    setSession(null); setMemberships([]); setSelected(null)
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

  if (selected) return <CompanyWorkspace company={selected} role={memberships.find(m=>m.company_id===selected.id)?.role||'technician'} email={session.user.email||''} onSignOut={signOut}/>

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
