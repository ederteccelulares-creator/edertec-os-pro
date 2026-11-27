import { useCallback, useEffect, useState } from 'react'
import { LayoutDashboard, Package, Tags, Truck, ShoppingCart, Wallet, LogOut, RefreshCw } from 'lucide-react'
import { supabase } from '../lib/supabase'
import EpartsCatalogAdminPanel from './EpartsCatalogAdminPanel'

type Props = { companyId:string; companyName:string; email:string; role:string; onSignOut:()=>void }
const money=(n:number)=>Number(n||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})

export default function EpartsWorkspace({companyId,companyName,email,role,onSignOut}:Props) {
  const [tab,setTab]=useState<'dashboard'|'commerce'>('dashboard')
  const [stats,setStats]=useState({products:0,suppliers:0,orders:0,revenue:0,commission:0,stock:0})
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState('')
  const load=useCallback(async()=>{
    if(!supabase)return
    setLoading(true);setError('')
    try {
      const [p,s,o]=await Promise.all([
        supabase.from('eparts_products').select('id,stock_quantity',{count:'exact'}).eq('company_id',companyId),
        supabase.from('eparts_suppliers').select('id',{count:'exact'}).eq('company_id',companyId),
        supabase.from('eparts_sales').select('id,total_amount,eparts_commission_amount',{count:'exact'}).eq('company_id',companyId)
      ])
      if(p.error)throw p.error;if(s.error)throw s.error;if(o.error)throw o.error
      setStats({products:p.count||0,suppliers:s.count||0,orders:o.count||0,revenue:(o.data||[]).reduce((n,x)=>n+Number(x.total_amount||0),0),commission:(o.data||[]).reduce((n,x)=>n+Number(x.eparts_commission_amount||0),0),stock:(p.data||[]).reduce((n,x)=>n+Number(x.stock_quantity||0),0)})
    } catch(e) {setError(e instanceof Error?e.message:'Não foi possível carregar o resumo da Eparts.')}
    finally {setLoading(false)}
  },[companyId])
  useEffect(()=>{void load()},[load])
  const nav=(value:'dashboard'|'commerce')=>setTab(value)
  return <div className="company-app">
    <aside className="company-sidebar">
      <div className="company-logo"><span><ShoppingCart/></span><div><b>EPARTS</b><small>COMÉRCIO E MARKETPLACE</small></div></div>
      <div className="company-current">{companyName}</div>
      <nav className="company-mobile-organized-nav">
        <div className="company-nav-section"><span className="company-nav-section-label">PRINCIPAL</span>
          <button className={tab==='dashboard'?'active':''} onClick={()=>nav('dashboard')}><LayoutDashboard size={18}/> Dashboard Eparts</button>
        </div>
        <div className="company-nav-section"><span className="company-nav-section-label">OPERAÇÃO</span>
          <button className={tab==='commerce'?'active':''} onClick={()=>nav('commerce')}><Package size={18}/> Produtos e estoque</button>
          <button className={tab==='commerce'?'':' '} onClick={()=>nav('commerce')}><Tags size={18}/> Marcas</button>
          <button className={tab==='commerce'?'':' '} onClick={()=>nav('commerce')}><Truck size={18}/> Fornecedores</button>
          <button className={tab==='commerce'?'':' '} onClick={()=>nav('commerce')}><ShoppingCart size={18}/> Vendas e pedidos</button>
          <button className={tab==='commerce'?'':' '} onClick={()=>nav('commerce')}><Wallet size={18}/> Comissões e repasses</button>
        </div>
      </nav>
      <div className="company-user"><b>{email}</b><small>Perfil: {role}</small><button onClick={onSignOut}><LogOut size={15}/> Sair</button></div>
    </aside>
    <main className="company-main">
      <div className="company-mobilebar"><div><b>EPARTS</b><small>{companyName}</small></div></div>
      <header className="company-top"><div><small>PLATAFORMA DE COMÉRCIO</small><h1>{tab==='dashboard'?'Dashboard Eparts':'Gestão comercial Eparts'}</h1></div><button className="company-icon-button" onClick={()=>void load()} title="Atualizar"><RefreshCw size={16}/></button></header>
      {error&&<div className="company-error-banner">{error}</div>}
      {tab==='dashboard'?<section className="company-panel">
        <div className="company-panel-head"><div><b>Visão geral da operação</b><small>Indicadores da Eparts, sem módulos de assistência técnica</small></div><button className="company-secondary" onClick={()=>void load()} disabled={loading}><RefreshCw size={15}/> Atualizar</button></div>
        {loading?<p className="company-empty">Carregando indicadores...</p>:<div className="company-stats-grid">
          <article className="company-stat-card"><span>Produtos cadastrados</span><strong>{stats.products}</strong></article>
          <article className="company-stat-card"><span>Unidades em estoque</span><strong>{stats.stock}</strong></article>
          <article className="company-stat-card"><span>Fornecedores</span><strong>{stats.suppliers}</strong></article>
          <article className="company-stat-card"><span>Pedidos</span><strong>{stats.orders}</strong></article>
          <article className="company-stat-card"><span>Vendas registradas</span><strong>{money(stats.revenue)}</strong></article>
          <article className="company-stat-card"><span>Comissão Eparts</span><strong>{money(stats.commission)}</strong></article>
        </div>}
        <div className="company-inline-actions"><button className="company-primary" onClick={()=>nav('commerce')}><Package size={16}/> Abrir gestão comercial</button></div>
      </section>:<EpartsCatalogAdminPanel companyId={companyId}/>}
      <footer className="company-footer">Painel exclusivo Eparts · acesso isolado por empresa</footer>
    </main>
  </div>
}
