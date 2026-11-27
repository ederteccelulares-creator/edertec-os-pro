import {useCallback,useEffect,useMemo,useState} from 'react'
import {Barcode, Minus, Plus, Search, ShoppingCart, Trash2, Printer, RefreshCw, CheckCircle2} from 'lucide-react'
import {supabase} from '../lib/supabase'

type Product={id:string;name:string;sku:string|null;sale_price:number;stock_quantity:number;image_url:string|null}
type CartLine={product:Product;quantity:number}
type Props={companyId:string}
const money=(v:number)=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})

export default function EpartsPOS({companyId}:Props){
 const [products,setProducts]=useState<Product[]>([])
 const [cart,setCart]=useState<CartLine[]>([])
 const [search,setSearch]=useState('')
 const [payment,setPayment]=useState('pix')
 const [customer,setCustomer]=useState('')
 const [discount,setDiscount]=useState('0')
 const [loading,setLoading]=useState(true)
 const [busy,setBusy]=useState(false)
 const [error,setError]=useState('')
 const [notice,setNotice]=useState('')
 const [lastSale,setLastSale]=useState<{id:string;number:number;total:number;items:CartLine[];customer:string;payment:string}|null>(null)
 const load=useCallback(async()=>{
  if(!supabase)return
  setLoading(true);setError('')
  const {data,error}=await supabase.from('eparts_products').select('id,name,sku,sale_price,stock_quantity,image_url').eq('company_id',companyId).eq('is_active',true).order('name')
  if(error)setError(error.message);else setProducts((data||[]) as Product[])
  setLoading(false)
 },[companyId])
 useEffect(()=>{void load()},[load])
 const filtered=useMemo(()=>{const q=search.trim().toLocaleLowerCase('pt-BR');return q?products.filter(p=>p.name.toLocaleLowerCase('pt-BR').includes(q)||(p.sku||'').toLocaleLowerCase('pt-BR').includes(q)):[]},[products,search])
 const subtotal=cart.reduce((s,l)=>s+l.product.sale_price*l.quantity,0)
 const discountValue=Math.max(0,Number(discount)||0)
 const total=Math.max(0,subtotal-discountValue)
 function add(p:Product){setError('');setCart(old=>{const line=old.find(x=>x.product.id===p.id);const qty=(line?.quantity||0)+1;if(qty>p.stock_quantity){setError('Estoque insuficiente para '+p.name+'.');return old}return line?old.map(x=>x.product.id===p.id?{...x,quantity:qty}:x):[...old,{product:p,quantity:1}]})}
 function change(id:string,delta:number){setCart(old=>old.flatMap(x=>{if(x.product.id!==id)return[x];const quantity=x.quantity+delta;if(quantity<=0)return[];if(quantity>x.product.stock_quantity){setError('Estoque insuficiente para '+x.product.name+'.');return[x]}return[{...x,quantity}]}))}
 async function finish(){
  if(!supabase||busy)return
  if(!cart.length){setError('Adicione pelo menos um produto ao carrinho.');return}
  if(discountValue>subtotal){setError('O desconto não pode ser maior que o subtotal.');return}
  setBusy(true);setError('');setNotice('')
  try{
   const {data,error}=await supabase.rpc('eparts_finalize_pos_sale',{p_company_id:companyId,p_items:cart.map(x=>({product_id:x.product.id,quantity:x.quantity})),p_payment_method:payment,p_customer_name:customer.trim()||'Consumidor final',p_discount:discountValue,p_notes:null})
   if(error)throw error
   const saleId=String(data)
   const {data:sale}=await supabase.from('eparts_sales').select('id,order_number,total_amount').eq('company_id',companyId).eq('id',saleId).single()
   setLastSale({id:saleId,number:Number(sale?.order_number||0),total:Number(sale?.total_amount||total),items:cart,customer:customer.trim()||'Consumidor final',payment})
   setNotice('Venda finalizada! O estoque foi baixado automaticamente.')
   setCart([]);setCustomer('');setDiscount('0');await load()
  }catch(e){setError(e instanceof Error?e.message:'Não foi possível finalizar a venda.')}
  finally{setBusy(false)}
 }
 function printReceipt(mode:'thermal'|'a4'){
  document.body.dataset.epartsPrint=mode
  window.print()
  window.setTimeout(()=>{delete document.body.dataset.epartsPrint},500)
 }
 return <section className="company-panel eparts-pos">
  <style>{`
   .eparts-pos{color:#f7f2e8}.eparts-pos .pos-grid{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(300px,.8fr);gap:18px}.eparts-pos .pos-search{display:flex;gap:8px;align-items:center;border:1px solid #9c762b;border-radius:12px;padding:12px}.eparts-pos input,.eparts-pos select{background:#171717;color:#fff;border:1px solid #514324;border-radius:8px;padding:11px;min-width:0}.eparts-pos .pos-products{display:grid;gap:9px;margin-top:12px}.eparts-pos .pos-product,.eparts-pos .pos-line{display:flex;align-items:center;justify-content:space-between;gap:10px;background:#171717;border:1px solid #38312a;border-radius:12px;padding:12px}.eparts-pos button{cursor:pointer}.eparts-pos .pos-add,.eparts-pos .pos-final{background:#c90020;color:white;border:1px solid #f12b42;border-radius:10px;padding:12px 16px;font-weight:700}.eparts-pos .pos-cart{background:#121212;border:1px solid #8d6b27;border-radius:14px;padding:15px}.eparts-pos .pos-line{margin:8px 0}.eparts-pos .pos-total{font-size:24px;color:#f1c75b;font-weight:800}.eparts-pos .pos-muted{color:#b7ada0;font-size:13px}.eparts-pos .pos-pay{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px}.eparts-pos .pos-pay button{padding:10px 4px;border:1px solid #66532c;border-radius:8px;background:#211d17;color:#f4d27a}.eparts-pos .pos-pay button.active{background:#a90019;color:white;border-color:#f33}.eparts-pos .pos-receipt{display:none}
   @media(max-width:760px){.eparts-pos .pos-grid{grid-template-columns:minmax(0,1fr)}.eparts-pos .pos-pay{grid-template-columns:1fr}.eparts-pos .pos-line{flex-wrap:wrap}}
   @media print{body[data-eparts-print] *{visibility:hidden!important}body[data-eparts-print] .eparts-pos .pos-receipt,body[data-eparts-print] .eparts-pos .pos-receipt *{visibility:visible!important}body[data-eparts-print] .eparts-pos .pos-receipt{display:block!important;position:absolute;left:0;top:0;width:100%;color:#000;background:#fff;padding:8px;font:12px monospace}body[data-eparts-print=thermal] .eparts-pos .pos-receipt{width:72mm}body[data-eparts-print=a4] .eparts-pos .pos-receipt{width:190mm;padding:15mm;font:14px Arial}body[data-eparts-print] @page{margin:5mm}}
  `}</style>
  <div className="company-panel-head"><div><b>PDV · Ponto de venda</b><small>Venda presencial · baixa imediata do estoque ao finalizar</small></div><button className="company-secondary" onClick={()=>void load()} disabled={loading}><RefreshCw size={15}/> Atualizar estoque</button></div>
  {error&&<div className="company-error-banner">{error}</div>}{notice&&<div className="company-success-banner"><CheckCircle2 size={16}/> {notice}</div>}
  <div className="pos-grid">
   <div>
    <label className="pos-search"><Search size={18}/><input aria-label="Buscar produto" placeholder="Buscar produto, SKU ou código de barras" value={search} onChange={e=>setSearch(e.target.value)}/><Barcode size={22}/></label>
    <div className="pos-products">{loading?<p className="company-empty">Carregando produtos...</p>:search.trim()?filtered.map(p=><article className="pos-product" key={p.id}><div><b>{p.name}</b><div className="pos-muted">{p.sku||'Sem código'} · Estoque: {p.stock_quantity}</div><strong>{money(p.sale_price)}</strong></div><button className="pos-add" onClick={()=>add(p)} disabled={p.stock_quantity<=0}>Adicionar</button></article>):<p className="company-empty">Digite o nome ou código para localizar produtos.</p>}{!loading&&search.trim()&&!filtered.length&&<p className="company-empty">Nenhum produto encontrado.</p>}</div>
   </div>
   <div className="pos-cart">
    <h3><ShoppingCart size={18}/> Carrinho ({cart.reduce((n,x)=>n+x.quantity,0)} unidades)</h3>
    {cart.map(line=><div className="pos-line" key={line.product.id}><div style={{flex:1}}><b>{line.product.name}</b><div className="pos-muted">{money(line.product.sale_price)} cada</div></div><button onClick={()=>change(line.product.id,-1)} aria-label="Diminuir"><Minus size={16}/></button><b>{line.quantity}</b><button onClick={()=>change(line.product.id,1)} aria-label="Aumentar"><Plus size={16}/></button><b>{money(line.product.sale_price*line.quantity)}</b><button onClick={()=>change(line.product.id,-line.quantity)} aria-label="Remover"><Trash2 size={16}/></button></div>)}
    <label>Cliente (opcional)<input value={customer} onChange={e=>setCustomer(e.target.value)} placeholder="Consumidor final"/></label>
    <label>Desconto (R$)<input type="number" min="0" step="0.01" value={discount} onChange={e=>setDiscount(e.target.value)}/></label>
    <div className="pos-muted">Subtotal: {money(subtotal)}</div><div className="pos-total">Total: {money(total)}</div>
    <p><b>Forma de pagamento</b></p><div className="pos-pay">{[['pix','PIX'],['cash','Dinheiro'],['card','Cartão']].map(([v,l])=><button key={v} className={payment===v?'active':''} onClick={()=>setPayment(v)}>{l}</button>)}</div>
    <button className="pos-final" style={{width:'100%',marginTop:14}} disabled={busy||!cart.length} onClick={()=>void finish()}>{busy?'Finalizando...':'Finalizar venda'}</button>
    {lastSale&&<div style={{marginTop:12}}><b>Venda #{lastSale.number} · {money(lastSale.total)}</b><div className="pos-muted">Comprovante</div><div style={{display:'flex',gap:8,marginTop:8}}><button className="company-secondary" onClick={()=>printReceipt('thermal')}><Printer size={15}/> Térmica</button><button className="company-secondary" onClick={()=>printReceipt('a4')}><Printer size={15}/> A4</button></div></div>}
   </div>
  </div>
  {lastSale&&<div className="pos-receipt"><center><b>EPARTS · COMPROVANTE DE VENDA</b><br/>Venda #{lastSale.number}</center><hr/>{lastSale.items.map(x=><p key={x.product.id}>{x.quantity}x {x.product.name} — {money(x.product.sale_price*x.quantity)}</p>)}<p>Cliente: {lastSale.customer}</p><p>Pagamento: {lastSale.payment.toUpperCase()}</p><hr/><b>Total: {money(lastSale.total)}</b><p>Obrigado pela preferência!</p></div>}
 </section>
}
