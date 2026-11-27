import { useCallback, useEffect, useState } from 'react'
import { LayoutDashboard, Package, Tags, Truck, ShoppingCart, Wallet, LogOut, RefreshCw, ExternalLink } from 'lucide-react'
import { supabase } from '../lib/supabase'
import EpartsCatalogAdminPanel from './EpartsCatalogAdminPanel'
import EpartsPOS from './EpartsPOS'

type Props = { companyId:string; companyName:string; email:string; role:string; onSignOut:()=>void }
const money=(n:number)=>Number(n||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})

export default function EpartsWorkspace({companyId,companyName,email,role,onSignOut}:Props) {
  const [tab,setTab]=useState<'dashboard'|'products'|'brands'|'suppliers'|'sales'|'payouts'|'pos'>('dashboard')
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
        supabase.from('eparts_sales').select('id,total_amount,eparts_commission_amount,status,payment_status',{count:'exact'}).eq('company_id',companyId)
      ])
      if(p.error)throw p.error;if(s.error)throw s.error;if(o.error)throw o.error
      const activeOrders=(o.data||[]).filter(x=>x.status!=='cancelled'&&x.payment_status!=='refunded')
      setStats({products:p.count||0,suppliers:s.count||0,orders:activeOrders.length,revenue:activeOrders.reduce((n,x)=>n+Number(x.total_amount||0),0),commission:activeOrders.reduce((n,x)=>n+Number(x.eparts_commission_amount||0),0),stock:(p.data||[]).reduce((n,x)=>n+Number(x.stock_quantity||0),0)})
    } catch(e) {setError(e instanceof Error?e.message:'Não foi possível carregar o resumo da Eparts.')}
    finally {setLoading(false)}
  },[companyId])
  useEffect(()=>{void load()},[load])
  const nav=(value:'dashboard'|'products'|'brands'|'suppliers'|'sales'|'payouts'|'pos')=>setTab(value)
  return <div className="company-app eparts-workspace">
    <style>{`
      .eparts-workspace .company-sidebar{background:linear-gradient(180deg,#17130f 0%,#101010 55%,#151010 100%);border-right:1px solid rgba(204,158,73,.25)}
      .eparts-workspace .company-logo{gap:12px}
      .eparts-workspace .company-logo>span{background:linear-gradient(145deg,#d5ad58,#8d641f);color:#17120b;border-radius:12px;box-shadow:0 5px 18px rgba(190,143,54,.2)}
      .eparts-workspace .company-logo b{letter-spacing:2px;color:#f3d18a}
      .eparts-workspace .company-current{border:1px solid rgba(206,164,85,.24);background:rgba(206,164,85,.06);border-radius:10px;padding:11px 13px}
      .eparts-workspace .company-nav-section-label{color:#b99a60;letter-spacing:1.2px;font-size:10px;font-weight:800}
      .eparts-workspace .company-sidebar nav button{border-radius:10px;transition:background .15s ease,color .15s ease}
      .eparts-workspace .company-sidebar nav button.active{background:linear-gradient(90deg,rgba(193,145,54,.22),rgba(193,145,54,.07));color:#f4d38e;border-left:3px solid #d4a84d}
      .eparts-workspace .company-top{gap:14px;align-items:center}
      .eparts-workspace .company-top h1{letter-spacing:-.5px}
      .eparts-workspace .company-panel{border:1px solid rgba(203,158,77,.22);box-shadow:0 12px 34px rgba(0,0,0,.14)}
      .eparts-workspace .company-stats-grid{gap:13px}
      .eparts-workspace .company-stat-card{border:1px solid rgba(204,163,88,.22);background:linear-gradient(145deg,rgba(42,34,23,.75),rgba(20,19,18,.95));border-radius:14px;padding:17px;min-width:0}
      .eparts-workspace .company-stat-card span{color:#c5b79e;line-height:1.4}
      .eparts-workspace .company-stat-card strong{color:#f2d18a;font-size:clamp(21px,2.2vw,28px);overflow-wrap:anywhere}
      .eparts-workspace .company-footer{color:#9f927e}
      @media(max-width:900px){.eparts-workspace .company-top{align-items:flex-start;flex-wrap:wrap}.eparts-workspace .company-top>div:last-child{width:100%;justify-content:space-between!important}}
      @media(max-width:640px){.eparts-workspace .company-top h1{font-size:clamp(22px,6vw,29px)}.eparts-workspace .company-panel{padding:14px}.eparts-workspace .company-stats-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.eparts-workspace .company-stat-card{padding:13px}.eparts-workspace .company-stat-card strong{font-size:21px}}
      @media(max-width:380px){.eparts-workspace .company-stats-grid{grid-template-columns:minmax(0,1fr)}}
    `}</style>
    <aside className="company-sidebar">
      <div className="company-logo"><span><ShoppingCart/></span><div><b>EPARTS</b><small>COMÉRCIO E MARKETPLACE</small></div></div>
      <div className="company-current">{companyName}</div>
      <nav className="company-mobile-organized-nav">
        <div className="company-nav-section"><span className="company-nav-section-label">PRINCIPAL</span>
          <button className={tab==='dashboard'?'active':''} onClick={()=>nav('dashboard')}><LayoutDashboard size={18}/> Dashboard Eparts</button>
        </div>
        <div className="company-nav-section"><span className="company-nav-section-label">OPERAÇÃO</span>
          <button className={tab==='products'?'active':''} onClick={()=>nav('products')}><Package size={18}/> Produtos e estoque</button>
          <button className={tab==='pos'?'active':''} onClick={()=>nav('pos')}><ShoppingCart size={18}/> PDV · Ponto de venda</button>
          <button className={tab==='brands'?'active':''} onClick={()=>nav('brands')}><Tags size={18}/> Marcas</button>
          <button className={tab==='suppliers'?'active':''} onClick={()=>nav('suppliers')}><Truck size={18}/> Fornecedores</button>
          <button className={tab==='sales'?'active':''} onClick={()=>nav('sales')}><ShoppingCart size={18}/> Vendas e pedidos</button>
          <button className={tab==='payouts'?'active':''} onClick={()=>nav('payouts')}><Wallet size={18}/> Comissões e repasses</button>
        </div>
      </nav>
      <div className="company-user"><b>{email}</b><small>Perfil: {role}</small><button onClick={onSignOut}><LogOut size={15}/> Sair</button></div>
    </aside>
    <main className="company-main">
      <div className="company-mobilebar"><div><b>EPARTS</b><small>{companyName}</small></div></div>
      <header className="company-top"><div><small>PLATAFORMA DE COMÉRCIO</small><h1>{tab==='dashboard'?'Dashboard Eparts':tab==='products'?'Produtos e estoque':tab==='brands'?'Marcas':tab==='suppliers'?'Fornecedores':tab==='sales'?'Vendas e pedidos':tab==='pos'?'PDV · Ponto de venda':'Comissões e repasses'}</h1></div><div style={{display:'flex',gap:10,alignItems:'center'}}><a href={`${window.location.origin}/?catalogo=eparts`} target="_blank" rel="noreferrer" className="company-secondary" style={{textDecoration:'none',display:'inline-flex',alignItems:'center',gap:7}}><ExternalLink size={15}/> Abrir catálogo online</a><button className="company-icon-button" onClick={()=>void load()} title="Atualizar"><RefreshCw size={16}/></button></div></header>
      {error&&<div className="company-error-banner">{error}</div>}
      {tab==='pos'?<EpartsPOS companyId={companyId}/>:tab==='dashboard'?<section className="company-panel">
        <div className="company-panel-head"><div><b>Visão geral da operação</b><small>Indicadores da Eparts, sem módulos de assistência técnica</small></div><button className="company-secondary" onClick={()=>void load()} disabled={loading}><RefreshCw size={15}/> Atualizar</button></div>
        {loading?<p className="company-empty">Carregando indicadores...</p>:<div className="company-stats-grid">
          <article className="company-stat-card"><span>Produtos cadastrados</span><strong>{stats.products}</strong></article>
          <article className="company-stat-card"><span>Unidades em estoque</span><strong>{stats.stock}</strong></article>
          <article className="company-stat-card"><span>Fornecedores</span><strong>{stats.suppliers}</strong></article>
          <article className="company-stat-card"><span>Pedidos</span><strong>{stats.orders}</strong></article>
          <article className="company-stat-card"><span>Valor dos pedidos ativos</span><strong>{money(stats.revenue)}</strong></article>
          <article className="company-stat-card"><span>Comissão prevista em pedidos ativos</span><strong>{money(stats.commission)}</strong></article>
        </div>}
        <div className="company-inline-actions"><button className="company-primary" onClick={()=>nav('products')}><Package size={16}/> Abrir gestão comercial</button></div>
      </section>:<EpartsCatalogAdminPanel key={tab} companyId={companyId} initialTab={tab}/>}
      <footer className="company-footer">Painel exclusivo Eparts · acesso isolado por empresa</footer>
    </main>
  </div>
}
