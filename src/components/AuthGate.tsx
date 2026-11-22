import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Building2, CheckCircle2, LoaderCircle, LogOut, Mail, ShieldCheck, Smartphone } from 'lucide-react'
import type { Session } from '@supabase/supabase-js'
import TenantWorkspace from './TenantWorkspace'
import SuperAdminWorkspace from './SuperAdminWorkspace'
import { isPlatformAdmin } from '../lib/tenant-data'
import { isSupabaseConfigured, supabase, type Organization, type OrganizationRole } from '../lib/supabase'

type Membership = {
  organization_id: string
  role: OrganizationRole
  organizations: Organization | Organization[] | null
}

function slugify(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)
}

function SetupRequired() {
  return <main className="auth-page"><section className="auth-card setup-card">
    <div className="auth-brand"><span><Smartphone size={25}/></span><div><b>EDERTEC <i>OS PRO</i></b><small>PLATAFORMA DE GESTÃO</small></div></div>
    <div className="auth-icon"><ShieldCheck size={25}/></div>
    <h1>Conecte o banco de dados</h1>
    <p>O próximo passo é vincular o projeto ao Supabase para ativar autenticação e contas independentes para cada assistência.</p>
    <ol className="setup-steps"><li>Crie um projeto no Supabase.</li><li>Execute a migração <code>supabase/migrations/0001_saas_core.sql</code> no SQL Editor.</li><li>Configure <code>VITE_SUPABASE_URL</code> e <code>VITE_SUPABASE_ANON_KEY</code> nas variáveis de ambiente.</li></ol>
    <a className="auth-link" href="https://supabase.com/dashboard" target="_blank" rel="noreferrer">Abrir painel do Supabase ↗</a>
    <small className="auth-note">Não use a chave service_role no navegador.</small>
  </section></main>
}

export default function AuthGate() {
  const [session, setSession] = useState<Session | null>(null)
  const [memberships, setMemberships] = useState<Membership[]>([])
  const [platformAdmin, setPlatformAdmin] = useState(false)
  const [selectedOrg, setSelectedOrg] = useState<Organization | null>(null)
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [companySlug, setCompanySlug] = useState('')

  const loadMemberships = useCallback(async (userId: string) => {
    if (!supabase) return
    const { data, error: queryError } = await supabase
      .from('organization_members')
      .select('organization_id, role, organizations(id,name,slug,timezone)')
      .eq('user_id', userId)
      .eq('active', true)
    if (queryError) throw queryError
    const rows = (data || []) as unknown as Membership[]
    setMemberships(rows)
    if (rows.length === 1) {
      const org = Array.isArray(rows[0].organizations) ? rows[0].organizations[0] : rows[0].organizations
      if (org) setSelectedOrg(org)
    }
  }, [])

  useEffect(() => {
    if (!supabase) { setLoading(false); return }
    let alive = true
    supabase.auth.getSession().then(async ({ data }) => {
      if (!alive) return
      setSession(data.session)
      if (data.session?.user) {
        try {
          const isAdmin = await isPlatformAdmin()
          if (alive) setPlatformAdmin(isAdmin)
          if (!isAdmin) await loadMemberships(data.session.user.id)
        } catch (e) {
          if (alive) setError(e instanceof Error ? e.message : 'Não foi possível verificar seu acesso.')
        }
      }
      if (alive) setLoading(false)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      if (!nextSession) {
        setMemberships([]); setSelectedOrg(null); setPlatformAdmin(false)
      } else {
        window.setTimeout(async () => {
          try {
            const isAdmin = await isPlatformAdmin()
            setPlatformAdmin(isAdmin)
            if (!isAdmin) await loadMemberships(nextSession.user.id)
            else { setMemberships([]); setSelectedOrg(null) }
          } catch (e) {
            setError(e instanceof Error ? e.message : 'Erro ao verificar acesso administrativo.')
          }
        }, 0)
      }
    })
    return () => { alive = false; listener.subscription.unsubscribe() }
  }, [loadMemberships])

  if (!isSupabaseConfigured || !supabase) return <SetupRequired />
  const db = supabase
  if (loading) return <main className="auth-page"><div className="auth-loading"><LoaderCircle className="spin" size={25}/> Verificando acesso seguro...</div></main>

  const submitAuth = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError(''); setNotice('')
    try {
      if (mode === 'signup') {
        const { data, error: authError } = await db.auth.signUp({
          email, password, options: { data: { full_name: fullName } }
        })
        if (authError) throw authError
        if (!data.session) setNotice('Cadastro recebido. Confirme seu e-mail para ativar o acesso e depois entre no sistema.')
        else setNotice('Conta criada. Agora cadastre sua assistência.')
      } else {
        const { error: authError } = await db.auth.signInWithPassword({ email, password })
        if (authError) throw authError
      }
    } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível autenticar.') }
    finally { setBusy(false) }
  }

  const createCompany = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError(''); setNotice('')
    try {
      const slug = slugify(companySlug || companyName)
      if (slug.length < 3) throw new Error('Use um nome de empresa com pelo menos 3 caracteres.')
      const { data, error: rpcError } = await db.rpc('create_organization', {
        org_name: companyName.trim(), org_slug: slug
      })
      if (rpcError) throw rpcError
      await loadMemberships(session!.user.id)
      const { data: org, error: orgError } = await db.from('organizations')
        .select('id,name,slug,timezone').eq('id', data).single()
      if (orgError) throw orgError
      setSelectedOrg(org as Organization)
      setNotice('Assistência cadastrada com sucesso.')
    } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível cadastrar a assistência.') }
    finally { setBusy(false) }
  }

  const signOut = async () => { await db.auth.signOut(); setSelectedOrg(null); setMemberships([]) }

  if (!session) return <main className="auth-page"><section className="auth-card">
    <div className="auth-brand"><span><Smartphone size={25}/></span><div><b>EDERTEC <i>OS PRO</i></b><small>PLATAFORMA DE GESTÃO</small></div></div>
    <div className="auth-eyebrow">GESTÃO PROFISSIONAL PARA ASSISTÊNCIAS</div>
    <h1>{mode === 'login' ? 'Acesse sua conta' : 'Crie sua conta'}</h1>
    <p className="auth-subtitle">Seu ambiente de trabalho, com dados protegidos por empresa.</p>
    <form className="auth-form" onSubmit={submitAuth}>
      {mode === 'signup' && <label>Seu nome<input required value={fullName} onChange={e=>setFullName(e.target.value)} placeholder="Nome completo"/></label>}
      <label>E-mail<div className="auth-input"><Mail size={17}/><input type="email" required autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="voce@empresa.com"/></div></label>
      <label>Senha<input type="password" required minLength={8} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={password} onChange={e=>setPassword(e.target.value)} placeholder="Mínimo de 8 caracteres"/></label>
      {error && <div className="auth-error">{error}</div>}{notice && <div className="auth-notice">{notice}</div>}
      <button className="primary auth-submit" disabled={busy}>{busy ? <LoaderCircle className="spin" size={17}/> : <ShieldCheck size={17}/>} {mode === 'login' ? 'Entrar com segurança' : 'Criar conta'}</button>
    </form>
    <button className="auth-switch" onClick={()=>{setMode(mode==='login'?'signup':'login');setError('');setNotice('')}}>{mode==='login'?'Ainda não tem conta? Criar acesso':'Já possui conta? Fazer login'}</button>
    <div className="auth-security"><ShieldCheck size={15}/> Conexão autenticada e separação de dados por assistência</div>
  </section></main>

  if (platformAdmin) return <SuperAdminWorkspace email={session.user.email || ''} onSignOut={signOut} />\n\n  if (platformAdmin && session) return <SuperAdminWorkspace email={session.user.email || ''} onSignOut={signOut} />\n\n  if (!selectedOrg && memberships.length > 1) return <main className="auth-page"><section className="auth-card">
    <div className="auth-brand"><span><Building2 size={24}/></span><div><b>EDERTEC <i>OS PRO</i></b><small>SELECIONE SUA EMPRESA</small></div></div><h1>Qual assistência deseja acessar?</h1>
    <div className="org-list">{memberships.map(m=>{const org=Array.isArray(m.organizations)?m.organizations[0]:m.organizations;return org?<button key={m.organization_id} className="org-option" onClick={()=>setSelectedOrg(org)}><Building2 size={20}/><span><b>{org.name}</b><small>{m.role}</small></span>→</button>:null})}</div><button className="auth-switch" onClick={signOut}>Sair da conta</button>
  </section></main>

  if (!selectedOrg) return <main className="auth-page"><section className="auth-card">
    <div className="auth-brand"><span><Building2 size={24}/></span><div><b>EDERTEC <i>OS PRO</i></b><small>CADASTRO DA ASSISTÊNCIA</small></div></div>
    <div className="auth-icon"><CheckCircle2 size={25}/></div><h1>Cadastre sua assistência</h1><p className="auth-subtitle">Crie o ambiente exclusivo da sua empresa. Você será o proprietário e poderá convidar sua equipe depois.</p>
    <form className="auth-form" onSubmit={createCompany}>
      <label>Nome da assistência<input required minLength={2} value={companyName} onChange={e=>{setCompanyName(e.target.value);setCompanySlug(slugify(e.target.value))}} placeholder="Ex.: Minha Assistência Técnica"/></label>
      <label>Identificador da empresa<input required minLength={3} maxLength={40} pattern="[a-z0-9][a-z0-9-]{2,39}" value={companySlug} onChange={e=>setCompanySlug(e.target.value)} placeholder="minha-assistencia"/><small className="field-help">Somente letras minúsculas, números e hífen.</small></label>
      {error && <div className="auth-error">{error}</div>}{notice && <div className="auth-notice">{notice}</div>}
      <button className="primary auth-submit" disabled={busy}>{busy?<LoaderCircle className="spin" size={17}/>:<Building2 size={17}/>} Criar ambiente da empresa</button>
    </form><button className="auth-switch" onClick={signOut}>Sair da conta</button>
  </section></main>

  const activeMembership = memberships.find(item => item.organization_id === selectedOrg.id)
  return <TenantWorkspace organization={selectedOrg} role={activeMembership?.role || 'attendant'} email={session.user.email || ''} onSignOut={signOut} />
}
