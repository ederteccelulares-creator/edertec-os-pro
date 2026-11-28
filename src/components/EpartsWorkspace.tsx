import { useCallback, useEffect, useState } from 'react'
import { LayoutDashboard, Package, Boxes, Tags, Truck, ShoppingCart, Wallet, Users, LogOut, RefreshCw, ExternalLink, Menu, X, ChevronRight, Store, BarChart3, FileText, Zap } from 'lucide-react'
import { supabase } from '../lib/supabase'
import EpartsCatalogAdminPanel from './EpartsCatalogAdminPanel'
import EpartsPOS from './EpartsPOS'
import EpartsRegistrations from './EpartsRegistrations'

type Props = { companyId:string; companyName:string; email:string; role:string; onSignOut:()=>void }
type Tab = 'dashboard'|'products'|'brands'|'suppliers'|'customers'|'categories'|'sales'|'payouts'|'pos'
const money=(n:number)=>Number(n||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})

export default function EpartsWorkspace({companyId,companyName,email,role,onSignOut}:Props) {
  const [tab,setTab]=useState<Tab>('dashboard')
  const [quickCreate,setQuickCreate]=useState<'customers'|'suppliers'|'brands'|'categories'|null>(null)
  const [createVersion,setCreateVersion]=useState(0)
  const quickAdd=(target:'customers'|'suppliers'|'brands'|'categories')=>{setMenuOpen(false);setQuickCreate(target);setTab(target);setCreateVersion(v=>v+1)}
  const [menuOpen,setMenuOpen]=useState(false)
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
  useEffect(()=>{
    const main=document.querySelector('.eparts-workspace .company-main')
    if(main instanceof HTMLElement)main.scrollTo({top:0,left:0,behavior:'auto'})
    if(window.innerWidth<=760)window.scrollTo({top:0,left:0,behavior:'auto'})
    setMenuOpen(false)
  },[tab])
  const nav=(value:Tab)=>{setMenuOpen(false);setQuickCreate(null);setTab(value)}
  const title=menuOpen?'Menu':tab==='dashboard'?'Visão geral':tab==='products'?'Produtos e estoque':tab==='brands'?'Marcas':tab==='suppliers'?'Fornecedores':tab==='customers'?'Clientes':tab==='categories'?'Categorias':tab==='sales'?'Vendas e pedidos':tab==='pos'?'Ponto de venda':'Comissões e repasses'
  const navItems=[
    {section:'INÍCIO',items:[{id:'dashboard' as Tab,label:'Visão geral',icon:LayoutDashboard}]},
    {section:'VENDAS',items:[{id:'pos' as Tab,label:'PDV · Ponto de venda',icon:ShoppingCart},{id:'sales' as Tab,label:'Vendas e pedidos',icon:BarChart3}]},
    {section:'PRODUTOS',items:[{id:'products' as Tab,label:'Produtos e estoque',icon:Package},{id:'brands' as Tab,label:'Marcas',icon:Tags},{id:'categories' as Tab,label:'Categorias',icon:Boxes}]},
    {section:'RELACIONAMENTO',items:[{id:'customers' as Tab,label:'Clientes',icon:Users},{id:'suppliers' as Tab,label:'Fornecedores',icon:Truck}]},
    {section:'FINANCEIRO',items:[{id:'payouts' as Tab,label:'Comissões e repasses',icon:Wallet}]},
    {section:'CADASTRO RÁPIDO',items:[]},
    {section:'CATÁLOGO ONLINE',items:[]},
    {section:'PORTAL DO FORNECEDOR',items:[]}
  ]
  return <div className="company-app eparts-workspace">
    <style>{`
      .eparts-workspace{--ep-gold:#ed142c;--ep-gold-light:#ff9aa5;--ep-muted:#9c927f;background:#0b0b0c;color:#f4f0e8;min-height:100vh}
      .eparts-workspace .company-sidebar{position:sticky;top:0;height:100vh;overflow-y:auto;width:278px;padding:25px 18px 18px;background:linear-gradient(180deg,#171411 0%,#100f0e 48%,#0c0c0c 100%);border-right:1px solid rgba(216,179,106,.2);box-shadow:12px 0 35px rgba(0,0,0,.18)}
      .eparts-workspace .eparts-brand-row{display:flex;align-items:center;justify-content:space-between;margin-bottom:26px}
      .eparts-workspace .company-logo{gap:12px;padding:0 5px}
      .eparts-workspace .company-logo>span{width:44px;height:44px;background:linear-gradient(145deg,#ff6878,#a90019);color:#17120a;border-radius:13px;box-shadow:0 8px 24px rgba(190,143,54,.2)}
      .eparts-workspace .company-logo b{font-size:19px;letter-spacing:2.5px;color:#ffb5bd}
      .eparts-workspace .company-logo small{font-size:8px;letter-spacing:1.3px;color:#a99a7e}
      .eparts-workspace .eparts-company-chip{display:flex;align-items:center;gap:9px;padding:12px 13px;margin-bottom:25px;border:1px solid rgba(216,179,106,.2);background:rgba(216,179,106,.055);border-radius:12px;color:#ffd0d5;font-size:12px;line-height:1.4}
      .eparts-workspace .eparts-company-chip svg{color:var(--ep-gold);flex:none}
      .eparts-workspace .company-sidebar nav{display:grid;gap:20px;margin:0}
      .eparts-workspace .company-nav-section{display:grid;gap:6px}
      .eparts-workspace .company-nav-section-label{padding:0 11px 5px;color:#827764;letter-spacing:1.5px;font-size:9px;font-weight:800}
      .eparts-workspace .company-sidebar nav button{width:100%;min-height:44px;padding:10px 12px;gap:12px;border:1px solid transparent;border-radius:10px;color:#b8b0a3;font-size:12px;font-weight:550;transition:all .18s ease}
      .eparts-workspace .company-sidebar nav button svg{color:#9c8c6c;flex:none}
      .eparts-workspace .company-sidebar nav button:hover{background:rgba(255,255,255,.045);color:#fff}
      .eparts-workspace .company-sidebar nav button.active{background:linear-gradient(100deg,rgba(216,179,106,.19),rgba(216,179,106,.055));border-color:rgba(216,179,106,.2);color:#ffb5bd;box-shadow:inset 3px 0 #ed142c}
      .eparts-workspace .company-sidebar nav button.active svg{color:#ff8793}
      .eparts-workspace .eparts-nav-arrow{margin-left:auto;opacity:.7}
      .eparts-workspace .company-sidebar nav .eparts-nav-link{display:flex;align-items:center;gap:12px;width:100%;min-height:44px;padding:10px 12px;border:1px solid rgba(216,179,106,.18);border-radius:10px;background:rgba(216,179,106,.06);color:#ffd0d5;text-decoration:none;font-size:12px;font-weight:650}
      .eparts-workspace .company-sidebar nav .eparts-nav-link svg{color:#ed142c;flex:none}
      .eparts-workspace .company-sidebar nav .eparts-nav-link:hover{background:rgba(216,179,106,.13);border-color:rgba(216,179,106,.38)}
      @media(max-width:760px){
        .eparts-workspace>.company-sidebar nav .eparts-nav-link{display:flex!important;align-items:center!important;min-height:46px!important;padding:9px 10px!important;border:1px solid #8f1524!important;border-radius:10px!important;background:linear-gradient(120deg,#302415,#17130e)!important;color:#ffb5bd!important;font-size:12px!important;text-decoration:none!important}
        .eparts-workspace>.company-sidebar nav .eparts-nav-link svg{color:#ff6878!important}
      }
      .eparts-workspace .company-user{margin-top:auto;padding:16px 5px 0;border-top:1px solid rgba(216,179,106,.15)}
      .eparts-workspace .eparts-user-meta{display:flex;align-items:center;gap:10px;min-width:0}
      .eparts-workspace .eparts-user-avatar{width:34px;height:34px;display:grid;place-items:center;flex:none;border-radius:50%;background:#292117;color:#ff6878;border:1px solid rgba(216,179,106,.25)}
      .eparts-workspace .company-user b{font-size:11px;color:#e9e1d2;overflow-wrap:anywhere}
      .eparts-workspace .company-user small{font-size:10px;color:#8f8779}
      .eparts-workspace .company-user button{margin:13px 0 0;padding:8px 4px;color:#b5a995;font-size:11px}
      .eparts-workspace .company-user button:hover{color:#f1c6c6}
      .eparts-workspace .company-main{padding:32px clamp(18px,3vw,42px);max-width:none;width:auto;min-height:100vh;background:radial-gradient(ellipse at 85% 0%,rgba(142,103,39,.075),transparent 34%),#0b0b0c}
      .eparts-workspace .company-top{padding:0 0 22px;margin-bottom:25px;border-bottom:1px solid rgba(216,179,106,.14)}
      .eparts-workspace .company-top small{color:#a08d68;letter-spacing:1.8px;font-size:9px;font-weight:800}
      .eparts-workspace .company-top h1{margin:7px 0 0;color:#f5efe4;font-size:clamp(24px,2.3vw,31px);letter-spacing:-.8px;font-weight:700}
      .eparts-workspace .eparts-header-actions{display:flex;align-items:center;gap:9px}
      .eparts-workspace .company-secondary{border-color:rgba(216,179,106,.25);background:rgba(216,179,106,.045);color:#e5d3ad;border-radius:10px;font-size:11px}
      .eparts-workspace .company-icon-button{border-color:rgba(216,179,106,.22);background:#191612;color:#ff6878;border-radius:10px}
      .eparts-workspace .company-panel{border:1px solid rgba(216,179,106,.16);background:linear-gradient(145deg,rgba(27,24,20,.96),rgba(17,16,15,.98));border-radius:16px;box-shadow:0 18px 50px rgba(0,0,0,.2)}
      .eparts-workspace .company-panel-head b{color:#f0e7d7}
      .eparts-workspace .company-panel-head small{color:#9e9587}
      .eparts-workspace .company-stats-grid{gap:14px}
      .eparts-workspace .company-stat-card{min-width:0;padding:19px;border:1px solid rgba(216,179,106,.16);border-radius:14px;background:linear-gradient(145deg,rgba(43,35,25,.72),rgba(21,19,17,.98));transition:transform .18s ease,border-color .18s ease}
      .eparts-workspace .company-stat-card:hover{transform:translateY(-2px);border-color:rgba(216,179,106,.35)}
      .eparts-workspace .company-stat-card span{color:#b9ad98;font-size:11px;line-height:1.45}
      .eparts-workspace .company-stat-card strong{display:block;margin-top:8px;color:#ff8793;font-size:clamp(22px,2.2vw,29px);letter-spacing:-.5px;overflow-wrap:anywhere}
      .eparts-workspace .company-footer{padding:22px 3px;color:#746d61;font-size:10px}
      .eparts-workspace .eparts-mobile-menu-button{display:none}
      @media(max-width:900px){.eparts-workspace .company-sidebar{width:250px}.eparts-workspace .company-main{padding:25px 20px}}
      @media(max-width:760px){
        .eparts-workspace{display:block}
        .eparts-workspace .company-sidebar{position:relative;z-index:20;top:auto;width:100%;height:auto;overflow:visible;padding:13px 15px 0;border-right:0;border-bottom:1px solid rgba(216,179,106,.2);box-shadow:0 8px 28px rgba(0,0,0,.28)}
        .eparts-workspace .eparts-brand-row{margin:0;padding-bottom:12px}
        .eparts-workspace .company-logo{padding:0}
        .eparts-workspace .company-logo>span{width:38px;height:38px}
        .eparts-workspace .company-logo b{font-size:16px}
        .eparts-workspace .company-logo small{font-size:7px}
        .eparts-workspace .eparts-mobile-menu-button{display:inline-flex;align-items:center;justify-content:center;width:40px;height:40px;border:1px solid rgba(216,179,106,.24);border-radius:10px;background:#211b12;color:#ff6878}
        .eparts-workspace .eparts-company-chip{display:none}
        .eparts-workspace .company-sidebar nav{display:grid;gap:14px;margin:0;padding:4px 0 15px}
        .eparts-workspace .eparts-nav-closed{display:none!important}
        .eparts-workspace .company-sidebar nav button{min-height:42px;font-size:12px}
        .eparts-workspace .company-user{display:flex;align-items:center;justify-content:space-between;margin:0;padding:11px 2px;border-top:1px solid rgba(216,179,106,.13)}
        .eparts-workspace .eparts-user-meta{min-width:0}
        .eparts-workspace .company-user b{max-width:220px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .eparts-workspace .company-user small{display:block}
        .eparts-workspace .company-user button{margin:0;padding:8px}
        .eparts-workspace .company-main{min-height:calc(100vh - 90px);padding:22px 14px;background:#0b0b0c}
        .eparts-workspace .company-top{align-items:flex-start;flex-direction:column;gap:14px;padding-bottom:17px;margin-bottom:18px}
        .eparts-workspace .company-top h1{font-size:24px}
        .eparts-workspace .eparts-header-actions{width:100%;justify-content:space-between}
        .eparts-workspace .company-panel{padding:15px}
        .eparts-workspace .company-stats-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}
        .eparts-workspace .company-stat-card{padding:13px}
        .eparts-workspace .company-stat-card strong{font-size:21px}
      }
      /* EPARTS mobile shell: header and drawer must remain visible above legacy company CSS */
      @media(max-width:760px){
        .eparts-workspace{display:block!important;min-height:100dvh!important;background:#090909!important}
        .eparts-workspace>.company-sidebar{display:block!important;position:sticky!important;top:0!important;z-index:300!important;width:100%!important;height:auto!important;max-height:none!important;overflow:visible!important;padding:10px 14px 0!important;background:linear-gradient(105deg,#090909,#17120d 55%,#090909)!important;border:0!important;border-bottom:1px solid #a90019!important;box-shadow:0 8px 25px #000b!important;transform:none!important}
        .eparts-workspace .eparts-brand-row{display:flex!important;min-height:54px!important;align-items:center!important;justify-content:space-between!important;margin:0!important;padding:0 0 9px!important}
        .eparts-workspace .company-logo{display:flex!important;align-items:center!important;gap:10px!important}
        .eparts-workspace .company-logo>span{display:grid!important;place-items:center!important;width:42px!important;height:42px!important;border:1px solid #ed142c!important;background:linear-gradient(145deg,#1b1710,#090909)!important;color:#ff6878!important;border-radius:11px!important}
        .eparts-workspace .company-logo b{font-size:18px!important;letter-spacing:2px!important;color:#fff!important}
        .eparts-workspace .company-logo small{font-size:8px!important;letter-spacing:1px!important;color:#ff9aa5!important}
        .eparts-workspace .eparts-mobile-menu-button{display:inline-flex!important;align-items:center!important;justify-content:center!important;width:42px!important;height:42px!important;border:1px solid #a90019!important;border-radius:10px!important;background:#17130d!important;color:#fff!important}
        .eparts-workspace .eparts-company-chip{display:none!important}
        .eparts-workspace>.company-sidebar nav{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:8px!important;padding:9px 0 13px!important;margin:0!important;max-height: min(62dvh,480px)!important;overflow:auto!important}
        .eparts-workspace>.company-sidebar nav.eparts-nav-closed{display:none!important}
        .eparts-workspace .company-nav-section{display:contents!important}
        .eparts-workspace .company-nav-section-label{display:none!important}
        .eparts-workspace>.company-sidebar nav button{display:flex!important;align-items:center!important;justify-content:flex-start!important;min-width:0!important;min-height:46px!important;padding:9px 10px!important;border:1px solid #383027!important;border-radius:10px!important;background:linear-gradient(120deg,#1b1916,#111)!important;color:#e6dfd2!important;font-size:12px!important;white-space:normal!important}
        .eparts-workspace>.company-sidebar nav button.active{border-color:#ed142c!important;background:linear-gradient(110deg,#6f1020,#21180c)!important;color:#ffe3a4!important;box-shadow:inset 3px 0 #ff6878!important}
        .eparts-workspace .company-user{display:flex!important;align-items:center!important;justify-content:space-between!important;gap:8px!important;margin:0!important;padding:9px 2px!important;border-top:1px solid #3c3020!important}
        .eparts-workspace .eparts-user-meta{display:flex!important;min-width:0!important}
        .eparts-workspace .company-user b{display:block!important;max-width:210px!important;overflow:hidden!important;text-overflow:ellipsis!important;white-space:nowrap!important}
        .eparts-workspace .company-user small{display:block!important}
        .eparts-workspace .company-user button{display:flex!important;align-items:center!important;gap:5px!important;margin:0!important;padding:7px!important;font-size:10px!important}
        .eparts-workspace>.company-main{display:block!important;width:100%!important;max-width:none!important;min-width:0!important;min-height:calc(100dvh - 70px)!important;padding:18px 13px calc(28px + env(safe-area-inset-bottom))!important;background:radial-gradient(ellipse at 50% 0%,#4c351322,transparent 40%),#090909!important}
        .eparts-workspace .company-top{display:flex!important;align-items:center!important;justify-content:space-between!important;gap:10px!important;padding:4px 1px 15px!important;margin:0 0 15px!important;border-bottom:1px solid #6f1020!important}
        .eparts-workspace .company-top>div:first-child{min-width:0!important}
        .eparts-workspace .company-top small{font-size:8px!important;letter-spacing:1.5px!important;color:#ff8793!important}
        .eparts-workspace .company-top h1{font-size:clamp(21px,6vw,27px)!important;line-height:1.15!important;color:#f4d797!important}
        .eparts-workspace .eparts-header-actions{display:flex!important;align-items:center!important;gap:7px!important;width:auto!important;flex:none!important}
        .eparts-workspace .eparts-header-actions>a{padding:9px!important;font-size:10px!important}
        .eparts-workspace .company-icon-button{width:40px!important;height:40px!important;min-width:40px!important}
        .eparts-workspace .company-panel{padding:14px!important;margin:0 0 14px!important;border:1px solid #6f1020!important;border-radius:14px!important;background:linear-gradient(145deg,#1a1816,#101010)!important}
        .eparts-workspace .company-panel-head{display:flex!important;align-items:flex-start!important;justify-content:space-between!important;gap:9px!important;flex-wrap:wrap!important;padding-bottom:12px!important;margin-bottom:13px!important;border-bottom:1px solid #6f1020!important}
        .eparts-workspace .company-panel-head>div{min-width:0!important}
        .eparts-workspace .company-panel-head b{font-size:15px!important;color:#ffb5bd!important}
        .eparts-workspace .company-panel-head small{display:block!important;margin-top:4px!important;font-size:11px!important;line-height:1.4!important;color:#b8afa2!important}
        .eparts-workspace .company-panel-head>button{min-height:40px!important;padding:8px 12px!important}
        .eparts-workspace .company-stats-grid{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:9px!important}
        .eparts-workspace .company-stat-card{display:block!important;min-width:0!important;min-height:104px!important;padding:13px!important;border:1px solid #6f1020!important;border-radius:12px!important;background:linear-gradient(145deg,#262017,#141210)!important}
        .eparts-workspace .company-stat-card span{display:block!important;font-size:11px!important;color:#c4b79e!important}
        .eparts-workspace .company-stat-card strong{font-size:22px!important;color:#ff8793!important}
        .eparts-workspace .company-inline-actions{display:flex!important;flex-wrap:wrap!important;gap:8px!important;margin-top:14px!important}
        .eparts-workspace .company-inline-actions button{min-height:43px!important}
        .eparts-workspace .company-footer{padding:15px 2px!important;font-size:9px!important}
        .eparts-workspace .eparts-admin-panel .eparts-tabs{display:none!important}
        .eparts-workspace .eparts-admin-panel .eparts-list-head{display:flex!important;align-items:flex-start!important;gap:10px!important}
        .eparts-workspace .eparts-admin-panel .eparts-list-head>button{width:100%!important;min-height:46px!important;justify-content:center!important}
        .eparts-workspace .eparts-admin-panel .company-form{padding:12px!important;margin:12px 0!important;border-color:#8f1524!important;background:#13110e!important}
        .eparts-workspace .eparts-admin-panel .company-form-grid{display:grid!important;grid-template-columns:minmax(0,1fr)!important;gap:10px!important}
        .eparts-workspace .eparts-admin-panel .company-form input,.eparts-workspace .eparts-admin-panel .company-form select,.eparts-workspace .eparts-admin-panel .company-form textarea{min-height:43px!important;background:#090909!important;color:#fff!important;border:1px solid #6f1020!important;border-radius:9px!important;font-size:16px!important}
        .eparts-workspace .eparts-admin-panel .company-table-wrap{max-width:100%!important;overflow-x:auto!important}
        .eparts-workspace .eparts-admin-panel .company-table-wrap table{min-width:680px!important}
      }
      @media(max-width:380px){.eparts-workspace .company-stats-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important}.eparts-workspace .company-stat-card{padding:10px!important}.eparts-workspace .company-stat-card strong{font-size:19px!important}}
      .eparts-workspace .eparts-mobile-bottom-nav{display:none}
      @media(max-width:760px){
        .eparts-workspace .eparts-mobile-bottom-nav{position:fixed!important;z-index:100!important;left:10px!important;right:10px!important;bottom:calc(8px + env(safe-area-inset-bottom))!important;display:grid!important;grid-template-columns:repeat(5,minmax(0,1fr))!important;gap:3px!important;padding:7px 5px!important;border:1px solid #8f1524!important;border-radius:16px!important;background:rgba(15,13,11,.96)!important;box-shadow:0 8px 30px #000c,0 0 16px #ed142c22!important;backdrop-filter:blur(14px)!important}
        .eparts-workspace .eparts-mobile-bottom-nav button{display:flex!important;min-width:0!important;min-height:48px!important;flex-direction:column!important;align-items:center!important;justify-content:center!important;gap:4px!important;padding:4px 2px!important;border:1px solid transparent!important;border-radius:10px!important;background:transparent!important;color:#b9ad98!important;font-size:9px!important;font-weight:650!important}
        .eparts-workspace .eparts-mobile-bottom-nav button svg{color:#ed142c!important}
        .eparts-workspace .eparts-mobile-bottom-nav button.active{border-color:#9c762f!important;background:linear-gradient(145deg,#6f1020,#21190d)!important;color:#ffb5bd!important}
        .eparts-workspace .eparts-mobile-bottom-nav button.active svg{color:#ffda83!important}
        .eparts-workspace>.company-main{padding-bottom:calc(100px + env(safe-area-inset-bottom))!important}
      }
      @media(min-width:761px){
        .eparts-workspace>.company-sidebar{display:flex!important;flex-direction:column!important;flex:none!important}
        .eparts-workspace>.company-main{flex:1!important;min-width:0!important}
      }

      /* Header mobile EPARTS: compact, aligned and independent from legacy layout rules */
      @media(max-width:760px){
        .eparts-workspace{margin:0!important;padding:0!important;overflow-x:clip!important}
        .eparts-workspace>.company-sidebar{margin:0!important;inset:auto!important;transform:none!important}
        .eparts-workspace>.company-main{margin:0!important;padding-top:14px!important}
        .eparts-workspace .company-top{
          display:flex!important;flex-direction:column!important;align-items:stretch!important;
          justify-content:flex-start!important;gap:11px!important;
          padding:0 0 14px!important;margin:0 0 14px!important;
        }
        .eparts-workspace .company-top>div:first-child{width:100%!important}
        .eparts-workspace .company-top small{display:block!important;margin:0 0 5px!important}
        .eparts-workspace .company-top h1{margin:0!important;font-size:25px!important;line-height:1.12!important}
        .eparts-workspace .eparts-header-actions{
          width:100%!important;justify-content:flex-start!important;align-self:flex-start!important;
          gap:8px!important;margin:0!important;
        }
        .eparts-workspace .eparts-header-actions>a{
          min-height:39px!important;padding:8px 12px!important;border-radius:10px!important;
          font-size:11px!important;white-space:nowrap!important;
        }
        .eparts-workspace .eparts-header-actions>.company-icon-button{
          width:39px!important;height:39px!important;min-width:39px!important;
        }
      }


      /* Mobile hamburger as a true floating drawer */
      @media(max-width:760px){
        .eparts-workspace>.company-sidebar nav:not(.eparts-nav-closed){
          position:fixed!important;top:76px!important;left:12px!important;right:12px!important;z-index:310!important;
          display:grid!important;grid-template-columns:minmax(0,1fr)!important;gap:13px!important;max-height:calc(100dvh - 96px)!important;overflow-y:auto!important;
          padding:16px!important;border:1px solid #8f1524!important;border-radius:16px!important;
          background:linear-gradient(155deg,#171410 0%,#0d0c0b 72%)!important;
          box-shadow:0 22px 65px #000e,0 0 0 100vmax #0009!important;
          overscroll-behavior:contain!important;
        }
        .eparts-workspace>.company-sidebar nav:not(.eparts-nav-closed) .company-nav-section{gap:5px!important}
        .eparts-workspace>.company-sidebar nav:not(.eparts-nav-closed) .company-nav-section-label{
          padding:8px 9px 4px!important;color:#ff6878!important;font-size:9px!important;letter-spacing:1.35px!important
        }
        .eparts-workspace>.company-sidebar nav:not(.eparts-nav-closed) button,
        .eparts-workspace>.company-sidebar nav:not(.eparts-nav-closed) .eparts-nav-link{
          min-height:43px!important;border-radius:9px!important;padding:9px 11px!important
        }
        .eparts-workspace>.company-sidebar nav:not(.eparts-nav-closed) .company-nav-section+.company-nav-section{
          padding-top:8px!important;border-top:1px solid #3b3020!important
        }
      }
      /* Dashboard final visual layout */
      .eparts-workspace .eparts-dashboard{display:grid!important;gap:16px!important}
      .eparts-workspace .eparts-overview-panel{margin:0!important}
      .eparts-workspace .eparts-overview-panel .company-panel-head{align-items:center!important}
      .eparts-workspace .eparts-overview-panel .company-panel-head>div{min-width:0!important}
      .eparts-workspace .eparts-overview-panel .company-stats-grid{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:12px!important;margin-top:18px!important}
      .eparts-workspace .eparts-overview-panel .company-stat-card{min-height:112px!important;padding:17px!important;border:1px solid #6f1020!important;border-radius:13px!important;background:linear-gradient(145deg,#1c1a16,#121110)!important}
      .eparts-workspace .eparts-overview-panel .company-stat-card span{display:block!important;font-size:12px!important;line-height:1.4!important;color:#bcb09b!important}
      .eparts-workspace .eparts-overview-panel .company-stat-card strong{display:block!important;margin-top:12px!important;font-size:27px!important;line-height:1.1!important;color:#f0cf83!important;overflow-wrap:anywhere!important}
      .eparts-workspace .eparts-quick-panel{margin:0!important}
      .eparts-workspace .eparts-quick-grid{display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr))!important;gap:12px!important;margin-top:15px!important}
      .eparts-workspace .eparts-quick-grid button{display:flex!important;min-width:0!important;min-height:112px!important;flex-direction:column!important;align-items:center!important;justify-content:center!important;gap:7px!important;padding:13px 8px!important;border:1px solid #6f1020!important;border-radius:13px!important;background:linear-gradient(145deg,#211c13,#131210)!important;color:#ffd0d5!important}
      .eparts-workspace .eparts-quick-grid button svg{color:#ff8793!important}
      .eparts-workspace .eparts-quick-grid button b{font-size:13px!important;color:#f5ead5!important}
      .eparts-workspace .eparts-quick-grid button small{font-size:10px!important;color:#a99d89!important;text-align:center!important}
      .eparts-workspace .eparts-quick-grid button:hover{border-color:#a90019!important;background:#292115!important}
      @media(max-width:760px){
        .eparts-workspace .eparts-dashboard{gap:13px!important}
        .eparts-workspace .eparts-overview-panel .company-panel-head{align-items:stretch!important;flex-direction:column!important}
        .eparts-workspace .eparts-overview-panel .company-panel-head>button{width:100%!important;min-height:42px!important;justify-content:center!important}
        .eparts-workspace .eparts-overview-panel .company-stats-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:9px!important;margin-top:13px!important}
        .eparts-workspace .eparts-overview-panel .company-stat-card{min-height:98px!important;padding:13px!important}
        .eparts-workspace .eparts-overview-panel .company-stat-card span{font-size:11px!important}
        .eparts-workspace .eparts-overview-panel .company-stat-card strong{font-size:23px!important;margin-top:9px!important}
        .eparts-workspace .eparts-quick-grid{gap:8px!important}
        .eparts-workspace .eparts-quick-grid button{min-height:94px!important;padding:10px 5px!important}
        .eparts-workspace .eparts-quick-grid button svg{width:23px!important;height:23px!important}
      }
      @media(max-width:380px){.eparts-workspace .eparts-quick-grid{grid-template-columns:1fr!important}.eparts-workspace .eparts-quick-grid button{min-height:72px!important;flex-direction:row!important;justify-content:flex-start!important;padding:12px 15px!important}.eparts-workspace .eparts-quick-grid button small{margin-left:auto!important}}
      /* EPARTS visual polish: presentation only */
      .eparts-workspace{font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif!important;letter-spacing:0!important}
      .eparts-workspace .company-main{max-width:1600px!important;margin-inline:auto!important}
      .eparts-workspace .company-top{align-items:center!important;gap:18px!important}
      .eparts-workspace .company-top h1{font-weight:650!important;letter-spacing:-.045em!important}
      .eparts-workspace .company-top small{font-weight:700!important}
      .eparts-workspace .eparts-header-actions{flex-wrap:wrap!important;justify-content:flex-end!important}
      .eparts-workspace button,.eparts-workspace a{transition:background .18s ease,border-color .18s ease,color .18s ease,transform .18s ease!important}
      .eparts-workspace .company-primary{border:1px solid #ed142c!important;border-radius:10px!important;background:linear-gradient(135deg,#ed142c,#a87932)!important;color:#17120a!important;font-weight:750!important;box-shadow:0 5px 16px #a9001922!important}
      .eparts-workspace .company-primary:hover{filter:brightness(1.08)!important;transform:translateY(-1px)!important}
      .eparts-workspace .company-secondary{border:1px solid #6f1020!important;border-radius:10px!important;background:#191714!important;color:#ffd0d5!important}
      .eparts-workspace .company-secondary:hover{border-color:#a90019!important;background:#242017!important;color:#ffe3a4!important}
      .eparts-workspace .company-panel{padding:22px!important;border-color:#393126!important;border-radius:17px!important;background:linear-gradient(145deg,#171614,#10100f)!important;box-shadow:0 12px 34px #0005!important}
      .eparts-workspace .company-panel-head{gap:14px!important}
      .eparts-workspace .company-panel-head b{font-size:15px!important;font-weight:700!important;letter-spacing:-.01em!important}
      .eparts-workspace .company-panel-head small{line-height:1.55!important}
      .eparts-workspace .company-stat-card{border-color:#403522!important;background:linear-gradient(145deg,#211d16,#141311)!important;box-shadow:inset 0 1px #ffffff08!important}
      .eparts-workspace .company-stat-card span{font-weight:550!important;color:#bdb19c!important}
      .eparts-workspace .company-stat-card strong{font-weight:750!important}
      .eparts-workspace .company-form{display:grid!important;gap:15px!important;padding:20px!important;border:1px solid #6f1020!important;border-radius:14px!important;background:#141311!important}
      .eparts-workspace .company-form label{display:grid!important;gap:7px!important;color:#ffd0d5!important;font-size:12px!important;font-weight:650!important}
      .eparts-workspace .company-form input,.eparts-workspace .company-form select,.eparts-workspace .company-form textarea,.eparts-workspace select,.eparts-workspace input:not([type=checkbox]){min-height:42px!important;border:1px solid #494033!important;border-radius:9px!important;background:#0d0d0c!important;color:#f6f0e5!important;padding:10px 12px!important;outline:none!important}
      .eparts-workspace .company-form input:focus,.eparts-workspace .company-form select:focus,.eparts-workspace .company-form textarea:focus,.eparts-workspace select:focus,.eparts-workspace input:focus{border-color:#a90019!important;box-shadow:0 0 0 3px #a9001920!important}
      .eparts-workspace .company-form textarea{min-height:82px!important;resize:vertical!important}
      .eparts-workspace .company-form-grid{gap:14px!important}
      .eparts-workspace .company-form-actions{display:flex!important;justify-content:flex-end!important;flex-wrap:wrap!important;gap:9px!important;padding-top:8px!important;border-top:1px solid #332d24!important}
      .eparts-workspace .company-table-wrap{overflow:auto!important;border:1px solid #393126!important;border-radius:12px!important;background:#11100f!important}
      .eparts-workspace table{width:100%!important;border-collapse:separate!important;border-spacing:0!important}
      .eparts-workspace table th{padding:13px 14px!important;background:#1d1913!important;color:#ff9aa5!important;font-size:10px!important;font-weight:800!important;letter-spacing:.08em!important;white-space:nowrap!important;border-bottom:1px solid #493a25!important}
      .eparts-workspace table td{padding:13px 14px!important;border-bottom:1px solid #29251f!important;color:#ded7ca!important;font-size:12px!important;vertical-align:middle!important}
      .eparts-workspace table tr:last-child td{border-bottom:0!important}
      .eparts-workspace table tbody tr:hover td{background:#ffffff06!important}
      .eparts-workspace table td b{color:#ffd0d5!important}
      .eparts-workspace table td small{display:block!important;margin-top:4px!important;color:#958b7b!important}
      .eparts-workspace .company-empty{padding:24px!important;border:1px dashed #6f1020!important;border-radius:12px!important;background:#141311!important;color:#bdb19c!important;text-align:center!important}
      .eparts-workspace .company-error-banner,.eparts-workspace .company-success-banner{border-radius:10px!important;padding:12px 14px!important}
      @media(max-width:760px){
        .eparts-workspace .company-main{padding-left:13px!important;padding-right:13px!important}
        .eparts-workspace .company-top{align-items:stretch!important}
        .eparts-workspace .eparts-header-actions{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr)) auto!important;justify-content:stretch!important;gap:7px!important}
        .eparts-workspace .eparts-header-actions>a,.eparts-workspace .eparts-header-actions>button{min-width:0!important;justify-content:center!important}
        .eparts-workspace .company-panel{padding:14px!important;border-radius:14px!important}
        .eparts-workspace .company-form{padding:13px!important;gap:12px!important}
        .eparts-workspace .company-form-grid{grid-template-columns:minmax(0,1fr)!important;gap:11px!important}
        .eparts-workspace .company-form-actions{display:grid!important;grid-template-columns:1fr 1fr!important}
        .eparts-workspace .company-form-actions button{min-height:43px!important}
        .eparts-workspace table th,.eparts-workspace table td{padding:11px 10px!important}
      }


      /* Mobile drawer outside sticky sidebar: avoids iOS Safari clipping */
      .eparts-workspace .eparts-mobile-drawer-backdrop{display:none}
      @media(max-width:760px){
        .eparts-workspace>.company-sidebar>nav{display:none!important}
        .eparts-workspace .eparts-mobile-drawer-backdrop{display:block!important;position:fixed!important;inset:0!important;z-index:9998!important;background:rgba(0,0,0,.72)!important;backdrop-filter:blur(3px)!important}
        .eparts-workspace .eparts-mobile-drawer{position:absolute!important;top:max(12px,env(safe-area-inset-top))!important;left:12px!important;right:12px!important;max-height:calc(100dvh - 24px - env(safe-area-inset-bottom))!important;overflow-y:auto!important;display:grid!important;grid-template-columns:minmax(0,1fr)!important;gap:12px!important;padding:17px!important;border:1px solid #8a6935!important;border-radius:16px!important;background:linear-gradient(155deg,#1c1812,#090909 78%)!important;box-shadow:0 22px 65px #000e!important;overscroll-behavior:contain!important}
        .eparts-workspace .eparts-mobile-drawer .company-nav-section{display:grid!important;gap:6px!important;padding-top:9px!important;border-top:1px solid #3b3020!important}
        .eparts-workspace .eparts-mobile-drawer .company-nav-section:first-child{padding-top:0!important;border-top:0!important}
        .eparts-workspace .eparts-mobile-drawer .company-nav-section-label{display:block!important;padding:3px 8px!important;color:#ff6878!important;font-size:9px!important;letter-spacing:1.35px!important;font-weight:800!important}
        .eparts-workspace .eparts-mobile-drawer button,.eparts-workspace .eparts-mobile-drawer .eparts-nav-link{display:flex!important;align-items:center!important;gap:12px!important;width:100%!important;min-height:46px!important;padding:10px 12px!important;border:1px solid #6f1020!important;border-radius:10px!important;background:#171512!important;color:#ffd0d5!important;font-size:13px!important;text-decoration:none!important;text-align:left!important}
        .eparts-workspace .eparts-mobile-drawer button.active{border-color:#ed142c!important;background:#6f1020!important;color:#ffe3a4!important}
        .eparts-workspace .eparts-mobile-drawer svg{flex:none!important;color:#ff8793!important}
      }
      .eparts-workspace .eparts-menu-page{display:grid;gap:13px}
      .eparts-workspace .eparts-menu-group{margin:0!important}
      .eparts-workspace .eparts-menu-group .company-panel-head{margin-bottom:12px}
      .eparts-workspace .eparts-menu-group .company-panel-head b{color:#ff6878;font-size:11px;letter-spacing:1.4px}
      .eparts-workspace .eparts-menu-options{display:grid;gap:8px}
      .eparts-workspace .eparts-menu-options button,.eparts-workspace .eparts-menu-options a{display:flex;align-items:center;gap:12px;width:100%;min-height:49px;padding:12px;border:1px solid #6f1020;border-radius:10px;background:#171512;color:#ffd0d5;text-align:left;text-decoration:none;font-size:13px}
      .eparts-workspace .eparts-menu-options button>span,.eparts-workspace .eparts-menu-options a>span{flex:1}
      .eparts-workspace .eparts-menu-options button>svg:first-child,.eparts-workspace .eparts-menu-options a>svg:first-child{color:#ff8793}
      .eparts-workspace .eparts-menu-options button.active{border-color:#ed142c;background:#6f1020;color:#ffe3a4}
      .eparts-workspace .eparts-financial-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
      .eparts-workspace .eparts-financial-grid>div{min-width:0;padding:15px;border:1px solid #5a3037;border-radius:14px;background:linear-gradient(145deg,#201719,#0d0c0c);display:grid;gap:8px}
      .eparts-workspace .eparts-financial-grid svg{color:#ed142c}
      .eparts-workspace .eparts-financial-grid span{font-size:12px;color:#d0c6c7;line-height:1.35}
      .eparts-workspace .eparts-financial-grid strong{font-size:clamp(18px,2vw,25px);color:#fff;overflow-wrap:anywhere}
      .eparts-workspace .eparts-financial-grid .eparts-commission-value{color:#ff5364}
      .eparts-workspace .eparts-financial-grid .eparts-supplier-value{color:#78df8a}
      @media(max-width:760px){.eparts-workspace .eparts-financial-grid{grid-template-columns:1fr}.eparts-workspace .eparts-financial-grid>div{grid-template-columns:28px 1fr;align-items:center;gap:4px 10px;padding:12px}.eparts-workspace .eparts-financial-grid strong{grid-column:2;font-size:22px}}
      /* EPARTS visual direction approved: black / intense red / white */
      .eparts-workspace{--ep-gold:#ed142c!important;--ep-gold-light:#fff!important}
      .eparts-workspace .eparts-brand-row{position:relative}
      .eparts-workspace .eparts-brand-row:before{
        content:"";position:absolute;left:-18px;right:-18px;top:-25px;height:112px;z-index:-1;
        background:linear-gradient(115deg,#310008 0%,#080808 24%,#080808 76%,#310008 100%);
        border-bottom:1px solid #ed142c;box-shadow:0 5px 24px #ed142c22;
      }
      .eparts-workspace .company-logo>span{background:transparent!important;color:#ed142c!important;box-shadow:none!important;border:0!important}
      .eparts-workspace .company-logo b{font-size:23px!important;letter-spacing:2px!important;color:#fff!important;font-style:italic}
      .eparts-workspace .company-logo small{color:#fff!important;font-size:9px!important;letter-spacing:1.5px!important}
      .eparts-workspace .company-top small{color:#f0e9e9!important}
      .eparts-workspace .company-top h1{position:relative;padding-left:16px;color:#fff!important;font-size:clamp(27px,3vw,36px)!important}
      .eparts-workspace .company-top h1:before{content:"";position:absolute;left:0;top:3px;bottom:3px;width:5px;border-radius:5px;background:#ed142c;box-shadow:0 0 12px #ed142c}
      .eparts-workspace .company-secondary{background:linear-gradient(110deg,#ed142c,#990014)!important;border:1px solid #ff4052!important;color:#fff!important;box-shadow:0 0 16px #ed142c35!important}
      .eparts-workspace .company-icon-button{background:#100c0d!important;border:1px solid #ed142c!important;color:#fff!important}
      .eparts-workspace .company-panel{border:1px solid #8f2633!important;background:linear-gradient(145deg,#151112,#080808)!important;box-shadow:0 0 18px #ed142c12,inset 0 1px #ff405255!important}
      .eparts-workspace .company-panel-head b{color:#fff!important;font-size:19px!important}
      .eparts-workspace .company-panel-head:has(small):before{color:#ed142c}
      .eparts-workspace .company-panel-head>button{background:linear-gradient(110deg,#a90019,#43000b)!important;border:1px solid #ed142c!important;color:#fff!important;min-height:48px!important}
      .eparts-workspace .company-stat-card{
        position:relative;border:1px solid #8b2631!important;border-radius:18px!important;
        background:radial-gradient(ellipse at 100% 100%,#65000e55,transparent 55%),linear-gradient(145deg,#211719,#090909)!important;
        box-shadow:inset 0 0 18px #ed142c0c!important;
      }
      .eparts-workspace .company-stat-card strong{color:#fff!important;font-size:30px!important}
      .eparts-workspace .company-stat-card span{color:#f0e9e9!important}
      .eparts-workspace .eparts-mobile-bottom-nav{
        border:1px solid #ed142c!important;background:rgba(5,5,5,.97)!important;
        box-shadow:0 0 18px #ed142c35!important;
      }
      .eparts-workspace .eparts-mobile-bottom-nav button{color:#fff!important}
      .eparts-workspace .eparts-mobile-bottom-nav button svg{color:#fff!important}
      .eparts-workspace .eparts-mobile-bottom-nav button.active{
        border:1px solid #ff4052!important;background:linear-gradient(145deg,#ed142c,#71000e)!important;
        color:#fff!important;box-shadow:0 0 14px #ed142c55!important;
      }
      .eparts-workspace .eparts-mobile-bottom-nav button.active svg{color:#fff!important}
      .eparts-workspace .eparts-quick-grid button{border:1px solid #8b2631!important;background:#171012!important;color:#fff!important}
      .eparts-workspace .eparts-quick-grid button svg{color:#ed142c!important}
      @media(max-width:760px){
        .eparts-workspace .company-sidebar{padding-top:16px!important}
        .eparts-workspace .eparts-brand-row{justify-content:center!important;min-height:74px!important;padding-bottom:12px!important}
        .eparts-workspace .eparts-brand-row:before{left:-15px!important;right:-15px!important;top:-16px!important;height:88px!important}
        .eparts-workspace .company-logo>span{width:48px!important;height:48px!important}
        .eparts-workspace .company-logo b{font-size:27px!important}
        .eparts-workspace .company-logo small{font-size:9px!important}
        .eparts-workspace .eparts-mobile-menu-button{position:absolute!important;right:0!important;top:5px!important}
        .eparts-workspace .company-top{gap:14px!important}
        .eparts-workspace .company-top h1{font-size:30px!important}
        .eparts-workspace .eparts-header-actions{display:flex!important;justify-content:space-between!important}
        .eparts-workspace .eparts-header-actions>a{min-height:50px!important;flex:1!important;background:linear-gradient(110deg,#ed142c,#990014)!important;color:#fff!important;border:1px solid #ff4052!important;box-shadow:0 0 14px #ed142c35!important;font-size:14px!important}
        .eparts-workspace .eparts-header-actions>button{width:52px!important;height:50px!important;background:#100c0d!important;border:1px solid #ed142c!important;color:#fff!important}
        .eparts-workspace .company-panel{padding:16px!important;border-radius:19px!important}
        .eparts-workspace .company-panel-head{display:grid!important;grid-template-columns:1fr!important;gap:12px!important}
        .eparts-workspace .company-panel-head b{font-size:21px!important}
        .eparts-workspace .company-panel-head>button{width:100%!important;justify-content:center!important;min-height:52px!important;font-size:14px!important}
        .eparts-workspace .company-stats-grid{gap:10px!important}
        .eparts-workspace .company-stat-card{min-height:132px!important;padding:15px!important;border-radius:17px!important}
        .eparts-workspace .company-stat-card strong{font-size:28px!important}
        .eparts-workspace .eparts-mobile-bottom-nav{left:9px!important;right:9px!important;bottom:calc(8px + env(safe-area-inset-bottom))!important;padding:7px!important}
        .eparts-workspace .eparts-mobile-bottom-nav button{min-height:60px!important;font-size:11px!important}
      }
      /* Refinamento visual Edertec: vermelho consistente, menos dourado e menos brilho */
      .eparts-workspace{
        --ep-gold:#ed142c!important;--ep-gold-light:#ff6878!important;
        --ep-muted:#aaa!important;
      }
      .eparts-workspace .company-top small{color:#e45b68!important}
      .eparts-workspace .company-top h1{color:#f7f4f4!important}
      .eparts-workspace .company-secondary,
      .eparts-workspace .company-icon-button,
      .eparts-workspace .company-panel-head>button{
        border-color:#70202a!important;background:#211316!important;color:#ff6878!important;
      }
      .eparts-workspace .company-secondary:hover,
      .eparts-workspace .company-icon-button:hover,
      .eparts-workspace .company-panel-head>button:hover{
        border-color:#ed142c!important;background:#3a1018!important;color:#fff!important;
      }
      .eparts-workspace .company-panel{border-color:#49343a!important;background:linear-gradient(145deg,#191516,#101010)!important}
      .eparts-workspace .company-panel-head b{color:#f5eeee!important}
      .eparts-workspace .company-stat-card{
        border-color:#493238!important;background:linear-gradient(145deg,#21191b,#121112)!important;
        box-shadow:inset 3px 0 #8f1524!important;
      }
      .eparts-workspace .company-stat-card:hover{border-color:#a52b3b!important;box-shadow:inset 3px 0 #ed142c,0 8px 22px #0007!important}
      .eparts-workspace .company-stat-card strong{color:#fff!important}
      .eparts-workspace .company-stat-card span{color:#c7bfc0!important}
      .eparts-workspace .eparts-mobile-bottom-nav{
        border-color:#76202b!important;background:rgba(12,10,11,.97)!important;
        box-shadow:0 8px 28px #000c!important;
      }
      .eparts-workspace .eparts-mobile-bottom-nav button{color:#c9c0c1!important}
      .eparts-workspace .eparts-mobile-bottom-nav button svg{color:#ed4052!important}
      .eparts-workspace .eparts-mobile-bottom-nav button.active{
        border-color:#ed142c!important;background:linear-gradient(145deg,#7d1423,#310d14)!important;color:#fff!important;
        box-shadow:inset 0 0 0 1px #ed142c55!important;
      }
      .eparts-workspace .eparts-mobile-bottom-nav button.active svg{color:#fff!important}
      .eparts-workspace .eparts-quick-grid button{
        border-color:#493238!important;background:linear-gradient(145deg,#21191b,#121112)!important;color:#f5eeee!important;
      }
      .eparts-workspace .eparts-quick-grid button svg{color:#ed4052!important}
      .eparts-workspace .eparts-quick-grid button:hover{border-color:#ed142c!important;background:#2b1116!important}
      .eparts-workspace .eparts-menu-group .company-panel-head b{color:#ff6878!important}
      .eparts-workspace .eparts-mobile-drawer{
        border-color:#76202b!important;background:linear-gradient(155deg,#211316,#090909 78%)!important;
      }
      .eparts-workspace .eparts-mobile-drawer .company-nav-section-label{color:#ff6878!important}
      .eparts-workspace .eparts-mobile-drawer button.active{background:#6f1020!important;color:#fff!important}
      @media(max-width:760px){
        .eparts-workspace .company-top{border-bottom-color:#4a252c!important}
        .eparts-workspace .company-top h1{color:#fff!important}
        .eparts-workspace .company-panel{border-color:#493238!important}
        .eparts-workspace .company-stat-card{min-height:108px!important}
        .eparts-workspace .company-stat-card strong{font-size:23px!important}
        .eparts-workspace .company-panel-head b{color:#fff!important}
        .eparts-workspace .company-panel-head small{color:#bdb3b4!important}
      }
      @media(max-width:760px){.eparts-workspace .eparts-menu-page{padding-bottom:8px}.eparts-workspace .eparts-menu-group{padding:13px!important}.eparts-workspace .eparts-menu-options button,.eparts-workspace .eparts-menu-options a{min-height:48px;font-size:13px}}
    `}
      /* Final pass: every EPARTS navigation tab follows the approved palette */
      .eparts-workspace .company-nav-section-label,.eparts-workspace .company-nav-item svg,
      .eparts-workspace .eparts-menu-options svg{color:#ff4052!important}
      .eparts-workspace .company-nav-item{color:#eee!important}
      .eparts-workspace .company-nav-item.active{background:linear-gradient(110deg,#ed142c,#76000e)!important;border-color:#ff4052!important;color:#fff!important}
      .eparts-workspace .company-nav-item.active svg{color:#fff!important}
      .eparts-workspace .company-primary{background:linear-gradient(110deg,#ed142c,#850012)!important;border-color:#ff4052!important;color:#fff!important}
      .eparts-workspace .company-secondary{background:#1a1113!important;border-color:#64202a!important;color:#ffb5bd!important}
      .eparts-workspace .company-form,.eparts-workspace .company-table-wrap{border-color:#64202a!important}
      .eparts-workspace input:focus,.eparts-workspace select:focus,.eparts-workspace textarea:focus{border-color:#ed142c!important;box-shadow:0 0 0 3px #ed142c22!important}
      .eparts-workspace .company-table th{color:#ff8793!important}
      .eparts-workspace .company-table td{border-color:#352126!important}
      .eparts-workspace .eparts-menu-options button,.eparts-workspace .eparts-menu-options a{border-color:#64202a!important;background:#171012!important;color:#fff!important}
      .eparts-workspace .eparts-menu-options button:hover,.eparts-workspace .eparts-menu-options a:hover{background:#3a1018!important;border-color:#ed142c!important}
</style>
    <aside className="company-sidebar">
      <div className="eparts-brand-row">
        <div className="company-logo"><span><ShoppingCart/></span><div><b>EPARTS</b><small>PORTAL DO FORNECEDOR</small></div></div>
        <button type="button" className="eparts-mobile-menu-button" onClick={()=>setMenuOpen(v=>!v)} aria-expanded={menuOpen} aria-controls="eparts-mobile-drawer" aria-label={menuOpen?'Fechar menu':'Abrir menu'}>{menuOpen?<X size={19}/>:<Menu size={19}/>}</button>
      </div>
      <div className="eparts-company-chip"><Store size={17}/><span>{companyName}</span></div>
      <nav id="eparts-mobile-drawer" className={menuOpen?'eparts-nav-open':'eparts-nav-closed'}>
        {navItems.map(group=><div className="company-nav-section" key={group.section}>
          <span className="company-nav-section-label">{group.section}</span>
          {group.items.map(item=><button key={item.id} className={tab===item.id?'active':''} onClick={()=>nav(item.id)}><item.icon size={17}/><span>{item.label}</span>{tab===item.id&&<ChevronRight className="eparts-nav-arrow" size={15}/>}</button>)}
          {group.section==='CADASTRO RÁPIDO'&&<>
            <button type="button" onClick={()=>quickAdd('customers')}><Users size={17}/><span>Cadastrar cliente</span><ChevronRight className="eparts-nav-arrow" size={15}/></button>
            <button type="button" onClick={()=>quickAdd('suppliers')}><Truck size={17}/><span>Cadastrar fornecedor</span><ChevronRight className="eparts-nav-arrow" size={15}/></button>
            <button type="button" onClick={()=>quickAdd('brands')}><Tags size={17}/><span>Cadastrar marca</span><ChevronRight className="eparts-nav-arrow" size={15}/></button>
            <button type="button" onClick={()=>quickAdd('categories')}><Boxes size={17}/><span>Cadastrar categoria</span><ChevronRight className="eparts-nav-arrow" size={15}/></button>
          </>}
          {group.section==='CATÁLOGO ONLINE'&&
            <a className="eparts-nav-link" href={`${window.location.origin}/?catalogo=eparts`} target="_blank" rel="noreferrer"><Store size={17}/><span>Abrir catálogo</span><ExternalLink size={14} className="eparts-nav-arrow"/></a>
          }
          {group.section==='PORTAL DO FORNECEDOR'&&
            <a className="eparts-nav-link" href={`${window.location.origin}/?portal=fornecedor`} target="_blank" rel="noreferrer"><Users size={17}/><span>Acesso do fornecedor</span><ExternalLink size={14} className="eparts-nav-arrow"/></a>
          }
        </div>)}
      </nav>
      <div className="company-user">
        <div className="eparts-user-meta"><span className="eparts-user-avatar"><Store size={16}/></span><div><b>{email}</b><small>Perfil: {role}</small></div></div>
        <button onClick={onSignOut}><LogOut size={15}/> Sair da conta</button>
      </div>
    </aside>
    <nav className="eparts-mobile-bottom-nav" aria-label="Navegação rápida">
      <button className={tab==='dashboard'?'active':''} onClick={()=>nav('dashboard')}><LayoutDashboard size={19}/><span>Início</span></button>
      <button className={tab==='products'?'active':''} onClick={()=>nav('products')}><Package size={19}/><span>Produtos</span></button>
      <button className={tab==='pos'?'active':''} onClick={()=>nav('pos')}><ShoppingCart size={21}/><span>PDV</span></button>
      <button className={tab==='sales'?'active':''} onClick={()=>nav('sales')}><BarChart3 size={19}/><span>Vendas</span></button>
      <button type="button" className={menuOpen?'active':''} aria-expanded={menuOpen} aria-controls="eparts-mobile-drawer" onClick={()=>setMenuOpen(v=>!v)}>{menuOpen?<X size={19}/>:<Menu size={19}/>}<span>Menu</span></button>
    </nav>
    <main className="company-main">
      <header className="company-top"><div><small>EPARTS / PAINEL DE GESTÃO</small><h1>{title}</h1></div><div className="eparts-header-actions"><a href={`${window.location.origin}/?catalogo=eparts`} target="_blank" rel="noreferrer" className="company-secondary" style={{textDecoration:'none',display:'inline-flex',alignItems:'center',gap:7}}><ExternalLink size={15}/> Catálogo online</a><button className="company-icon-button" onClick={()=>void load()} title="Atualizar dados" aria-label="Atualizar dados"><RefreshCw size={16}/></button></div></header>
      {error&&<div className="company-error-banner">{error}</div>}
      {menuOpen?<section className="eparts-menu-page">
        {navItems.map(group=><div className="company-panel eparts-menu-group" key={group.section}>
          <div className="company-panel-head"><b>{group.section}</b></div>
          <div className="eparts-menu-options">
            {group.items.map(item=><button type="button" key={item.id} className={tab===item.id?'active':''} onClick={()=>nav(item.id)}><item.icon size={20}/><span>{item.label}</span><ChevronRight size={17}/></button>)}
            {group.section==='CADASTRO RÁPIDO'&&<>
              <button type="button" onClick={()=>quickAdd('customers')}><Users size={20}/><span>Cadastrar cliente</span><ChevronRight size={17}/></button>
              <button type="button" onClick={()=>quickAdd('suppliers')}><Truck size={20}/><span>Cadastrar fornecedor</span><ChevronRight size={17}/></button>
              <button type="button" onClick={()=>quickAdd('brands')}><Tags size={20}/><span>Cadastrar marca</span><ChevronRight size={17}/></button>
              <button type="button" onClick={()=>quickAdd('categories')}><Boxes size={20}/><span>Cadastrar categoria</span><ChevronRight size={17}/></button>
            </>}
            {group.section==='CATÁLOGO ONLINE'&&<a href={`${window.location.origin}/?catalogo=eparts`} target="_blank" rel="noreferrer"><Store size={20}/><span>Abrir catálogo</span><ExternalLink size={17}/></a>}
            {group.section==='PORTAL DO FORNECEDOR'&&<a href={`${window.location.origin}/?portal=fornecedor`} target="_blank" rel="noreferrer"><Users size={20}/><span>Acesso do fornecedor</span><ExternalLink size={17}/></a>}
          </div>
        </div>)}
      </section>:['customers','suppliers','brands','categories'].includes(tab)?<EpartsRegistrations key={tab+'-'+createVersion} companyId={companyId} initialTab={tab as 'customers'|'suppliers'|'brands'|'categories'} initialCreate={quickCreate===tab}/>:tab==='pos'?<EpartsPOS companyId={companyId}/>:tab==='dashboard'?<div className="eparts-dashboard">
        <section className="company-panel eparts-overview-panel">
          <div className="company-panel-head"><div style={{display:"flex",alignItems:"center",gap:13}}><BarChart3 size={35} color="#ed142c"/><div><b>Resumo da operação</b><small>Indicadores comerciais e de estoque da Eparts</small></div></div><button className="company-secondary" onClick={()=>void load()} disabled={loading}><RefreshCw size={15}/> Atualizar dados</button></div>
          {loading?<p className="company-empty">Carregando indicadores...</p>:<div className="company-stats-grid">
            <article className="company-stat-card"><div style={{display:"flex",alignItems:"center",gap:12}}><Package size={29} color="#ed142c"/><span>Produtos cadastrados</span></div><strong>{stats.products}</strong></article>
            <article className="company-stat-card"><div style={{display:"flex",alignItems:"center",gap:12}}><Boxes size={29} color="#ed142c"/><span>Unidades em estoque</span></div><strong>{stats.stock}</strong></article>
            <article className="company-stat-card"><div style={{display:"flex",alignItems:"center",gap:12}}><Truck size={29} color="#ed142c"/><span>Fornecedores cadastrados</span></div><strong>{stats.suppliers}</strong></article>
            <article className="company-stat-card"><div style={{display:"flex",alignItems:"center",gap:12}}><ShoppingCart size={29} color="#ed142c"/><span>Pedidos e vendas</span></div><strong>{stats.orders}</strong></article>
            <article className="company-stat-card"><div style={{display:"flex",alignItems:"center",gap:12}}><FileText size={29} color="#ed142c"/><span>Valor em pedidos ativos</span></div><strong>{money(stats.revenue)}</strong></article>
            <article className="company-stat-card"><div style={{display:"flex",alignItems:"center",gap:12}}><Wallet size={29} color="#ed142c"/><span>Comissão prevista</span></div><strong>{money(stats.commission)}</strong></article>
          </div>}
        </section>
        <section className="company-panel eparts-financial-split">
          <div className="company-panel-head"><div style={{display:"flex",alignItems:"center",gap:12}}><Wallet size={29} color="#ed142c"/><div><b>Distribuição das vendas</b><small>Estimativa sobre os pedidos ativos · comissão EPARTS atual de 12%</small></div></div></div>
          <div className="eparts-financial-grid">
            <div><ShoppingCart size={23}/><span>Vendas do período</span><strong>{money(stats.revenue)}</strong></div>
            <div><Wallet size={23}/><span>Comissão EPARTS (12%)</span><strong className="eparts-commission-value">{money(stats.commission)}</strong></div>
            <div><Users size={23}/><span>Parte do fornecedor (estimada)</span><strong className="eparts-supplier-value">{money(Math.max(0,stats.revenue-stats.commission))}</strong></div>
          </div>
        </section>
        <section className="company-panel eparts-quick-panel">
          <div className="company-panel-head"><div style={{display:"flex",alignItems:"center",gap:12}}><Zap size={28} color="#ed142c"/><div><b>Ações rápidas</b><small>Acesse as áreas mais utilizadas</small></div></div></div>
          <div className="eparts-quick-grid">
            <button type="button" onClick={()=>nav('pos')}><ShoppingCart size={25}/><b>PDV</b><small>Nova venda</small></button>
            <button type="button" onClick={()=>nav('products')}><Package size={25}/><b>Produtos</b><small>Estoque e cadastro</small></button>
            <button type="button" onClick={()=>nav('sales')}><BarChart3 size={25}/><b>Vendas</b><small>Pedidos e histórico</small></button>
          </div>
        </section>
      </div>:<EpartsCatalogAdminPanel key={tab+'-'+createVersion} companyId={companyId} initialTab={tab as 'products'|'suppliers'|'brands'|'sales'|'payouts'|'customers'} initialCreate={quickCreate===tab}/>}
      <footer className="company-footer">EPARTS · Painel comercial exclusivo · Acesso protegido por empresa</footer>
    </main>
  </div>
}
