import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Building2, ShieldCheck, CreditCard, Package, RefreshCw, LogOut, Plus } from 'lucide-react'
import { supabase } from '../lib/supabase'

type CompanyRow = { id:string; name:string; tax_id:string|null; status:string; created_at:string }
type PlanRow = { id:string; code:string; name:string; description:string|null; price:number; billing_interval:string; max_branches:number|null; max_users:number|null; is_active:boolean }
type SubscriptionRow = { id:string; company_id:string; plan_id:string; status:string; starts_at:string; ends_at:string|null; companies?:{name:string}|{name:string}[]|null; subscription_plans?:{name:string}|{name:string}[]|null }

type Props = { email:string; onSignOut:()=>void }
const money=(value:number)=>Number(value||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})
const intervalLabels:Record<string,string>={monthly:'Mensal',yearly:'Anual',six_months:'Semestral',lifetime:'Vitalício'}

export default function PlatformAdminPanel({email,onSignOut}:Props) {
  const [tab,setTab]=useState<'companies'|'plans'|'subscriptions'>('companies')
  const [companies,setCompanies]=useState<CompanyRow[]>([])
  const [plans,setPlans]=useState<PlanRow[]>([])
  const [subscriptions,setSubscriptions]=useState<SubscriptionRow[]>([])
  const [loading,setLoading]=useState(true)
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const [notice,setNotice]=useState('')
  const [showPlan,setShowPlan]=useState(false)
  const [planForm,setPlanForm]=useState({code:'',name:'',description:'',price:'0',billing_interval:'monthly',max_branches:'',max_users:''})

  const load=useCallback(async()=>{
    if(!supabase)return
    setLoading(true);setError('')
    try{
      const [c,p,s]=await Promise.all([
        supabase.from('companies').select('id,name,tax_id,status,created_at').order('created_at',{ascending:false}).limit(500),
        supabase.from('subscription_plans').select('id,code,name,description,price,billing_interval,max_branches,max_users,is_active').order('price'),
        supabase.from('company_subscriptions').select('id,company_id,plan_id,status,starts_at,ends_at,companies(name),subscription_plans(name)').order('created_at',{ascending:false}).limit(500),
      ])
      if(c.error)throw c.error;if(p.error)throw p.error;if(s.error)throw s.error
      setCompanies((c.data||[]) as CompanyRow[]);setPlans((p.data||[]) as PlanRow[]);setSubscriptions((s.data||[]) as SubscriptionRow[])
    }catch(e){setError(e instanceof Error?e.message:'Não foi possível carregar o painel.')}
    finally{setLoading(false)}
  },[])

  useEffect(()=>{void load()},[load])

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

  async function updateSubscriptionStatus(sub:SubscriptionRow,status:string){
    if(!supabase)return
    setBusy(true);setError('');setNotice('')
    try{const {error}=await supabase.from('company_subscriptions').update({status}).eq('id',sub.id);if(error)throw error;setNotice('Assinatura atualizada.');await load()}
    catch(e){setError(e instanceof Error?e.message:'Falha ao atualizar assinatura.')}
    finally{setBusy(false)}
  }

  return <main className="platform-admin">
    <header className="platform-head"><div className="platform-brand"><ShieldCheck/><span><b>EDERTEC OS PRO</b><small>SUPER ADMIN · PAINEL DA PLATAFORMA</small></span></div><div className="platform-user"><span>{email}</span><button onClick={onSignOut}><LogOut size={15}/> Sair</button></div></header>
    <section className="platform-content">
      <div className="platform-title"><div><small>CONTROLE CENTRAL</small><h1>Super Admin</h1><p>Gerencie empresas, planos e assinaturas da plataforma.</p></div><button className="platform-refresh" onClick={()=>void load()}><RefreshCw size={15}/> Atualizar</button></div>
      {error&&<div className="platform-error">{error}</div>}{notice&&<div className="platform-notice">{notice}</div>}
      <div className="platform-stats"><article><Building2/><small>Empresas cadastradas</small><b>{companies.length}</b></article><article><Package/><small>Planos disponíveis</small><b>{plans.filter(p=>p.is_active).length}</b></article><article><CreditCard/><small>Assinaturas</small><b>{subscriptions.length}</b></article></div>
      <nav className="platform-tabs"><button className={tab==='companies'?'active':''} onClick={()=>setTab('companies')}>Empresas</button><button className={tab==='plans'?'active':''} onClick={()=>setTab('plans')}>Planos</button><button className={tab==='subscriptions'?'active':''} onClick={()=>setTab('subscriptions')}>Assinaturas</button></nav>
      {loading?<p className="platform-empty">Carregando dados da plataforma...</p>:<>
        {tab==='companies'&&<section className="platform-panel"><h2>Empresas cadastradas</h2><div className="platform-table-wrap"><table><thead><tr><th>EMPRESA</th><th>DOCUMENTO</th><th>CADASTRO</th><th>SITUAÇÃO</th></tr></thead><tbody>{companies.map(c=><tr key={c.id}><td><b>{c.name}</b><small>{c.id}</small></td><td>{c.tax_id||'—'}</td><td>{new Date(c.created_at).toLocaleDateString('pt-BR')}</td><td><select disabled={busy} value={c.status} onChange={e=>void updateCompanyStatus(c,e.target.value)}><option value="active">Ativa</option><option value="suspended">Suspensa</option><option value="cancelled">Cancelada</option></select></td></tr>)}</tbody></table></div></section>}
        {tab==='plans'&&<section className="platform-panel"><div className="platform-panel-title"><h2>Planos e preços</h2><button onClick={()=>setShowPlan(v=>!v)}><Plus size={15}/> Novo plano</button></div>
          {showPlan&&<form className="platform-form" onSubmit={createPlan}><label>Código<input required value={planForm.code} onChange={e=>setPlanForm({...planForm,code:e.target.value})} placeholder="basico"/></label><label>Nome<input required value={planForm.name} onChange={e=>setPlanForm({...planForm,name:e.target.value})} placeholder="Plano Básico"/></label><label>Preço (R$)<input required type="number" min="0" step="0.01" value={planForm.price} onChange={e=>setPlanForm({...planForm,price:e.target.value})}/></label><label>Periodicidade<select value={planForm.billing_interval} onChange={e=>setPlanForm({...planForm,billing_interval:e.target.value})}><option value="monthly">Mensal</option><option value="six_months">Semestral</option><option value="yearly">Anual</option><option value="lifetime">Vitalício</option></select></label><label>Limite de filiais<input type="number" min="1" value={planForm.max_branches} onChange={e=>setPlanForm({...planForm,max_branches:e.target.value})} placeholder="Sem limite"/></label><label>Limite de usuários<input type="number" min="1" value={planForm.max_users} onChange={e=>setPlanForm({...planForm,max_users:e.target.value})} placeholder="Sem limite"/></label><label className="platform-wide">Descrição<input value={planForm.description} onChange={e=>setPlanForm({...planForm,description:e.target.value})}/></label><div className="platform-form-actions"><button type="button" onClick={()=>setShowPlan(false)}>Cancelar</button><button type="submit" disabled={busy}>{busy?'Salvando...':'Criar plano'}</button></div></form>}
          <div className="platform-table-wrap"><table><thead><tr><th>PLANO</th><th>VALOR</th><th>PERÍODO</th><th>LIMITES</th><th>STATUS</th></tr></thead><tbody>{plans.map(p=><tr key={p.id}><td><b>{p.name}</b><small>{p.code}</small></td><td>{money(p.price)}</td><td>{intervalLabels[p.billing_interval]||p.billing_interval}</td><td>{p.max_branches??'∞'} filiais · {p.max_users??'∞'} usuários</td><td><button className="platform-toggle" disabled={busy} onClick={()=>void togglePlan(p)}>{p.is_active?'Ativo':'Inativo'}</button></td></tr>)}</tbody></table></div>
        </section>}
        {tab==='subscriptions'&&<section className="platform-panel"><h2>Assinaturas das empresas</h2><div className="platform-table-wrap"><table><thead><tr><th>EMPRESA</th><th>PLANO</th><th>INÍCIO</th><th>VENCIMENTO</th><th>SITUAÇÃO</th></tr></thead><tbody>{subscriptions.map(s=><tr key={s.id}><td>{(Array.isArray(s.companies)?s.companies[0]?.name:s.companies?.name)||s.company_id}</td><td>{(Array.isArray(s.subscription_plans)?s.subscription_plans[0]?.name:s.subscription_plans?.name)||'—'}</td><td>{new Date(s.starts_at).toLocaleDateString('pt-BR')}</td><td>{s.ends_at?new Date(s.ends_at).toLocaleDateString('pt-BR'):'—'}</td><td><select disabled={busy} value={s.status} onChange={e=>void updateSubscriptionStatus(s,e.target.value)}><option value="trial">Teste</option><option value="active">Ativa</option><option value="past_due">Em atraso</option><option value="cancelled">Cancelada</option><option value="expired">Expirada</option></select></td></tr>)}</tbody></table></div></section>}
      </>}
      <footer className="platform-footer">Ações administrativas protegidas por autorização verificada no banco de dados.</footer>
    </section>
  </main>
}
