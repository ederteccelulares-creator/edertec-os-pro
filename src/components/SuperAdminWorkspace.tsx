import { useEffect, useState } from 'react'
import { Building2, CreditCard, LogOut, RefreshCw, ShieldCheck, Users, Plus, Save } from 'lucide-react'
import {
  getPlatformDashboardSummary, listPlatformOrganizations, listPlatformPlans,
  savePlatformPlan, updatePlatformSubscription,
} from '../lib/tenant-data'
import type { PlatformOrganization, PlatformPlan } from '../lib/tenant-data'
import PlatformSupportPanel from './PlatformSupportPanel'

type Props = { email: string; onSignOut: () => void }
type Summary = {organizations:number;active_subscriptions:number;trialing_subscriptions:number;past_due_subscriptions:number;suspended_subscriptions:number;users:number}
const currency=(value:number)=>Number(value||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})
const statusLabels:Record<string,string>={trialing:'Em teste',active:'Ativa',past_due:'Em atraso',suspended:'Suspensa',cancelled:'Cancelada',expired:'Expirada'}

export default function SuperAdminWorkspace({email,onSignOut}:Props){
  const [summary,setSummary]=useState<Summary|null>(null)
  const [organizations,setOrganizations]=useState<PlatformOrganization[]>([])
  const [plans,setPlans]=useState<PlatformPlan[]>([])
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const [notice,setNotice]=useState('')
  const [tab,setTab]=useState<'companies'|'plans'|'support'>('companies')
  const [showPlan,setShowPlan]=useState(false)
  const [editingPlan,setEditingPlan]=useState<string|undefined>()
  const [planForm,setPlanForm]=useState({code:'',name:'',description:'',monthly:'0',yearly:'0',users:'5',branches:'1',active:true})
  const [orgEdits,setOrgEdits]=useState<Record<string,{status:string;planId:string;trialEnd:string;periodEnd:string}>>({})

  async function load(){
    setBusy(true);setError('')
    try{
      const [s,o,p]=await Promise.all([getPlatformDashboardSummary(),listPlatformOrganizations(),listPlatformPlans()])
      setSummary(s);setOrganizations(o);setPlans(p)
      setOrgEdits(Object.fromEntries(o.map(org=>[org.organization_id,{
        status:org.subscription_status||'trialing',planId:org.plan_id||'',
        trialEnd:org.trial_ends_at?.slice(0,10)||'',periodEnd:org.current_period_end?.slice(0,10)||''
      }])))
    }catch(e){setError(e instanceof Error?e.message:'Não foi possível carregar o painel.')}
    finally{setBusy(false)}
  }
  useEffect(()=>{void load()},[])

  function editPlan(plan?:PlatformPlan){
    setEditingPlan(plan?.id)
    setPlanForm(plan?{code:plan.code,name:plan.name,description:plan.description||'',monthly:String(plan.monthly_price),yearly:String(plan.yearly_price),users:String(plan.max_users??''),branches:String(plan.max_branches??''),active:plan.active}:{code:'',name:'',description:'',monthly:'0',yearly:'0',users:'5',branches:'1',active:true})
    setShowPlan(true)
  }
  async function submitPlan(event:React.FormEvent){
    event.preventDefault();setBusy(true);setError('');setNotice('')
    try{
      await savePlatformPlan({id:editingPlan,code:planForm.code,name:planForm.name,description:planForm.description,monthly_price:Number(planForm.monthly),yearly_price:Number(planForm.yearly),max_users:planForm.users===''?null:Number(planForm.users),max_branches:planForm.branches===''?null:Number(planForm.branches),active:planForm.active})
      setShowPlan(false);setNotice('Plano salvo com sucesso.');await load()
    }catch(e){setError(e instanceof Error?e.message:'Não foi possível salvar o plano.')}
    finally{setBusy(false)}
  }
  async function saveOrg(org:PlatformOrganization){
    const edit=orgEdits[org.organization_id];if(!edit)return
    setBusy(true);setError('');setNotice('')
    try{
      await updatePlatformSubscription({organizationId:org.organization_id,status:edit.status as 'trialing'|'active'|'past_due'|'suspended'|'cancelled'|'expired',planId:edit.planId||null,trialEndsAt:edit.trialEnd?new Date(edit.trialEnd+'T23:59:59').toISOString():null,currentPeriodEnd:edit.periodEnd?new Date(edit.periodEnd+'T23:59:59').toISOString():null})
      setNotice('Assinatura atualizada.');await load()
    }catch(e){setError(e instanceof Error?e.message:'Não foi possível atualizar a assinatura.')}
    finally{setBusy(false)}
  }

  return <main className="platform-page">
    <header className="platform-header"><div className="platform-brand"><span><ShieldCheck/></span><div><b>EDERTEC <i>OS PRO</i></b><small>SUPER ADMIN · PLATAFORMA</small></div></div><div className="platform-account"><span>{email}</span><button onClick={onSignOut} title="Sair"><LogOut size={17}/></button></div></header>
    <section className="platform-content">
      <div className="platform-heading"><div><small>CONTROLE GLOBAL</small><h1>Painel Super Admin</h1><p>Empresas, assinaturas e planos da plataforma</p></div><button className="tenant-history-button" onClick={()=>void load()} disabled={busy}><RefreshCw size={15}/> Atualizar</button></div>
      {error&&<div className="tenant-error">{error}</div>}{notice&&<div className="auth-notice">{notice}</div>}
      <div className="platform-stats">
        <article><span>Empresas</span><b>{summary?.organizations??'—'}</b></article>
        <article><span>Usuários ativos</span><b>{summary?.users??'—'}</b></article>
        <article><span>Assinaturas ativas</span><b>{summary?.active_subscriptions??'—'}</b></article>
        <article><span>Em período de teste</span><b>{summary?.trialing_subscriptions??'—'}</b></article>
        <article><span>Em atraso</span><b>{summary?.past_due_subscriptions??'—'}</b></article>
      </div>
      <nav className="platform-tabs"><button className={tab==='companies'?'active':''} onClick={()=>setTab('companies')}>Empresas</button><button className={tab==='plans'?'active':''} onClick={()=>setTab('plans')}>Planos</button><button className={tab==='support'?'active':''} onClick={()=>setTab('support')}>Chamados de suporte</button></nav>{tab==='support'&&<PlatformSupportPanel/>}{tab==='companies'&&<section className="tenant-panel"><div className="tenant-panel-head"><div><b><Building2 size={16}/> Empresas cadastradas</b><small>Controle de status e plano de cada assistência</small></div></div>
        {organizations.length===0?<p className="tenant-empty">Nenhuma empresa cadastrada.</p>:<div className="platform-org-list">{organizations.map(org=>{const edit=orgEdits[org.organization_id]||{status:'trialing',planId:'',trialEnd:'',periodEnd:''};return <article className="platform-org" key={org.organization_id}>
          <div className="platform-org-title"><div><b>{org.organization_name}</b><small>{org.organization_slug} · {org.member_count} usuários · {org.branch_count} filiais</small></div><span className="platform-status">{statusLabels[org.subscription_status||'trialing']||org.subscription_status}</span></div>
          <div className="platform-org-controls">
            <label>Status<select value={edit.status} onChange={e=>setOrgEdits(v=>({...v,[org.organization_id]:{...edit,status:e.target.value}}))}>{Object.entries(statusLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
            <label>Plano<select value={edit.planId} onChange={e=>setOrgEdits(v=>({...v,[org.organization_id]:{...edit,planId:e.target.value}}))}><option value="">Sem plano</option>{plans.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
            <label>Fim do teste<input type="date" value={edit.trialEnd} onChange={e=>setOrgEdits(v=>({...v,[org.organization_id]:{...edit,trialEnd:e.target.value}}))}/></label>
            <label>Fim do período<input type="date" value={edit.periodEnd} onChange={e=>setOrgEdits(v=>({...v,[org.organization_id]:{...edit,periodEnd:e.target.value}}))}/></label>
            <button className="tenant-primary" disabled={busy||!org.subscription_id} onClick={()=>void saveOrg(org)}><Save size={14}/> Salvar assinatura</button>
          </div>
        </article>})}</div>}
      </section>}
      {tab==='plans'&&<section className="tenant-panel"><div className="tenant-panel-head"><div><b><CreditCard size={16}/> Planos e preços</b><small>Configure limites e valores comerciais</small></div><button className="tenant-primary" onClick={()=>editPlan()}><Plus size={15}/> Novo plano</button></div>
        {showPlan&&<form className="tenant-form" onSubmit={submitPlan}><div className="tenant-grid"><label>Código<input required value={planForm.code} onChange={e=>setPlanForm(v=>({...v,code:e.target.value}))}/></label><label>Nome<input required value={planForm.name} onChange={e=>setPlanForm(v=>({...v,name:e.target.value}))}/></label><label>Preço mensal (R$)<input type="number" min="0" step="0.01" value={planForm.monthly} onChange={e=>setPlanForm(v=>({...v,monthly:e.target.value}))}/></label><label>Preço anual (R$)<input type="number" min="0" step="0.01" value={planForm.yearly} onChange={e=>setPlanForm(v=>({...v,yearly:e.target.value}))}/></label><label>Limite de usuários<input type="number" min="0" value={planForm.users} onChange={e=>setPlanForm(v=>({...v,users:e.target.value}))}/></label><label>Limite de filiais<input type="number" min="0" value={planForm.branches} onChange={e=>setPlanForm(v=>({...v,branches:e.target.value}))}/></label><label className="wide">Descrição<input value={planForm.description} onChange={e=>setPlanForm(v=>({...v,description:e.target.value}))}/></label><label><input type="checkbox" checked={planForm.active} onChange={e=>setPlanForm(v=>({...v,active:e.target.checked}))}/> Plano ativo</label></div><div className="tenant-form-actions"><button type="button" onClick={()=>setShowPlan(false)}>Cancelar</button><button className="tenant-primary" disabled={busy}>Salvar plano</button></div></form>}
        {plans.length===0?<p className="tenant-empty">Nenhum plano cadastrado.</p>:<div className="platform-plan-grid">{plans.map(plan=><article key={plan.id}><div><b>{plan.name}</b><span className={plan.active?'tenant-stock-ok':'tenant-stock-low'}>{plan.active?'Ativo':'Inativo'}</span></div><strong>{currency(plan.monthly_price)}<small>/mês</small></strong><p>{currency(plan.yearly_price)} / ano</p><small>{plan.max_users??'Ilimitado'} usuários · {plan.max_branches??'Ilimitado'} filiais</small><button className="tenant-history-button" onClick={()=>editPlan(plan)}>Editar plano</button></article>)}</div>}
      </section>}
      <div className="platform-footer"><Users size={15}/> Painel protegido por autorização administrativa independente das funções de cada empresa.</div>
    </section>
  </main>
}
