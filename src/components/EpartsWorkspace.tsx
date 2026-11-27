import { useCallback, useEffect, useState } from 'react'
import { LayoutDashboard, Package, Tags, Truck, ShoppingCart, Wallet, Users, LogOut, RefreshCw, ExternalLink, Menu, X, ChevronRight, Store, BarChart3 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import EpartsCatalogAdminPanel from './EpartsCatalogAdminPanel'
import EpartsPOS from './EpartsPOS'

type Props = { companyId:string; companyName:string; email:string; role:string; onSignOut:()=>void }
type Tab = 'dashboard'|'products'|'brands'|'suppliers'|'customers'|'sales'|'payouts'|'pos'
const money=(n:number)=>Number(n||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})

export default function EpartsWorkspace({companyId,companyName,email,role,onSignOut}:Props) {
  const [tab,setTab]=useState<Tab>('dashboard')
  const [quickCreate,setQuickCreate]=useState<'customers'|'suppliers'|null>(null)
  const [createVersion,setCreateVersion]=useState(0)
  const quickAdd=(target:'customers'|'suppliers')=>{setQuickCreate(target);setTab(target);setCreateVersion(v=>v+1)}
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
  const nav=(value:Tab)=>{setQuickCreate(null);setTab(value)}
  const title=tab==='dashboard'?'Visão geral':tab==='products'?'Produtos e estoque':tab==='brands'?'Marcas':tab==='suppliers'?'Fornecedores':tab==='customers'?'Clientes':tab==='sales'?'Vendas e pedidos':tab==='pos'?'Ponto de venda':'Comissões e repasses'
  const navItems=[
    {section:'VISÃO GERAL',items:[{id:'dashboard' as Tab,label:'Dashboard',icon:LayoutDashboard}]},
    {section:'GESTÃO COMERCIAL',items:[{id:'pos' as Tab,label:'PDV · Ponto de venda',icon:ShoppingCart},{id:'products' as Tab,label:'Produtos e estoque',icon:Package},{id:'sales' as Tab,label:'Vendas e pedidos',icon:ShoppingCart}]},
    {section:'CADASTROS',items:[{id:'brands' as Tab,label:'Marcas',icon:Tags},{id:'suppliers' as Tab,label:'Fornecedores',icon:Truck},{id:'customers' as Tab,label:'Clientes',icon:Users},{id:'payouts' as Tab,label:'Comissões e repasses',icon:Wallet}]},
    {section:'CADASTRO RÁPIDO',items:[]}
  ]
  return <div className="company-app eparts-workspace">
    <style>{`
      .eparts-workspace{--ep-gold:#d8b36a;--ep-gold-light:#f3d99f;--ep-muted:#9c927f;background:#0b0b0c;color:#f4f0e8;min-height:100vh}
      .eparts-workspace .company-sidebar{position:sticky;top:0;height:100vh;overflow-y:auto;width:278px;padding:25px 18px 18px;background:linear-gradient(180deg,#171411 0%,#100f0e 48%,#0c0c0c 100%);border-right:1px solid rgba(216,179,106,.2);box-shadow:12px 0 35px rgba(0,0,0,.18)}
      .eparts-workspace .eparts-brand-row{display:flex;align-items:center;justify-content:space-between;margin-bottom:26px}
      .eparts-workspace .company-logo{gap:12px;padding:0 5px}
      .eparts-workspace .company-logo>span{width:44px;height:44px;background:linear-gradient(145deg,#f1d28d,#a9782b);color:#17120a;border-radius:13px;box-shadow:0 8px 24px rgba(190,143,54,.2)}
      .eparts-workspace .company-logo b{font-size:19px;letter-spacing:2.5px;color:#f4d99e}
      .eparts-workspace .company-logo small{font-size:8px;letter-spacing:1.3px;color:#a99a7e}
      .eparts-workspace .eparts-company-chip{display:flex;align-items:center;gap:9px;padding:12px 13px;margin-bottom:25px;border:1px solid rgba(216,179,106,.2);background:rgba(216,179,106,.055);border-radius:12px;color:#e7d4ad;font-size:12px;line-height:1.4}
      .eparts-workspace .eparts-company-chip svg{color:var(--ep-gold);flex:none}
      .eparts-workspace .company-sidebar nav{display:grid;gap:20px;margin:0}
      .eparts-workspace .company-nav-section{display:grid;gap:6px}
      .eparts-workspace .company-nav-section-label{padding:0 11px 5px;color:#827764;letter-spacing:1.5px;font-size:9px;font-weight:800}
      .eparts-workspace .company-sidebar nav button{width:100%;min-height:44px;padding:10px 12px;gap:12px;border:1px solid transparent;border-radius:10px;color:#b8b0a3;font-size:12px;font-weight:550;transition:all .18s ease}
      .eparts-workspace .company-sidebar nav button svg{color:#9c8c6c;flex:none}
      .eparts-workspace .company-sidebar nav button:hover{background:rgba(255,255,255,.045);color:#fff}
      .eparts-workspace .company-sidebar nav button.active{background:linear-gradient(100deg,rgba(216,179,106,.19),rgba(216,179,106,.055));border-color:rgba(216,179,106,.2);color:#f4d99e;box-shadow:inset 3px 0 #d8b36a}
      .eparts-workspace .company-sidebar nav button.active svg{color:#e5c47f}
      .eparts-workspace .eparts-nav-arrow{margin-left:auto;opacity:.7}
      .eparts-workspace .company-user{margin-top:auto;padding:16px 5px 0;border-top:1px solid rgba(216,179,106,.15)}
      .eparts-workspace .eparts-user-meta{display:flex;align-items:center;gap:10px;min-width:0}
      .eparts-workspace .eparts-user-avatar{width:34px;height:34px;display:grid;place-items:center;flex:none;border-radius:50%;background:#292117;color:#e4c47e;border:1px solid rgba(216,179,106,.25)}
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
      .eparts-workspace .company-icon-button{border-color:rgba(216,179,106,.22);background:#191612;color:#e6c77f;border-radius:10px}
      .eparts-workspace .company-panel{border:1px solid rgba(216,179,106,.16);background:linear-gradient(145deg,rgba(27,24,20,.96),rgba(17,16,15,.98));border-radius:16px;box-shadow:0 18px 50px rgba(0,0,0,.2)}
      .eparts-workspace .company-panel-head b{color:#f0e7d7}
      .eparts-workspace .company-panel-head small{color:#9e9587}
      .eparts-workspace .company-stats-grid{gap:14px}
      .eparts-workspace .company-stat-card{min-width:0;padding:19px;border:1px solid rgba(216,179,106,.16);border-radius:14px;background:linear-gradient(145deg,rgba(43,35,25,.72),rgba(21,19,17,.98));transition:transform .18s ease,border-color .18s ease}
      .eparts-workspace .company-stat-card:hover{transform:translateY(-2px);border-color:rgba(216,179,106,.35)}
      .eparts-workspace .company-stat-card span{color:#b9ad98;font-size:11px;line-height:1.45}
      .eparts-workspace .company-stat-card strong{display:block;margin-top:8px;color:#f0d18c;font-size:clamp(22px,2.2vw,29px);letter-spacing:-.5px;overflow-wrap:anywhere}
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
        .eparts-workspace .eparts-mobile-menu-button{display:inline-flex;align-items:center;justify-content:center;width:40px;height:40px;border:1px solid rgba(216,179,106,.24);border-radius:10px;background:#211b12;color:#e9cb88}
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
        .eparts-workspace>.company-sidebar{display:block!important;position:sticky!important;top:0!important;z-index:80!important;width:100%!important;height:auto!important;max-height:none!important;overflow:visible!important;padding:10px 14px 0!important;background:linear-gradient(105deg,#090909,#17120d 55%,#090909)!important;border:0!important;border-bottom:1px solid #b68b3c!important;box-shadow:0 8px 25px #000b!important;transform:none!important}
        .eparts-workspace .eparts-brand-row{display:flex!important;min-height:54px!important;align-items:center!important;justify-content:space-between!important;margin:0!important;padding:0 0 9px!important}
        .eparts-workspace .company-logo{display:flex!important;align-items:center!important;gap:10px!important}
        .eparts-workspace .company-logo>span{display:grid!important;place-items:center!important;width:42px!important;height:42px!important;border:1px solid #d9ad58!important;background:linear-gradient(145deg,#1b1710,#090909)!important;color:#e8c56e!important;border-radius:11px!important}
        .eparts-workspace .company-logo b{font-size:18px!important;letter-spacing:2px!important;color:#f2d18b!important}
        .eparts-workspace .company-logo small{font-size:8px!important;letter-spacing:1px!important;color:#dfbd77!important}
        .eparts-workspace .eparts-mobile-menu-button{display:inline-flex!important;align-items:center!important;justify-content:center!important;width:42px!important;height:42px!important;border:1px solid #b58b39!important;border-radius:10px!important;background:#17130d!important;color:#f0cf7d!important}
        .eparts-workspace .eparts-company-chip{display:none!important}
        .eparts-workspace>.company-sidebar nav{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:8px!important;padding:9px 0 13px!important;margin:0!important;max-height: min(62dvh,480px)!important;overflow:auto!important}
        .eparts-workspace>.company-sidebar nav.eparts-nav-closed{display:none!important}
        .eparts-workspace .company-nav-section{display:contents!important}
        .eparts-workspace .company-nav-section-label{display:none!important}
        .eparts-workspace>.company-sidebar nav button{display:flex!important;align-items:center!important;justify-content:flex-start!important;min-width:0!important;min-height:46px!important;padding:9px 10px!important;border:1px solid #383027!important;border-radius:10px!important;background:linear-gradient(120deg,#1b1916,#111)!important;color:#e6dfd2!important;font-size:12px!important;white-space:normal!important}
        .eparts-workspace>.company-sidebar nav button.active{border-color:#d6ad60!important;background:linear-gradient(110deg,#5c4217,#21180c)!important;color:#ffe3a4!important;box-shadow:inset 3px 0 #edc66f!important}
        .eparts-workspace .company-user{display:flex!important;align-items:center!important;justify-content:space-between!important;gap:8px!important;margin:0!important;padding:9px 2px!important;border-top:1px solid #3c3020!important}
        .eparts-workspace .eparts-user-meta{display:flex!important;min-width:0!important}
        .eparts-workspace .company-user b{display:block!important;max-width:210px!important;overflow:hidden!important;text-overflow:ellipsis!important;white-space:nowrap!important}
        .eparts-workspace .company-user small{display:block!important}
        .eparts-workspace .company-user button{display:flex!important;align-items:center!important;gap:5px!important;margin:0!important;padding:7px!important;font-size:10px!important}
        .eparts-workspace>.company-main{display:block!important;width:100%!important;max-width:none!important;min-width:0!important;min-height:calc(100dvh - 70px)!important;padding:18px 13px calc(28px + env(safe-area-inset-bottom))!important;background:radial-gradient(ellipse at 50% 0%,#4c351322,transparent 40%),#090909!important}
        .eparts-workspace .company-top{display:flex!important;align-items:center!important;justify-content:space-between!important;gap:10px!important;padding:4px 1px 15px!important;margin:0 0 15px!important;border-bottom:1px solid #44351e!important}
        .eparts-workspace .company-top>div:first-child{min-width:0!important}
        .eparts-workspace .company-top small{font-size:8px!important;letter-spacing:1.5px!important;color:#c3a267!important}
        .eparts-workspace .company-top h1{font-size:clamp(21px,6vw,27px)!important;line-height:1.15!important;color:#f4d797!important}
        .eparts-workspace .eparts-header-actions{display:flex!important;align-items:center!important;gap:7px!important;width:auto!important;flex:none!important}
        .eparts-workspace .eparts-header-actions>a{padding:9px!important;font-size:10px!important}
        .eparts-workspace .company-icon-button{width:40px!important;height:40px!important;min-width:40px!important}
        .eparts-workspace .company-panel{padding:14px!important;margin:0 0 14px!important;border:1px solid #59462b!important;border-radius:14px!important;background:linear-gradient(145deg,#1a1816,#101010)!important}
        .eparts-workspace .company-panel-head{display:flex!important;align-items:flex-start!important;justify-content:space-between!important;gap:9px!important;flex-wrap:wrap!important;padding-bottom:12px!important;margin-bottom:13px!important;border-bottom:1px solid #443a2c!important}
        .eparts-workspace .company-panel-head>div{min-width:0!important}
        .eparts-workspace .company-panel-head b{font-size:15px!important;color:#f2d797!important}
        .eparts-workspace .company-panel-head small{display:block!important;margin-top:4px!important;font-size:11px!important;line-height:1.4!important;color:#b8afa2!important}
        .eparts-workspace .company-panel-head>button{min-height:40px!important;padding:8px 12px!important}
        .eparts-workspace .company-stats-grid{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:9px!important}
        .eparts-workspace .company-stat-card{display:block!important;min-width:0!important;min-height:104px!important;padding:13px!important;border:1px solid #59472d!important;border-radius:12px!important;background:linear-gradient(145deg,#262017,#141210)!important}
        .eparts-workspace .company-stat-card span{display:block!important;font-size:11px!important;color:#c4b79e!important}
        .eparts-workspace .company-stat-card strong{font-size:22px!important;color:#f2cf7b!important}
        .eparts-workspace .company-inline-actions{display:flex!important;flex-wrap:wrap!important;gap:8px!important;margin-top:14px!important}
        .eparts-workspace .company-inline-actions button{min-height:43px!important}
        .eparts-workspace .company-footer{padding:15px 2px!important;font-size:9px!important}
        .eparts-workspace .eparts-admin-panel .eparts-tabs{display:none!important}
        .eparts-workspace .eparts-admin-panel .eparts-list-head{display:flex!important;align-items:flex-start!important;gap:10px!important}
        .eparts-workspace .eparts-admin-panel .eparts-list-head>button{width:100%!important;min-height:46px!important;justify-content:center!important}
        .eparts-workspace .eparts-admin-panel .company-form{padding:12px!important;margin:12px 0!important;border-color:#6c532d!important;background:#13110e!important}
        .eparts-workspace .eparts-admin-panel .company-form-grid{display:grid!important;grid-template-columns:minmax(0,1fr)!important;gap:10px!important}
        .eparts-workspace .eparts-admin-panel .company-form input,.eparts-workspace .eparts-admin-panel .company-form select,.eparts-workspace .eparts-admin-panel .company-form textarea{min-height:43px!important;background:#090909!important;color:#fff!important;border:1px solid #58472e!important;border-radius:9px!important;font-size:16px!important}
        .eparts-workspace .eparts-admin-panel .company-table-wrap{max-width:100%!important;overflow-x:auto!important}
        .eparts-workspace .eparts-admin-panel .company-table-wrap table{min-width:680px!important}
      }
      @media(max-width:380px){.eparts-workspace .company-stats-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important}.eparts-workspace .company-stat-card{padding:10px!important}.eparts-workspace .company-stat-card strong{font-size:19px!important}}
      .eparts-workspace .eparts-mobile-bottom-nav{display:none}
      @media(max-width:760px){
        .eparts-workspace .eparts-mobile-bottom-nav{position:fixed!important;z-index:100!important;left:10px!important;right:10px!important;bottom:calc(8px + env(safe-area-inset-bottom))!important;display:grid!important;grid-template-columns:repeat(5,minmax(0,1fr))!important;gap:3px!important;padding:7px 5px!important;border:1px solid #755b31!important;border-radius:16px!important;background:rgba(15,13,11,.96)!important;box-shadow:0 8px 30px #000c,0 0 16px #d6ad6022!important;backdrop-filter:blur(14px)!important}
        .eparts-workspace .eparts-mobile-bottom-nav button{display:flex!important;min-width:0!important;min-height:48px!important;flex-direction:column!important;align-items:center!important;justify-content:center!important;gap:4px!important;padding:4px 2px!important;border:1px solid transparent!important;border-radius:10px!important;background:transparent!important;color:#b9ad98!important;font-size:9px!important;font-weight:650!important}
        .eparts-workspace .eparts-mobile-bottom-nav button svg{color:#d8b36a!important}
        .eparts-workspace .eparts-mobile-bottom-nav button.active{border-color:#9c762f!important;background:linear-gradient(145deg,#493516,#21190d)!important;color:#ffe4a3!important}
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


      /* EPARTS visual polish: presentation only */
      .eparts-workspace{font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif!important;letter-spacing:0!important}
      .eparts-workspace .company-main{max-width:1600px!important;margin-inline:auto!important}
      .eparts-workspace .company-top{align-items:center!important;gap:18px!important}
      .eparts-workspace .company-top h1{font-weight:650!important;letter-spacing:-.045em!important}
      .eparts-workspace .company-top small{font-weight:700!important}
      .eparts-workspace .eparts-header-actions{flex-wrap:wrap!important;justify-content:flex-end!important}
      .eparts-workspace button,.eparts-workspace a{transition:background .18s ease,border-color .18s ease,color .18s ease,transform .18s ease!important}
      .eparts-workspace .company-primary{border:1px solid #d6ad60!important;border-radius:10px!important;background:linear-gradient(135deg,#d8b36a,#a87932)!important;color:#17120a!important;font-weight:750!important;box-shadow:0 5px 16px #b58b3922!important}
      .eparts-workspace .company-primary:hover{filter:brightness(1.08)!important;transform:translateY(-1px)!important}
      .eparts-workspace .company-secondary{border:1px solid #51432e!important;border-radius:10px!important;background:#191714!important;color:#e8d6b3!important}
      .eparts-workspace .company-secondary:hover{border-color:#bd9650!important;background:#242017!important;color:#ffe3a4!important}
      .eparts-workspace .company-panel{padding:22px!important;border-color:#393126!important;border-radius:17px!important;background:linear-gradient(145deg,#171614,#10100f)!important;box-shadow:0 12px 34px #0005!important}
      .eparts-workspace .company-panel-head{gap:14px!important}
      .eparts-workspace .company-panel-head b{font-size:15px!important;font-weight:700!important;letter-spacing:-.01em!important}
      .eparts-workspace .company-panel-head small{line-height:1.55!important}
      .eparts-workspace .company-stat-card{border-color:#403522!important;background:linear-gradient(145deg,#211d16,#141311)!important;box-shadow:inset 0 1px #ffffff08!important}
      .eparts-workspace .company-stat-card span{font-weight:550!important;color:#bdb19c!important}
      .eparts-workspace .company-stat-card strong{font-weight:750!important}
      .eparts-workspace .company-form{display:grid!important;gap:15px!important;padding:20px!important;border:1px solid #51432e!important;border-radius:14px!important;background:#141311!important}
      .eparts-workspace .company-form label{display:grid!important;gap:7px!important;color:#d9c9aa!important;font-size:12px!important;font-weight:650!important}
      .eparts-workspace .company-form input,.eparts-workspace .company-form select,.eparts-workspace .company-form textarea,.eparts-workspace select,.eparts-workspace input:not([type=checkbox]){min-height:42px!important;border:1px solid #494033!important;border-radius:9px!important;background:#0d0d0c!important;color:#f6f0e5!important;padding:10px 12px!important;outline:none!important}
      .eparts-workspace .company-form input:focus,.eparts-workspace .company-form select:focus,.eparts-workspace .company-form textarea:focus,.eparts-workspace select:focus,.eparts-workspace input:focus{border-color:#c49b52!important;box-shadow:0 0 0 3px #c49b5220!important}
      .eparts-workspace .company-form textarea{min-height:82px!important;resize:vertical!important}
      .eparts-workspace .company-form-grid{gap:14px!important}
      .eparts-workspace .company-form-actions{display:flex!important;justify-content:flex-end!important;flex-wrap:wrap!important;gap:9px!important;padding-top:8px!important;border-top:1px solid #332d24!important}
      .eparts-workspace .company-table-wrap{overflow:auto!important;border:1px solid #393126!important;border-radius:12px!important;background:#11100f!important}
      .eparts-workspace table{width:100%!important;border-collapse:separate!important;border-spacing:0!important}
      .eparts-workspace table th{padding:13px 14px!important;background:#1d1913!important;color:#cbb17d!important;font-size:10px!important;font-weight:800!important;letter-spacing:.08em!important;white-space:nowrap!important;border-bottom:1px solid #493a25!important}
      .eparts-workspace table td{padding:13px 14px!important;border-bottom:1px solid #29251f!important;color:#ded7ca!important;font-size:12px!important;vertical-align:middle!important}
      .eparts-workspace table tr:last-child td{border-bottom:0!important}
      .eparts-workspace table tbody tr:hover td{background:#ffffff06!important}
      .eparts-workspace table td b{color:#f4e8d1!important}
      .eparts-workspace table td small{display:block!important;margin-top:4px!important;color:#958b7b!important}
      .eparts-workspace .company-empty{padding:24px!important;border:1px dashed #51432e!important;border-radius:12px!important;background:#141311!important;color:#bdb19c!important;text-align:center!important}
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

    `}</style>
    <aside className="company-sidebar">
      <div className="eparts-brand-row">
        <div className="company-logo"><span><ShoppingCart/></span><div><b>EPARTS</b><small>COMÉRCIO E MARKETPLACE</small></div></div>
        <button className="eparts-mobile-menu-button" onClick={()=>setMenuOpen(v=>!v)} aria-label={menuOpen?'Fechar menu':'Abrir menu'}>{menuOpen?<X size={19}/>:<Menu size={19}/>}</button>
      </div>
      <div className="eparts-company-chip"><Store size={17}/><span>{companyName}</span></div>
      <nav className={menuOpen?'':'eparts-nav-closed'}>
        {navItems.map(group=><div className="company-nav-section" key={group.section}>
          <span className="company-nav-section-label">{group.section}</span>
          {group.items.map(item=><button key={item.id} className={tab===item.id?'active':''} onClick={()=>nav(item.id)}><item.icon size={17}/><span>{item.label}</span>{tab===item.id&&<ChevronRight className="eparts-nav-arrow" size={15}/>}</button>)}
          {group.section==='CADASTRO RÁPIDO'&&<>
            <button type="button" onClick={()=>quickAdd('customers')}><Users size={17}/><span>Cadastrar cliente</span><ChevronRight className="eparts-nav-arrow" size={15}/></button>
            <button type="button" onClick={()=>quickAdd('suppliers')}><Truck size={17}/><span>Cadastrar fornecedor</span><ChevronRight className="eparts-nav-arrow" size={15}/></button>
          </>}
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
      <button className={menuOpen?'active':''} onClick={()=>{setMenuOpen(v=>!v);window.scrollTo({top:0,behavior:'smooth'})}}><Menu size={19}/><span>Menu</span></button>
    </nav>
    <main className="company-main">
      <header className="company-top"><div><small>EPARTS / PAINEL DE GESTÃO</small><h1>{title}</h1></div><div className="eparts-header-actions"><a href={`${window.location.origin}/?catalogo=eparts`} target="_blank" rel="noreferrer" className="company-secondary" style={{textDecoration:'none',display:'inline-flex',alignItems:'center',gap:7}}><ExternalLink size={15}/> Catálogo online</a><button className="company-icon-button" onClick={()=>void load()} title="Atualizar dados" aria-label="Atualizar dados"><RefreshCw size={16}/></button></div></header>
      {error&&<div className="company-error-banner">{error}</div>}
      {tab==='pos'?<EpartsPOS companyId={companyId}/>:tab==='dashboard'?<section className="company-panel">
        <div className="company-panel-head"><div><b>Resumo da operação</b><small>Indicadores comerciais e de estoque da Eparts</small></div><button className="company-secondary" onClick={()=>void load()} disabled={loading}><RefreshCw size={15}/> Atualizar</button></div>
        {loading?<p className="company-empty">Carregando indicadores...</p>:<div className="company-stats-grid">
          <article className="company-stat-card"><span>Produtos cadastrados</span><strong>{stats.products}</strong></article>
          <article className="company-stat-card"><span>Unidades em estoque</span><strong>{stats.stock}</strong></article>
          <article className="company-stat-card"><span>Fornecedores</span><strong>{stats.suppliers}</strong></article>
          <article className="company-stat-card"><span>Pedidos e vendas</span><strong>{stats.orders}</strong></article>
          <article className="company-stat-card"><span>Valor em pedidos ativos</span><strong>{money(stats.revenue)}</strong></article>
          <article className="company-stat-card"><span>Comissão prevista</span><strong>{money(stats.commission)}</strong></article>
        </div>}
        <div className="company-inline-actions"><button className="company-primary" onClick={()=>nav('products')}><Package size={16}/> Abrir produtos e estoque</button></div>
      </section>:<EpartsCatalogAdminPanel key={tab+'-'+createVersion} companyId={companyId} initialTab={tab} initialCreate={quickCreate===tab}/>}
      <footer className="company-footer">EPARTS · Painel comercial exclusivo · Acesso protegido por empresa</footer>
    </main>
  </div>
}
