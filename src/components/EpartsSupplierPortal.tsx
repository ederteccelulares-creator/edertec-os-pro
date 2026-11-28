import { useEffect, useMemo, useState, type FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { LogOut, RefreshCw, Store } from 'lucide-react'
import { supabase } from '../lib/supabase'

type Supplier = { id:string; company_id:string; name:string; email:string|null; user_id:string|null }
type Product = { id:string; name:string; sku:string|null; stock_quantity:number; sale_price:number; image_url:string|null }
type SaleItem = { id:string; sale_id:string; product_id:string; product_name:string; sku:string|null; quantity:number; unit_price:number; line_total:number; eparts_commission_amount:number; supplier_amount:number; created_at:string }
type Sale = { id:string; order_number:number; status:string; payment_status:string; created_at:string }
type Payout = { id:string; amount:number; payment_method:string; paid_at:string; reference:string|null; notes:string|null }

const money=(value:number)=>Number(value||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})
const date=(value:string)=>new Date(value).toLocaleDateString('pt-BR')

export default function EpartsSupplierPortal(){
  const [session,setSession]=useState<Session|null>(null)
  const [supplier,setSupplier]=useState<Supplier|null>(null)
  const [products,setProducts]=useState<Product[]>([])
  const [items,setItems]=useState<SaleItem[]>([])
  const [sales,setSales]=useState<Sale[]>([])
  const [payouts,setPayouts]=useState<Payout[]>([])
  const [username,setUsername]=useState('')
  const [password,setPassword]=useState('')
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
      if(!profile){setSupplier(null);setProducts([]);setItems([]);setSales([]);setPayouts([]);setError('Este usuário ainda não está vinculado a um cadastro de fornecedor da EPARTS. Peça ao administrador para vincular seu acesso.');return}
      setSupplier(profile as Supplier)
      const [p,i,po]=await Promise.all([
        supabase.from('eparts_products').select('id,name,sku,stock_quantity,sale_price,image_url').eq('company_id',profile.company_id).eq('supplier_id',profile.id).order('name'),
        supabase.from('eparts_sale_items').select('id,sale_id,product_id,product_name,sku,quantity,unit_price,line_total,eparts_commission_amount,supplier_amount,created_at').eq('company_id',profile.company_id).eq('supplier_id',profile.id).order('created_at',{ascending:false}),
        supabase.from('eparts_supplier_payouts').select('id,amount,payment_method,paid_at,reference,notes').eq('company_id',profile.company_id).eq('supplier_id',profile.id).order('paid_at',{ascending:false})
      ])
      if(p.error) throw p.error;if(i.error) throw i.error;if(po.error) throw po.error
      const itemRows=(i.data||[]) as SaleItem[]
      const saleIds=[...new Set(itemRows.map(row=>row.sale_id))]
      let saleRows:Sale[]=[]
      if(saleIds.length){
        const {data,error}=await supabase.from('eparts_sales').select('id,order_number,status,payment_status,created_at').eq('company_id',profile.company_id).in('id',saleIds)
        if(error) throw error
        saleRows=(data||[]) as Sale[]
      }
      setProducts((p.data||[]) as Product[]);setItems(itemRows);setSales(saleRows);setPayouts((po.data||[]) as Payout[])
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

  const visibleItems=useMemo(()=>items.filter(row=>{const sale=sales.find(x=>x.id===row.sale_id);if(!sale)return false;const day=sale.created_at.slice(0,10);return(!from||day>=from)&&(!to||day<=to)}),[items,sales,from,to])
  const gross=visibleItems.reduce((n,x)=>n+Number(x.line_total),0)
  const supplierTotal=visibleItems.reduce((n,x)=>n+Number(x.supplier_amount),0)
  const paid=payouts.filter(p=>!from||p.paid_at.slice(0,10)>=from).filter(p=>!to||p.paid_at.slice(0,10)<=to).reduce((n,p)=>n+Number(p.amount),0)
  const pending=Math.max(0,supplierTotal-paid)

  return <main className="ep-supplier-root">
    <style>{`
      .ep-supplier-root{min-height:100vh;padding:22px 15px 44px;background:radial-gradient(ellipse at 50% 0%,#352714 0%,#0a0908 42%);color:#f5efe4;font-family:Inter,system-ui,sans-serif}
      .ep-supplier-wrap{width:min(1100px,100%);margin:0 auto}
      .ep-supplier-brand{display:flex;align-items:center;gap:12px;margin:6px 0 30px}
      .ep-supplier-brand-mark{display:grid;place-items:center;width:46px;height:46px;border:1px solid #b88b43;border-radius:13px;color:#e9c778;background:#1a160f}
      .ep-supplier-brand b{display:block;color:#f2d18b;font-size:19px;letter-spacing:2px}
      .ep-supplier-brand small{color:#a99a7e;font-size:9px;letter-spacing:1.5px}
      .ep-supplier-card{padding:22px;border:1px solid #4b3b25;border-radius:17px;background:linear-gradient(145deg,#191714,#0f0e0d);box-shadow:0 18px 50px #0007}
      .ep-supplier-login{max-width:460px;margin:8vh auto}
      .ep-supplier-root h1{margin:0 0 8px;color:#f3d797;font-size:27px}
      .ep-supplier-root p{color:#b8ad9b;line-height:1.55}
      .ep-supplier-root label{display:grid;gap:7px;margin:14px 0;color:#d9c9aa;font-size:12px;font-weight:650}
      .ep-supplier-root input{width:100%;min-height:46px;padding:11px 13px;border:1px solid #4b4030;border-radius:10px;background:#090909;color:#fff;font-size:16px}
      .ep-supplier-root button{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:43px;padding:10px 14px;border:1px solid #b58b43;border-radius:10px;background:linear-gradient(135deg,#d8b36a,#a87932);color:#17120a;font-weight:750}
      .ep-supplier-root button:disabled{opacity:.6}
      .ep-supplier-error{margin:14px 0;padding:12px;border:1px solid #7e3939;border-radius:10px;background:#351717;color:#ffd0d0;font-size:13px}
      .ep-supplier-notice{color:#e8cf94!important;font-size:13px}
      .ep-supplier-top{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:18px}
      .ep-supplier-top small{color:#c5a56a;letter-spacing:1.7px;font-size:9px;font-weight:800}
      .ep-supplier-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin:17px 0}
      .ep-supplier-stat{padding:17px;border:1px solid #51432e;border-radius:13px;background:linear-gradient(145deg,#211c14,#121110)}
      .ep-supplier-stat span{display:block;color:#bdb19c;font-size:11px}
      .ep-supplier-stat strong{display:block;margin-top:9px;color:#f0cf83;font-size:22px;overflow-wrap:anywhere}
      .ep-supplier-filters{display:flex;gap:10px;flex-wrap:wrap;align-items:end;margin:16px 0}
      .ep-supplier-filters label{min-width:140px;flex:1;margin:0}
      .ep-supplier-table-wrap{overflow:auto;border:1px solid #393126;border-radius:12px}
      .ep-supplier-root table{width:100%;border-collapse:collapse;min-width:650px}
      .ep-supplier-root th,.ep-supplier-root td{padding:12px;text-align:left;border-bottom:1px solid #30291f;font-size:12px}
      .ep-supplier-root th{color:#d7b873;background:#1c1812;font-size:10px;letter-spacing:1px}
      .ep-supplier-root td{color:#e4dccd}
      .ep-supplier-empty{padding:25px;text-align:center;color:#b8ad9b}
      .ep-supplier-section-title{margin:0 0 14px;color:#f2d797;font-size:16px}
      @media(max-width:720px){.ep-supplier-root{padding:16px 12px 30px}.ep-supplier-card{padding:15px}.ep-supplier-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.ep-supplier-stat{padding:13px}.ep-supplier-stat strong{font-size:19px}.ep-supplier-top{align-items:flex-start;flex-direction:column}.ep-supplier-top button{align-self:flex-end}}
    `}</style>
    <div className="ep-supplier-wrap">
      <div className="ep-supplier-brand"><span className="ep-supplier-brand-mark"><Store size={23}/></span><div><b>EPARTS</b><small>PORTAL DO FORNECEDOR</small></div></div>
      {!session?<section className="ep-supplier-card ep-supplier-login">
        <h1>Acesso do fornecedor</h1><p>Entre com o usuário e a senha fornecidos pelo administrador da EPARTS.</p>
        <form onSubmit={login}><label>Usuário<input type="text" autoCapitalize="none" autoComplete="username" minLength={4} maxLength={30} required value={username} onChange={e=>setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g,''))} placeholder="Seu usuário"/></label><label>Senha<input type="password" autoComplete="current-password" required value={password} onChange={e=>setPassword(e.target.value)}/></label>
          {error&&<div className="ep-supplier-error">{error}</div>}<button type="submit" disabled={busy}>{busy?'Validando acesso...':'Entrar no portal'}</button>
        </form><p className="ep-supplier-notice">O acesso é individual. Cada fornecedor visualiza somente seus próprios produtos, vendas e repasses.</p>
      </section>:loading?<section className="ep-supplier-card">Carregando seu painel...</section>:!supplier?<section className="ep-supplier-card"><h1>Acesso ainda não vinculado</h1><p>{error||'Peça ao administrador da EPARTS para vincular este usuário ao seu cadastro de fornecedor.'}</p><button onClick={logout}><LogOut size={16}/> Sair</button></section>:<>
        <div className="ep-supplier-top"><div><small>ÁREA EXCLUSIVA DO FORNECEDOR</small><h1>Olá, {supplier.name}</h1><p>Acompanhe seus produtos, vendas e repasses.</p></div><button onClick={()=>void loadSupplier(session.user.id)}><RefreshCw size={16}/> Atualizar</button></div>
        {error&&<div className="ep-supplier-error">{error}</div>}
        <div className="ep-supplier-filters"><label>De<input type="date" value={from} onChange={e=>setFrom(e.target.value)}/></label><label>Até<input type="date" value={to} onChange={e=>setTo(e.target.value)}/></label></div>
        <div className="ep-supplier-grid">
          <div className="ep-supplier-stat"><span>Produtos vinculados</span><strong>{products.length}</strong></div>
          <div className="ep-supplier-stat"><span>Unidades vendidas</span><strong>{visibleItems.reduce((n,x)=>n+Number(x.quantity),0)}</strong></div>
          <div className="ep-supplier-stat"><span>Valor vendido</span><strong>{money(gross)}</strong></div>
          <div className="ep-supplier-stat"><span>Seu valor previsto</span><strong>{money(supplierTotal)}</strong></div>
        </div>
        <section className="ep-supplier-card" style={{marginBottom:14}}><h2 className="ep-supplier-section-title">Produtos vinculados</h2>
          {products.length===0?<div className="ep-supplier-empty">Nenhum produto vinculado ao seu cadastro.</div>:<div className="ep-supplier-table-wrap"><table><thead><tr><th>PRODUTO</th><th>CÓDIGO</th><th>ESTOQUE ATUAL</th><th>PREÇO DE VENDA</th></tr></thead><tbody>{products.map(p=><tr key={p.id}><td>{p.name}</td><td>{p.sku||'—'}</td><td>{p.stock_quantity}</td><td>{money(p.sale_price)}</td></tr>)}</tbody></table></div>}
        </section>
        <section className="ep-supplier-card" style={{marginBottom:14}}><h2 className="ep-supplier-section-title">Vendas dos seus produtos</h2>
          {visibleItems.length===0?<div className="ep-supplier-empty">Nenhuma venda encontrada neste período.</div>:<div className="ep-supplier-table-wrap"><table><thead><tr><th>PEDIDO</th><th>DATA</th><th>PRODUTO</th><th>QTD.</th><th>VALOR</th><th>SUA PARTE</th><th>STATUS</th></tr></thead><tbody>{visibleItems.map(item=>{const sale=sales.find(x=>x.id===item.sale_id);return <tr key={item.id}><td>#{sale?.order_number||'—'}</td><td>{sale?date(sale.created_at):date(item.created_at)}</td><td>{item.product_name}</td><td>{item.quantity}</td><td>{money(item.line_total)}</td><td>{money(item.supplier_amount)}</td><td>{sale?.payment_status||sale?.status||'—'}</td></tr>})}</tbody></table></div>}
        </section>
        <section className="ep-supplier-card"><h2 className="ep-supplier-section-title">Repasses</h2><div className="ep-supplier-grid"><div className="ep-supplier-stat"><span>Total pago</span><strong>{money(paid)}</strong></div><div className="ep-supplier-stat"><span>Saldo estimado</span><strong>{money(pending)}</strong></div></div>
          {payouts.length===0?<div className="ep-supplier-empty">Ainda não há repasses registrados.</div>:<div className="ep-supplier-table-wrap"><table><thead><tr><th>DATA</th><th>VALOR</th><th>FORMA</th><th>REFERÊNCIA</th></tr></thead><tbody>{payouts.map(p=><tr key={p.id}><td>{date(p.paid_at)}</td><td>{money(p.amount)}</td><td>{p.payment_method}</td><td>{p.reference||p.notes||'—'}</td></tr>)}</tbody></table></div>}
        </section>
        <p style={{textAlign:'right',marginTop:16}}><button onClick={logout}><LogOut size={16}/> Sair do portal</button></p>
      </>}
    </div>
  </main>
}
