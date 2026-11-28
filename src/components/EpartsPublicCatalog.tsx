import {useEffect,useMemo,useState,type FormEvent,type CSSProperties} from 'react'
import {Search,ShoppingBag,Plus,Minus,ArrowLeft,RefreshCw,Store} from 'lucide-react'
import {supabase} from '../lib/supabase'

const COMPANY_ID='336c5941-6f23-418e-968e-730442650d98'
type Product={product_id:string;name:string;description:string|null;sku:string|null;image_url:string|null;sale_price:number;brand_name:string|null;in_stock:boolean}
type CartItem={product:Product;quantity:number}
const money=(v:number)=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})

export default function EpartsPublicCatalog(){
 const [products,setProducts]=useState<Product[]>([])
 const [cart,setCart]=useState<CartItem[]>([])
 const [search,setSearch]=useState('')
 const [loading,setLoading]=useState(true)
 const [error,setError]=useState('')
 const [notice,setNotice]=useState('')
 const [checkout,setCheckout]=useState(false)
 const [busy,setBusy]=useState(false)
 const [customer,setCustomer]=useState({name:'',phone:'',email:'',address:'',notes:''})
 const [order,setOrder]=useState<string|null>(null)
 async function load(){
  if(!supabase){setError('Catálogo indisponível no momento.');setLoading(false);return}
  setLoading(true);setError('')
  const {data,error}=await supabase.rpc('eparts_public_catalog',{p_company_id:COMPANY_ID})
  if(error)setError('Não foi possível carregar os produtos. Tente novamente.')
  else setProducts((data||[]) as Product[])
  setLoading(false)
 }
 useEffect(()=>{void load()},[])
 const visible=useMemo(()=>products.filter(p=>[p.name,p.sku||'',p.brand_name||''].join(' ').toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR'))),[products,search])
 const total=cart.reduce((n,i)=>n+i.product.sale_price*i.quantity,0)
 const quantity=cart.reduce((n,i)=>n+i.quantity,0)
 function add(product:Product){setCart(old=>{const found=old.find(i=>i.product.product_id===product.product_id);return found?old.map(i=>i.product.product_id===product.product_id?{...i,quantity:i.quantity+1}:i):[...old,{product,quantity:1}]})}
 function change(id:string,delta:number){setCart(old=>old.map(i=>i.product.product_id===id?{...i,quantity:i.quantity+delta}:i).filter(i=>i.quantity>0))}
 async function submit(e:FormEvent){
  e.preventDefault();if(!supabase||!cart.length)return
  setBusy(true);setError('');setNotice('')
  try{
   const {data,error}=await supabase.rpc('eparts_public_checkout',{p_company_id:COMPANY_ID,p_items:cart.map(i=>({product_id:i.product.product_id,quantity:i.quantity})),p_customer_name:customer.name,p_customer_phone:customer.phone,p_customer_email:customer.email||null,p_customer_address:customer.address?{text:customer.address}:{},p_notes:customer.notes||null})
   if(error)throw error
   setOrder(String(data));setCart([]);setCheckout(false);setNotice('Pedido enviado! A equipe Eparts entrará em contato para confirmar o atendimento.');await load()
  }catch(err){setError(err instanceof Error?err.message:'Não foi possível finalizar o pedido. Confira seus dados e tente novamente.')}
  finally{setBusy(false)}
 }
 return <main className="ep-public">
  <style>{`
   .ep-public{min-height:100vh;background:#08090b;color:#f7f4f2;font-family:Inter,system-ui,sans-serif;overflow-x:hidden}
   .ep-public *{box-sizing:border-box}
   .ep-store-header{position:sticky;top:0;z-index:5;background:rgba(8,9,11,.9);backdrop-filter:blur(18px);border-bottom:1px solid #282126}
   .ep-store-head-inner{width:min(1240px,100%);min-height:76px;margin:auto;padding:12px 24px;display:flex;align-items:center;justify-content:space-between;gap:18px}
   .ep-store-brand{display:flex;align-items:center;gap:12px;min-width:0}
   .ep-store-mark{width:44px;height:44px;display:grid;place-items:center;border-radius:13px;background:linear-gradient(145deg,#ff3449,#a60019);box-shadow:0 8px 24px #ed142c35;color:white}
   .ep-store-brand strong{display:block;font-size:21px;letter-spacing:2px;font-weight:950}
   .ep-store-brand small{display:block;color:#a8a0a2;font-size:9px;letter-spacing:2.4px;font-weight:800}
   .ep-store-cart{border:1px solid #ed3449;border-radius:12px;background:linear-gradient(120deg,#ed142c,#a9001a);color:white;padding:12px 16px;font-weight:800;display:flex;align-items:center;gap:9px;cursor:pointer;box-shadow:0 8px 24px #ed142c22}
   .ep-store-hero{width:min(1240px,100%);margin:0 auto;padding:52px 24px 28px}
   .ep-store-hero-box{position:relative;overflow:hidden;border:1px solid #4c2630;border-radius:26px;padding:clamp(28px,6vw,68px);background:radial-gradient(ellipse at 85% 10%,#4a101c 0%,transparent 42%),linear-gradient(120deg,#1a1115,#0d0d10 68%);box-shadow:0 24px 70px #0007}
   .ep-store-hero-box:after{content:"";position:absolute;width:260px;height:260px;right:-90px;bottom:-150px;border:1px solid #ed344933;border-radius:50%;box-shadow:0 0 0 28px #ed34490a,0 0 0 58px #ed344907}
   .ep-store-kicker{color:#ff6676;font-size:11px;letter-spacing:3px;font-weight:900}
   .ep-store-hero h1{max-width:700px;margin:14px 0 12px;font-size:clamp(34px,6vw,60px);line-height:1.03;letter-spacing:-1.8px}
   .ep-store-hero h1 em{font-style:normal;color:#ff4055}
   .ep-store-hero p{max-width:560px;color:#bcb4b7;font-size:16px;line-height:1.65;margin:0}
   .ep-store-searchbar{display:flex;align-items:center;gap:12px;max-width:650px;margin:24px 0 0;padding:0 14px;border:1px solid #55323a;border-radius:14px;background:#0b0b0e;box-shadow:0 12px 30px #0005}
   .ep-store-searchbar input{flex:1;min-width:0;border:0;outline:0;background:transparent;color:white;padding:16px 0;font-size:15px}
   .ep-store-searchbar button{border:0;background:transparent;color:#aaa;cursor:pointer;padding:8px}
   .ep-store-section{width:min(1240px,100%);margin:0 auto;padding:22px 24px 76px}
   .ep-store-section-head{display:flex;align-items:end;justify-content:space-between;gap:16px;margin:10px 0 22px}
   .ep-store-section-head small{color:#ff6374;font-size:10px;letter-spacing:2.5px;font-weight:900}
   .ep-store-section-head h2{font-size:26px;margin:6px 0 0;letter-spacing:-.5px}
   .ep-store-count{color:#9e9699;font-size:12px}
   .ep-store-products{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,245px),1fr));gap:18px}
   .ep-store-product{min-width:0;overflow:hidden;border:1px solid #34232a;border-radius:18px;background:linear-gradient(150deg,#171417,#0e0e11);transition:transform .2s,border-color .2s,box-shadow .2s}
   .ep-store-product:hover{transform:translateY(-3px);border-color:#9b3445;box-shadow:0 16px 34px #0007}
   .ep-store-product-image{height:220px;display:grid;place-items:center;padding:18px;background:radial-gradient(ellipse at center,#292025,#111114 70%);border-bottom:1px solid #30232a}
   .ep-store-product-image img{width:100%;height:100%;object-fit:contain}
   .ep-store-product-placeholder{color:#66565b}
   .ep-store-product-body{padding:17px}
   .ep-store-product-brand{color:#ff6878;font-size:10px;letter-spacing:1.8px;font-weight:900;text-transform:uppercase}
   .ep-store-product h3{font-size:16px;line-height:1.35;margin:8px 0;color:#fff;min-height:43px}
   .ep-store-product-desc{font-size:12px;line-height:1.5;color:#a69da0;min-height:36px;margin:0 0 12px}
   .ep-store-product-price{font-size:23px;font-weight:900;letter-spacing:-.5px}
   .ep-store-stock{font-size:11px;margin:8px 0 14px;display:flex;align-items:center;gap:7px}
   .ep-store-stock:before{content:"";width:7px;height:7px;border-radius:50%;background:currentColor}
   .ep-store-add{width:100%;min-height:45px;border:1px solid #f04459;border-radius:11px;background:linear-gradient(110deg,#ed142c,#a5001b);color:white;font-weight:850;cursor:pointer}
   .ep-store-add:disabled{background:#343034;border-color:#484148;color:#aaa;cursor:not-allowed}
   .ep-store-message{padding:14px 16px;margin:0 0 18px;border-radius:12px;border:1px solid #38734c;background:#10271a;color:#b9f2c8;line-height:1.5}
   .ep-store-error{border-color:#853440;background:#2b1117;color:#ffc1c8}
   .ep-store-empty{grid-column:1/-1;padding:50px 20px;text-align:center;border:1px dashed #4b343b;border-radius:18px;color:#aaa}
   .ep-store-footer{border-top:1px solid #2b2025;padding:22px 24px;text-align:center;color:#777;font-size:11px;letter-spacing:1px}
   .ep-store-drawer{position:fixed;inset:0;z-index:20;background:#000b;display:flex;justify-content:flex-end}
   .ep-store-drawer-panel{width:min(100%,520px);height:100%;overflow-y:auto;background:#100d10;border-left:1px solid #5a2631;padding:24px;box-shadow:-20px 0 70px #0008}
   .ep-store-back{display:flex;align-items:center;gap:8px;background:transparent;border:0;color:#ddd;padding:8px 0;cursor:pointer}
   .ep-store-drawer h2{font-size:26px;margin:20px 0}
   .ep-store-cart-row{display:flex;justify-content:space-between;gap:14px;padding:14px 0;border-bottom:1px solid #35282e}
   .ep-store-qty{display:flex;align-items:center;gap:12px;margin-top:10px}
   .ep-store-qty button{width:30px;height:30px;border:1px solid #74404a;border-radius:8px;background:#21151a;color:white;cursor:pointer}
   .ep-store-form{display:grid;gap:12px;margin-top:22px}
   .ep-store-form h3{margin:0 0 4px}
   .ep-store-form input,.ep-store-form textarea{width:100%;min-height:48px;padding:13px;border:1px solid #52343c;border-radius:10px;background:#171216;color:#fff;font:inherit;outline:none}
   .ep-store-form input:focus,.ep-store-form textarea:focus{border-color:#f04459;box-shadow:0 0 0 3px #f0445920}
   .ep-store-submit{border:0;border-radius:11px;padding:15px;background:linear-gradient(110deg,#ed142c,#a5001b);color:#fff;font-weight:900;cursor:pointer}
   .ep-store-submit:disabled{opacity:.55}
   @media(max-width:640px){
    .ep-store-head-inner{min-height:66px;padding:10px 14px}
    .ep-store-mark{width:39px;height:39px}
    .ep-store-brand strong{font-size:18px}
    .ep-store-cart{padding:10px 12px;font-size:12px}
    .ep-store-hero{padding:22px 14px 12px}
    .ep-store-hero-box{padding:27px 21px;border-radius:20px}
    .ep-store-hero h1{font-size:37px;letter-spacing:-1px}
    .ep-store-hero p{font-size:14px}
    .ep-store-searchbar{margin-top:20px}
    .ep-store-section{padding:18px 14px 52px}
    .ep-store-section-head h2{font-size:22px}
    .ep-store-products{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
    .ep-store-product{border-radius:14px}
    .ep-store-product-image{height:150px;padding:10px}
    .ep-store-product-body{padding:12px}
    .ep-store-product h3{font-size:13px;min-height:35px}
    .ep-store-product-desc{font-size:11px;min-height:30px}
    .ep-store-product-price{font-size:17px}
    .ep-store-stock{font-size:10px}
    .ep-store-add{font-size:11px;padding:9px 5px}
    .ep-store-drawer-panel{padding:18px 15px}
   }
   @media(max-width:360px){.ep-store-products{grid-template-columns:minmax(0,1fr)}.ep-store-product-image{height:210px}}
  `}</style>
  <header className="ep-store-header"><div className="ep-store-head-inner">
   <div className="ep-store-brand"><span className="ep-store-mark"><Store size={22}/></span><div><strong>EPARTS</strong><small>CATÁLOGO ONLINE</small></div></div>
   <button className="ep-store-cart" onClick={()=>setCheckout(true)}><ShoppingBag size={17}/> Carrinho <span>({quantity})</span><b>{money(total)}</b></button>
  </div></header>
  <section className="ep-store-hero"><div className="ep-store-hero-box">
   <div className="ep-store-kicker">TECNOLOGIA • ACESSÓRIOS • CONFIANÇA</div>
   <h1>Seu próximo produto<br/><em>está aqui.</em></h1>
   <p>Explore nosso catálogo, encontre o que precisa e envie seu pedido em poucos passos.</p>
   <div className="ep-store-searchbar"><Search size={19} color="#aaa"/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar produto, marca ou código..."/><button onClick={()=>void load()} title="Atualizar catálogo"><RefreshCw size={17}/></button></div>
  </div></section>
  <section className="ep-store-section">
   {error&&<div className="ep-store-message ep-store-error">{error}</div>}{notice&&<div className="ep-store-message">{notice}{order&&<span> Número do pedido: {order}</span>}</div>}
   <div className="ep-store-section-head"><div><small>SELEÇÃO EPARTS</small><h2>Produtos disponíveis</h2></div><span className="ep-store-count">{loading?'Atualizando catálogo…':visible.length+' produtos'}</span></div>
   {loading?<div className="ep-store-empty">Carregando produtos…</div>:visible.length===0?<div className="ep-store-empty">Nenhum produto encontrado. Tente outro nome ou código.</div>:<div className="ep-store-products">
    {visible.map(p=><article className="ep-store-product" key={p.product_id}>
     <div className="ep-store-product-image">{p.image_url?<img src={p.image_url} alt={p.name}/>:<span className="ep-store-product-placeholder"><ShoppingBag size={44}/></span>}</div>
     <div className="ep-store-product-body">{p.brand_name&&<div className="ep-store-product-brand">{p.brand_name}</div>}<h3>{p.name}</h3><p className="ep-store-product-desc">{p.description||'Produto selecionado no catálogo EPARTS.'}</p><div className="ep-store-product-price">{money(p.sale_price)}</div><div className="ep-store-stock" style={{color:p.in_stock?'#83d7a0':'#f18c99'}}>{p.in_stock?'Disponível':'Sem estoque'}</div><button className="ep-store-add" disabled={!p.in_stock} onClick={()=>add(p)}>{p.in_stock?'Adicionar ao carrinho':'Indisponível'}</button></div>
    </article>)}
   </div>}
  </section>
  <footer className="ep-store-footer">EPARTS · CATÁLOGO ONLINE</footer>
  {checkout&&<div className="ep-store-drawer" role="dialog" aria-modal="true" aria-label="Seu pedido"><section className="ep-store-drawer-panel">
   <button className="ep-store-back" onClick={()=>setCheckout(false)}><ArrowLeft size={18}/> Voltar ao catálogo</button><h2>Seu pedido</h2>
   {cart.length===0?<p style={{color:'#aaa'}}>Seu carrinho está vazio.</p>:<div>{cart.map(i=><div className="ep-store-cart-row" key={i.product.product_id}><div><b>{i.product.name}</b><div style={{color:'#aaa',fontSize:13,marginTop:5}}>{money(i.product.sale_price)} cada</div><div className="ep-store-qty"><button type="button" onClick={()=>change(i.product.product_id,-1)}><Minus size={14}/></button>{i.quantity}<button type="button" onClick={()=>change(i.product.product_id,1)}><Plus size={14}/></button></div></div><b>{money(i.product.sale_price*i.quantity)}</b></div>)}<h3 style={{textAlign:'right',marginTop:18}}>Total: {money(total)}</h3></div>}
   <form className="ep-store-form" onSubmit={submit}><h3>Dados para contato</h3><input required minLength={2} placeholder="Nome completo" value={customer.name} onChange={e=>setCustomer(v=>({...v,name:e.target.value}))}/><input required placeholder="WhatsApp com DDD" value={customer.phone} onChange={e=>setCustomer(v=>({...v,phone:e.target.value}))}/><input type="email" placeholder="E-mail (opcional)" value={customer.email} onChange={e=>setCustomer(v=>({...v,email:e.target.value}))}/><input placeholder="Endereço (opcional)" value={customer.address} onChange={e=>setCustomer(v=>({...v,address:e.target.value}))}/><textarea placeholder="Observações (opcional)" value={customer.notes} onChange={e=>setCustomer(v=>({...v,notes:e.target.value}))}/>{error&&<div className="ep-store-message ep-store-error">{error}</div>}<button className="ep-store-submit" disabled={busy||cart.length===0}>{busy?'Enviando pedido…':'Enviar pedido'}</button><small style={{color:'#91878b',lineHeight:1.5}}>O envio registra uma solicitação de pedido. A equipe confirmará disponibilidade, pagamento e entrega.</small></form>
  </section></div>}
 </main>
}
const field:CSSProperties={width:'100%',boxSizing:'border-box',background:'#171012',border:'1px solid #5b3037',borderRadius:9,padding:13,color:'#fff',outline:'none'}
