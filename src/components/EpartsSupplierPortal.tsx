import { useEffect, useMemo, useState, type FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { LogOut, RefreshCw, Store, UserRound, LockKeyhole, Eye, EyeOff, ChartNoAxesColumn, Package, Tag, Coins, LogIn } from 'lucide-react'
import { supabase } from '../lib/supabase'

type Supplier = { id:string; company_id:string; name:string; email:string|null; user_id:string|null }
type Brand = { id:string; name:string }
type Product = { id:string; brand_id:string|null; name:string; sku:string|null; stock_quantity:number; sale_price:number; image_url:string|null }
type SaleItem = { id:string; sale_id:string; product_id:string; product_name:string; sku:string|null; quantity:number; unit_price:number; line_total:number; eparts_commission_amount:number; supplier_amount:number; created_at:string }
type Sale = { id:string; order_number:number; status:string; payment_status:string; created_at:string }
type Payout = { id:string; amount:number; payment_method:string; paid_at:string; reference:string|null; notes:string|null }

const money=(value:number)=>Number(value||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})
const date=(value:string)=>new Date(value).toLocaleDateString('pt-BR')

export default function EpartsSupplierPortal(){
  const [session,setSession]=useState<Session|null>(null)
  const [supplier,setSupplier]=useState<Supplier|null>(null)
  const [products,setProducts]=useState<Product[]>([])
  const [brands,setBrands]=useState<Brand[]>([])
  const [items,setItems]=useState<SaleItem[]>([])
  const [sales,setSales]=useState<Sale[]>([])
  const [payouts,setPayouts]=useState<Payout[]>([])
  const [username,setUsername]=useState('')
  const [password,setPassword]=useState('')
  const [showPassword,setShowPassword]=useState(false)
  const [busy,setBusy]=useState(false)
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState('')
  const [from,setFrom]=useState('')
  const [to,setTo]=useState('')

  async function loadSupplier(userId:string){
    if(!supabase) return
    setLoading(true);setError('')
    try{
      const {data:profile,error:profileError}=await supabase.from('eparts_suppliers').select('id,company_id,name,email,user_id').eq('user_id',userId).maybeSingle()
      if(profileError) throw profileError
      if(!profile){setSupplier(null);setProducts([]);setBrands([]);setItems([]);setSales([]);setPayouts([]);setError('Este usuário ainda não está vinculado a um cadastro de fornecedor da EPARTS. Peça ao administrador para vincular seu acesso.');return}
      setSupplier(profile as Supplier)
      const {data:brandLinks,error:brandError}=await supabase.from('eparts_supplier_brands').select('brand_id').eq('company_id',profile.company_id).eq('supplier_id',profile.id)
      if(brandError)throw brandError
      const brandIds=(brandLinks||[]).map(row=>row.brand_id as string)
      let productQuery=supabase.from('eparts_products').select('id,brand_id,name,sku,stock_quantity,sale_price,image_url').eq('company_id',profile.company_id)
      productQuery=brandIds.length?productQuery.or('supplier_id.eq.'+profile.id+',brand_id.in.('+brandIds.join(',')+')'):productQuery.eq('supplier_id',profile.id)
      const [p,po]=await Promise.all([
        productQuery.order('name'),
        supabase.from('eparts_supplier_payouts').select('id,amount,payment_method,paid_at,reference,notes').eq('company_id',profile.company_id).eq('supplier_id',profile.id).order('paid_at',{ascending:false})
      ])
      if(p.error) throw p.error;if(po.error) throw po.error
      const {data:brandRows,error:brandsError}=brandIds.length?await supabase.from('eparts_brands').select('id,name').eq('company_id',profile.company_id).in('id',brandIds).order('name'):{data:[],error:null}
      if(brandsError)throw brandsError
      const productIds=(p.data||[]).map(row=>row.id as string)
      let itemRows:SaleItem[]=[]
      if(productIds.length){
        let itemQuery=supabase.from('eparts_sale_items').select('id,sale_id,product_id,product_name,sku,quantity,unit_price,line_total,eparts_commission_amount,supplier_amount,created_at').eq('company_id',profile.company_id)
        itemQuery=brandIds.length?itemQuery.or('supplier_id.eq.'+profile.id+',product_id.in.('+productIds.join(',')+')'):itemQuery.eq('supplier_id',profile.id)
        const {data,error}=await itemQuery.order('created_at',{ascending:false})
        if(error)throw error
        itemRows=(data||[]) as SaleItem[]
      } else {
        const {data,error}=await supabase.from('eparts_sale_items').select('id,sale_id,product_id,product_name,sku,quantity,unit_price,line_total,eparts_commission_amount,supplier_amount,created_at').eq('company_id',profile.company_id).eq('supplier_id',profile.id).order('created_at',{ascending:false})
        if(error)throw error
        itemRows=(data||[]) as SaleItem[]
      }
      const saleIds=[...new Set(itemRows.map(row=>row.sale_id))]
      let saleRows:Sale[]=[]
      if(saleIds.length){
        const {data,error}=await supabase.from('eparts_sales').select('id,order_number,status,payment_status,created_at').eq('company_id',profile.company_id).in('id',saleIds)
        if(error) throw error
        saleRows=(data||[]) as Sale[]
      }
      setProducts((p.data||[]) as Product[]);setBrands((brandRows||[]) as Brand[]);setItems(itemRows);setSales(saleRows);setPayouts((po.data||[]) as Payout[])
    }catch(e){setError(e instanceof Error?e.message:'Não foi possível carregar o portal do fornecedor.')}
    finally{setLoading(false)}
  }

  useEffect(()=>{
    if(!supabase){setLoading(false);setError('Conexão com o banco não configurada.');return}
    let alive=true
    supabase.auth.getSession().then(({data})=>{if(!alive)return;setSession(data.session);if(data.session)void loadSupplier(data.session.user.id);else setLoading(false)})
    const {data:{subscription}}=supabase.auth.onAuthStateChange((_event,next)=>{if(!alive)return;setSession(next);setSupplier(null);if(next)window.setTimeout(()=>{if(alive)void loadSupplier(next.user.id)},0);else{setProducts([]);setItems([]);setSales([]);setPayouts([]);setLoading(false)}})
    return()=>{alive=false;subscription.unsubscribe()}
  },[])

  async function login(e:FormEvent){e.preventDefault();if(!supabase)return;setBusy(true);setError('');try{const {data,error}=await supabase.auth.signInWithPassword({email:username.trim().toLowerCase()+'@eparts-login.invalid',password});if(error)throw error;setSession(data.session);if(data.user)await loadSupplier(data.user.id)}catch(e){setError(e instanceof Error?e.message:'Não foi possível entrar.')}finally{setBusy(false)}}
  async function logout(){await supabase?.auth.signOut();setSession(null);setSupplier(null)}

  const visibleItems=useMemo(()=>items.filter(row=>{const sale=sales.find(x=>x.id===row.sale_id);if(!sale||sale.status==='cancelled')return false;const day=sale.created_at.slice(0,10);return(!from||day>=from)&&(!to||day<=to)}),[items,sales,from,to])
  const gross=visibleItems.reduce((n,x)=>n+Number(x.line_total),0)
  const epartsCommission=visibleItems.reduce((n,x)=>n+Number(x.eparts_commission_amount),0)
  const supplierTotal=visibleItems.reduce((n,x)=>n+Number(x.supplier_amount),0)
  const commissionRate=gross>0?(epartsCommission/gross)*100:12
  const paid=payouts.filter(p=>!from||p.paid_at.slice(0,10)>=from).filter(p=>!to||p.paid_at.slice(0,10)<=to).reduce((n,p)=>n+Number(p.amount),0)
  const eligibleTotal=items.reduce((n,item)=>{const sale=sales.find(x=>x.id===item.sale_id);return sale&&sale.status!=='cancelled'&&sale.payment_status==='paid'?n+Number(item.supplier_amount):n},0)
  const paidAllTime=payouts.reduce((n,p)=>n+Number(p.amount),0)
  const pending=Math.max(0,eligibleTotal-paidAllTime)

  return <main className="ep-supplier-root">
    <style>{`
      .ep-supplier-root{min-height:100vh;padding:28px 16px 48px;background:radial-gradient(ellipse at 50% 12%,#260909 0%,#100707 38%,#050505 78%);color:#f5f5f5;font-family:Inter,system-ui,sans-serif;position:relative;overflow:hidden}
      .ep-supplier-root:before,.ep-supplier-root:after{content:"";position:fixed;pointer-events:none;width:2px;height:55vh;background:linear-gradient(transparent,#f21b24,transparent);box-shadow:0 0 18px #f21b24;transform:rotate(38deg);opacity:.65}
      .ep-supplier-root:before{left:5%;top:-8vh}.ep-supplier-root:after{right:5%;bottom:-8vh}
      .ep-supplier-wrap{width:min(1100px,100%);margin:0 auto;position:relative;z-index:1}
      .ep-supplier-brand{display:flex;align-items:center;justify-content:center;gap:14px;margin:8px 0 28px;text-align:left}
      .ep-supplier-brand-mark{display:grid;place-items:center;width:58px;height:58px;border:1px solid #ff3038;border-radius:15px;color:#ff3038;background:#130909;box-shadow:0 0 22px #ef182744}
      .ep-supplier-brand b{display:block;color:#f5f5f5;font-size:clamp(30px,5vw,48px);font-weight:950;font-style:italic;letter-spacing:2px;text-shadow:0 2px 14px #000}
      .ep-supplier-brand small{display:block;color:#ff343c;font-size:10px;letter-spacing:3px;font-weight:800}
      .ep-supplier-card{padding:22px;border:1px solid #482024;border-radius:17px;background:linear-gradient(145deg,#171313,#090909);box-shadow:0 18px 50px #0009}
      .ep-supplier-login{max-width:720px;margin:0 auto;padding:clamp(22px,5vw,48px);border:1px solid #a82a31;box-shadow:0 0 28px #e51b2430,inset 0 0 30px #e51b2408}
      .ep-supplier-login-head{text-align:center;margin-bottom:26px}
      .ep-supplier-login-icon{display:grid;place-items:center;width:76px;height:76px;margin:0 auto 14px;color:#f21e28;filter:drop-shadow(0 0 9px #ef1827)}
      .ep-supplier-root h1{margin:0 0 8px;color:#fff;font-size:clamp(24px,4vw,34px);font-weight:800}
      .ep-supplier-root p{color:#bdb5b5;line-height:1.55}
      .ep-supplier-login-head p{max-width:430px;margin:8px auto 0;font-size:15px}
      .ep-supplier-root label{display:grid;gap:8px;margin:15px 0;color:#e0dada;font-size:13px;font-weight:650}
      .ep-supplier-field{display:flex;align-items:center;gap:12px;min-height:58px;padding:0 16px;border:1px solid #666;border-radius:13px;background:#080808;color:#aaa}
      .ep-supplier-field:focus-within{border-color:#f02a34;box-shadow:0 0 0 3px #f02a3420}
      .ep-supplier-field input{width:100%;min-width:0;min-height:54px;padding:10px 0;border:0;outline:0;background:transparent;color:#fff;font-size:16px}
      .ep-supplier-field button{min-height:38px;padding:6px;border:0;background:transparent;color:#aaa}
      .ep-supplier-root button{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:46px;padding:11px 16px;border:1px solid #ff3038;border-radius:11px;background:linear-gradient(135deg,#ff252e,#b9000a);color:#fff;font-weight:800;cursor:pointer}
      .ep-supplier-root button:disabled{opacity:.6;cursor:wait}
      .ep-supplier-login-submit{width:100%;min-height:58px!important;margin-top:10px;font-size:17px;box-shadow:0 8px 24px #d900183d}
      .ep-supplier-error{margin:14px 0;padding:12px;border:1px solid #a7353b;border-radius:10px;background:#351012;color:#ffd0d0;font-size:13px}
      .ep-supplier-notice{color:#bdb5b5!important;font-size:12px;text-align:center;margin:20px 0 0}
      .ep-supplier-login-links{display:flex;justify-content:center;gap:0;border-top:1px solid #3b3333;margin-top:26px;padding-top:20px}
      .ep-supplier-login-links span{flex:1;display:flex;flex-direction:column;align-items:center;gap:7px;color:#eee;font-size:12px;font-weight:650}
      .ep-supplier-login-links span+span{border-left:1px solid #514747}
      .ep-supplier-login-links svg{color:#ff343c}
      .ep-supplier-top{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:18px}
      .ep-supplier-top small{color:#ff555c;letter-spacing:1.7px;font-size:9px;font-weight:800}
      .ep-supplier-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin:17px 0}
      .ep-supplier-stat{padding:17px;border:1px solid #54272b;border-radius:13px;background:linear-gradient(145deg,#211416,#121010)}
      .ep-supplier-stat span{display:block;color:#bdb1b1;font-size:11px}
      .ep-supplier-stat strong{display:block;margin-top:9px;color:#ff656b;font-size:22px;overflow-wrap:anywhere}.ep-supplier-stat.ep-highlight{border-color:#9c343a;background:linear-gradient(145deg,#2a1013,#130b0c)}.ep-supplier-stat.ep-highlight strong{color:#ff858a}.ep-supplier-stat.ep-positive strong{color:#80d9a2}
      .ep-supplier-filters{display:flex;gap:10px;flex-wrap:wrap;align-items:end;margin:16px 0}
      .ep-supplier-filters label{min-width:140px;flex:1;margin:0}
      .ep-supplier-root input{width:100%;min-height:46px;padding:11px 13px;border:1px solid #554448;border-radius:10px;background:#090909;color:#fff;font-size:16px}
      .ep-supplier-table-wrap{overflow:auto;border:1px solid #393033;border-radius:12px}
      .ep-supplier-root table{width:100%;border-collapse:collapse;min-width:650px}
      .ep-supplier-root th,.ep-supplier-root td{padding:12px;text-align:left;border-bottom:1px solid #302629;font-size:12px}
      .ep-supplier-root th{color:#ff6b71;background:#1c1113;font-size:10px;letter-spacing:1px}
      .ep-supplier-root td{color:#e4dcdc}
      .ep-supplier-empty{padding:25px;text-align:center;color:#b8adad}
      .ep-supplier-section-title{margin:0 0 14px;color:#ff777d;font-size:16px}
      .ep-supplier-brand-list{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0 18px}.ep-supplier-brand-chip{padding:7px 11px;border:1px solid #743039;border-radius:999px;background:#251014;color:#ffb0b4;font-size:12px;font-weight:700}.ep-supplier-muted{color:#a99d9d;font-size:12px}
      @media(max-width:720px){.ep-supplier-root{padding:18px 12px 30px}.ep-supplier-card{padding:15px}.ep-supplier-login{padding:24px 17px}.ep-supplier-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.ep-supplier-stat{padding:13px}.ep-supplier-stat strong{font-size:19px}.ep-supplier-top{align-items:flex-start;flex-direction:column}.ep-supplier-top button{align-self:flex-end}.ep-supplier-login-links span{font-size:10px}}
      /* Ajustes de organização do portal do fornecedor em telas pequenas */
      .ep-supplier-root{box-sizing:border-box;width:100%;max-width:100%;overflow-x:hidden}
      .ep-supplier-root *{box-sizing:border-box}
      .ep-supplier-wrap{min-width:0;width:100%}
      .ep-supplier-top>div{min-width:0;width:100%}
      .ep-supplier-top h1{overflow-wrap:anywhere}
      .ep-supplier-filters{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;width:100%;min-width:0}
      .ep-supplier-filters label{display:grid;grid-template-columns:minmax(0,1fr);min-width:0;width:100%;flex:none}
      .ep-supplier-filters input{display:block;width:100%;min-width:0;max-width:100%;padding:10px 8px;font-size:14px}
      .ep-supplier-stat{min-width:0}
      .ep-supplier-stat strong{overflow-wrap:anywhere}
      .ep-supplier-empty{padding:18px 12px;line-height:1.5}
      .ep-supplier-card{min-width:0}
      @media(max-width:720px){
        .ep-supplier-root{padding:16px 12px 32px}
        .ep-supplier-brand{justify-content:flex-start;margin:4px 0 24px;gap:12px}
        .ep-supplier-brand-mark{width:50px;height:50px;flex:0 0 50px}
        .ep-supplier-brand b{font-size:34px;letter-spacing:1px}
        .ep-supplier-brand small{font-size:8px;letter-spacing:2px}
        .ep-supplier-top{gap:8px;margin-bottom:14px}
        .ep-supplier-top button{align-self:flex-start}
        .ep-supplier-filters{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin:14px 0}
        .ep-supplier-filters input{font-size:13px;padding:9px 5px}
        .ep-supplier-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;margin:12px 0}
        .ep-supplier-grid>.ep-supplier-stat:last-child:nth-child(odd){grid-column:1/-1}
        .ep-supplier-stat{padding:12px}
        .ep-supplier-stat span{font-size:10px;line-height:1.35}
        .ep-supplier-stat strong{font-size:18px}
        .ep-supplier-card{padding:14px;margin-bottom:12px}
        .ep-supplier-section-title{font-size:15px}
      }
      @media(max-width:380px){
        .ep-supplier-brand b{font-size:29px}
        .ep-supplier-brand small{letter-spacing:1.3px}
        .ep-supplier-filters{grid-template-columns:minmax(0,1fr)}
        .ep-supplier-filters input{font-size:15px;padding:10px}
        .ep-supplier-grid{grid-template-columns:minmax(0,1fr)}
        .ep-supplier-grid>.ep-supplier-stat:last-child:nth-child(odd){grid-column:auto}
      }
    `}</style>
    <div className="ep-supplier-wrap">
      <div className="ep-supplier-brand"><span className="ep-supplier-brand-mark"><Store size={23}/></span><div><b>EPARTS</b><small>PORTAL DO FORNECEDOR</small></div></div>
      {!session?<section className="ep-supplier-card ep-supplier-login">
        <div className="ep-supplier-login-head"><span className="ep-supplier-login-icon"><Store size={76}/></span><h1>Acesso do Fornecedor</h1><p>Acompanhe suas marcas, produtos, vendas e movimentações.</p></div>
        <form onSubmit={login}>
          <label>Usuário<span className="ep-supplier-field"><UserRound size={21}/><input type="text" autoCapitalize="none" autoComplete="username" minLength={4} maxLength={30} required value={username} onChange={e=>setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g,''))} placeholder="Seu usuário"/></span></label>
          <label>Senha<span className="ep-supplier-field"><LockKeyhole size={21}/><input type={showPassword?'text':'password'} autoComplete="current-password" required value={password} onChange={e=>setPassword(e.target.value)} placeholder="Sua senha"/><button type="button" aria-label={showPassword?'Ocultar senha':'Mostrar senha'} onClick={()=>setShowPassword(v=>!v)}>{showPassword?<EyeOff size={19}/>:<Eye size={19}/>}</button></span></label>
          {error&&<div className="ep-supplier-error" role="alert">{error}</div>}
          <button className="ep-supplier-login-submit" type="submit" disabled={busy}><LogIn size={20}/>{busy?'Validando acesso...':'Entrar'}</button>
        </form>
        <p className="ep-supplier-notice">Acesso individual e protegido. Você visualiza somente as informações vinculadas ao seu cadastro.</p>
        <div className="ep-supplier-login-links"><span><ChartNoAxesColumn size={25}/>Vendas</span><span><Package size={25}/>Produtos</span><span><Tag size={25}/>Marcas</span><span><Coins size={25}/>Repasses</span></div>
      </section>:loading?<section className="ep-supplier-card">Carregando seu painel...</section>:!supplier?<section className="ep-supplier-card"><h1>Acesso ainda não vinculado</h1><p>{error||'Peça ao administrador da EPARTS para vincular este usuário ao seu cadastro de fornecedor.'}</p><button onClick={logout}><LogOut size={16}/> Sair</button></section>:<>
        <div className="ep-supplier-top"><div><small>ÁREA EXCLUSIVA DO FORNECEDOR</small><h1>Olá, {supplier.name}</h1><p>Acompanhe seus produtos, vendas e repasses.</p></div><button onClick={()=>void loadSupplier(session.user.id)}><RefreshCw size={16}/> Atualizar</button></div>
        {error&&<div className="ep-supplier-error">{error}</div>}
        <div className="ep-supplier-filters"><label>De<input type="date" value={from} onChange={e=>setFrom(e.target.value)}/></label><label>Até<input type="date" value={to} onChange={e=>setTo(e.target.value)}/></label></div>
        <div className="ep-supplier-grid">
          <div className="ep-supplier-stat"><span>Produtos vinculados</span><strong>{products.length}</strong></div>
          <div className="ep-supplier-stat"><span>Unidades vendidas</span><strong>{visibleItems.reduce((n,x)=>n+Number(x.quantity),0)}</strong></div>
          <div className="ep-supplier-stat"><span>Valor vendido</span><strong>{money(gross)}</strong></div>
          <div className="ep-supplier-stat ep-highlight"><span>Comissão EPARTS ({commissionRate.toLocaleString('pt-BR',{maximumFractionDigits:2})}%)</span><strong>{money(epartsCommission)}</strong></div>
          <div className="ep-supplier-stat ep-positive"><span>Seu valor após comissão</span><strong>{money(supplierTotal)}</strong></div>
        </div>
        <section className="ep-supplier-card" style={{marginBottom:14}}><h2 className="ep-supplier-section-title">Produtos vinculados</h2>
          {products.length===0?<div className="ep-supplier-empty">Nenhum produto vinculado ao seu cadastro.</div>:<div className="ep-supplier-table-wrap"><table><thead><tr><th>PRODUTO</th><th>CÓDIGO</th><th>ESTOQUE ATUAL</th><th>PREÇO DE VENDA</th></tr></thead><tbody>{products.map(p=><tr key={p.id}><td>{p.name}</td><td>{p.sku||'—'}</td><td>{p.stock_quantity}</td><td>{money(p.sale_price)}</td></tr>)}</tbody></table></div>}
        </section>
        <section className="ep-supplier-card" style={{marginBottom:14}}><h2 className="ep-supplier-section-title">Vendas dos seus produtos</h2>
          {visibleItems.length===0?<div className="ep-supplier-empty">Nenhuma venda encontrada neste período.</div>:<div className="ep-supplier-table-wrap"><table><thead><tr><th>PEDIDO</th><th>DATA</th><th>PRODUTO</th><th>QTD.</th><th>VALOR</th><th>EPARTS</th><th>SUA PARTE</th><th>STATUS</th></tr></thead><tbody>{visibleItems.map(item=>{const sale=sales.find(x=>x.id===item.sale_id);return <tr key={item.id}><td>#{sale?.order_number||'—'}</td><td>{sale?date(sale.created_at):date(item.created_at)}</td><td>{item.product_name}</td><td>{item.quantity}</td><td>{money(item.line_total)}</td><td>{money(item.eparts_commission_amount)}</td><td>{money(item.supplier_amount)}</td><td>{sale?.payment_status||sale?.status||'—'}</td></tr>})}</tbody></table></div>}
        </section>
        <section className="ep-supplier-card"><h2 className="ep-supplier-section-title">Repasses</h2><div className="ep-supplier-grid"><div className="ep-supplier-stat"><span>Total pago</span><strong>{money(paid)}</strong></div><div className="ep-supplier-stat"><span>Saldo liberado a receber</span><strong>{money(pending)}</strong></div><div className="ep-supplier-stat"><span>Percentual EPARTS</span><strong>{commissionRate.toLocaleString('pt-BR',{maximumFractionDigits:2})}%</strong></div></div>
          {payouts.length===0?<div className="ep-supplier-empty">Ainda não há repasses registrados.</div>:<div className="ep-supplier-table-wrap"><table><thead><tr><th>DATA</th><th>VALOR</th><th>FORMA</th><th>REFERÊNCIA / OBSERVAÇÃO</th></tr></thead><tbody>{payouts.map(p=><tr key={p.id}><td>{date(p.paid_at)}</td><td>{money(p.amount)}</td><td>{p.payment_method}</td><td>{[p.reference,p.notes].filter(Boolean).join(' · ')||'—'}</td></tr>)}</tbody></table></div>}
        </section>
        <p style={{textAlign:'right',marginTop:16}}><button onClick={logout}><LogOut size={16}/> Sair do portal</button></p>
      </>}
    </div>
  </main>
}
