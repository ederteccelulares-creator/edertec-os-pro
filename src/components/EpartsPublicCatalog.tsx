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
 return <main style={{minHeight:'100vh',background:'#090909',color:'#f5f5f5',fontFamily:'Inter,system-ui,sans-serif'}}>
  <header style={{position:'sticky',top:0,zIndex:5,background:'#111e',backdropFilter:'blur(14px)',borderBottom:'1px solid #292929',padding:'16px max(20px,calc((100% - 1180px)/2)',display:'flex',justifyContent:'space-between',alignItems:'center',gap:16}}>
   <div style={{display:'flex',alignItems:'center',gap:12}}><span style={{background:'#ed142c',color:'#fff',padding:10,borderRadius:12}}><Store size={22}/></span><div><b style={{letterSpacing:2,fontSize:20}}>EPARTS</b><div style={{fontSize:11,color:'#aaa'}}>CATÁLOGO ONLINE</div></div></div>
   <button onClick={()=>setCheckout(true)} style={{background:'#ed142c',color:'#111',border:0,borderRadius:10,padding:'11px 16px',fontWeight:800,display:'flex',alignItems:'center',gap:8,cursor:'pointer'}}><ShoppingBag size={17}/> Carrinho ({quantity}) · {money(total)}</button>
  </header>
  <section style={{maxWidth:1180,margin:'0 auto',padding:'38px 20px 70px'}}>
   <div style={{marginBottom:28}}><div style={{color:'#ed142c',fontSize:12,letterSpacing:3,fontWeight:800}}>TECNOLOGIA E ACESSÓRIOS</div><h1 style={{fontSize:'clamp(30px,5vw,48px)',margin:'10px 0'}}>Encontre o que você procura.</h1><p style={{color:'#aaa',margin:0}}>Confira os produtos disponíveis no catálogo Eparts.</p></div>
   <div style={{display:'flex',gap:10,alignItems:'center',background:'#171717',border:'1px solid #5b3037',borderRadius:12,padding:'0 14px',maxWidth:520,marginBottom:24}}><Search size={18} color="#aaa"/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar produto, marca ou código..." style={{background:'transparent',border:0,outline:0,color:'white',padding:'14px 0',width:'100%'}}/><button onClick={()=>void load()} title="Atualizar catálogo" style={{background:'transparent',border:0,color:'#aaa',cursor:'pointer'}}><RefreshCw size={17}/></button></div>
   {error&&<p style={{color:'#ff8d8d'}}>{error}</p>}{notice&&<p style={{background:'#173222',padding:14,borderRadius:10,color:'#a7efba'}}>{notice}{order&&<span> Número do pedido: {order}</span>}</p>}
   {loading?<p style={{color:'#aaa'}}>Carregando catálogo...</p>:visible.length===0?<p style={{color:'#aaa'}}>Nenhum produto disponível encontrado.</p>:<div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(min(100%,230px),1fr))',gap:18}}>
    {visible.map(p=><article key={p.product_id} style={{background:'#151515',border:'1px solid #64202a',borderRadius:16,overflow:'hidden'}}>
     <div style={{height:190,background:'#202020',display:'grid',placeItems:'center'}}>{p.image_url?<img src={p.image_url} alt={p.name} style={{width:'100%',height:'100%',objectFit:'contain'}}/>:<span style={{color:'#666'}}><ShoppingBag size={42}/></span>}</div>
     <div style={{padding:16}}>{p.brand_name&&<small style={{color:'#ed142c'}}>{p.brand_name}</small>}<h2 style={{fontSize:17,margin:'6px 0'}}>{p.name}</h2>{p.description&&<p style={{color:'#999',fontSize:13,minHeight:34}}>{p.description}</p>}<b style={{fontSize:20}}>{money(p.sale_price)}</b><div style={{color:p.in_stock?'#87d69b':'#f39b9b',fontSize:12,margin:'8px 0 14px'}}>{p.in_stock?'Disponível':'Sem estoque'}</div><button disabled={!p.in_stock} onClick={()=>add(p)} style={{width:'100%',border:0,borderRadius:9,padding:12,background:p.in_stock?'linear-gradient(110deg,#ed142c,#850012)':'#444',color:'#fff',fontWeight:800,cursor:p.in_stock?'pointer':'not-allowed'}}>Adicionar ao carrinho</button></div>
    </article>)}
   </div>}
  </section>
  {checkout&&<div role="dialog" aria-modal="true" style={{position:'fixed',inset:0,zIndex:10,background:'#000c',display:'flex',justifyContent:'flex-end'}}>
   <section style={{width:'min(100%,520px)',height:'100%',overflowY:'auto',background:'#100c0d',borderLeft:'1px solid #64202a',padding:22}}>
    <button onClick={()=>setCheckout(false)} style={{background:'transparent',border:0,color:'#ddd',display:'flex',alignItems:'center',gap:8,cursor:'pointer'}}><ArrowLeft size={18}/> Voltar ao catálogo</button><h2>Seu pedido</h2>
    {cart.length===0?<p style={{color:'#aaa'}}>Seu carrinho está vazio.</p>:<div style={{display:'grid',gap:12}}>{cart.map(i=><div key={i.product.product_id} style={{display:'flex',justifyContent:'space-between',gap:12,borderBottom:'1px solid #333',paddingBottom:12}}><div><b>{i.product.name}</b><div style={{color:'#aaa'}}>{money(i.product.sale_price)} cada</div><div style={{display:'flex',alignItems:'center',gap:12,marginTop:8}}><button onClick={()=>change(i.product.product_id,-1)}><Minus size={14}/></button>{i.quantity}<button onClick={()=>change(i.product.product_id,1)}><Plus size={14}/></button></div></div><b>{money(i.product.sale_price*i.quantity)}</b></div>)}<h3>Total: {money(total)}</h3></div>}
    <form onSubmit={submit} style={{display:'grid',gap:12,marginTop:18}}><h3>Dados para contato</h3><input required minLength={2} placeholder="Nome completo" value={customer.name} onChange={e=>setCustomer(v=>({...v,name:e.target.value}))} style={field}/><input required placeholder="WhatsApp com DDD" value={customer.phone} onChange={e=>setCustomer(v=>({...v,phone:e.target.value}))} style={field}/><input type="email" placeholder="E-mail (opcional)" value={customer.email} onChange={e=>setCustomer(v=>({...v,email:e.target.value}))} style={field}/><input placeholder="Endereço (opcional)" value={customer.address} onChange={e=>setCustomer(v=>({...v,address:e.target.value}))} style={field}/><textarea placeholder="Observações (opcional)" value={customer.notes} onChange={e=>setCustomer(v=>({...v,notes:e.target.value}))} style={{...field,minHeight:80}}/>{error&&<p style={{color:'#ff8d8d'}}>{error}</p>}<button disabled={busy||cart.length===0} style={{border:0,borderRadius:10,padding:14,background:'#ed142c',fontWeight:800,cursor:'pointer'}}>{busy?'Enviando pedido...':'Enviar pedido'}</button><small style={{color:'#888'}}>O envio registra uma solicitação de pedido. A equipe confirmará disponibilidade, pagamento e entrega.</small></form>
   </section>
  </div>}
 </main>
}
const field:CSSProperties={width:'100%',boxSizing:'border-box',background:'#171012',border:'1px solid #5b3037',borderRadius:9,padding:13,color:'#fff',outline:'none'}
