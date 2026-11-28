import {useCallback,useEffect,useMemo,useState} from 'react'
import {Barcode, Minus, Plus, Search, ShoppingCart, Trash2, Printer, RefreshCw, CheckCircle2, ScanBarcode, CreditCard, Banknote, QrCode, PackageCheck} from 'lucide-react'
import {supabase} from '../lib/supabase'

type Product={id:string;name:string;sku:string|null;barcode:string|null;sale_price:number;stock_quantity:number;image_url:string|null}
type CartLine={product:Product;quantity:number}
type Customer={id:string;name:string;phone:string|null}
type Props={companyId:string}
const money=(v:number)=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})

export default function EpartsPOS({companyId}:Props){
 const [products,setProducts]=useState<Product[]>([])
 const [customers,setCustomers]=useState<Customer[]>([])
 const [selectedCustomer,setSelectedCustomer]=useState('')
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
  const [productResult,customerResult]=await Promise.all([
   supabase.from('eparts_products').select('id,name,sku,barcode,sale_price,stock_quantity,image_url').eq('company_id',companyId).eq('is_active',true).order('name'),
   supabase.from('eparts_customers').select('id,name,phone').eq('company_id',companyId).order('name')
  ])
  if(productResult.error)setError(productResult.error.message);else setProducts((productResult.data||[]) as Product[])
  if(customerResult.error)setError(customerResult.error.message);else setCustomers((customerResult.data||[]) as Customer[])
  setLoading(false)
 },[companyId])
 useEffect(()=>{void load()},[load])
 const filtered=useMemo(()=>{const q=search.trim().toLocaleLowerCase('pt-BR');return q?products.filter(p=>p.name.toLocaleLowerCase('pt-BR').includes(q)||(p.sku||'').toLocaleLowerCase('pt-BR').includes(q)||(p.barcode||'').toLocaleLowerCase('pt-BR').includes(q)):[]},[products,search])
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
   const {data,error}=await supabase.rpc('eparts_finalize_pos_sale',{p_company_id:companyId,p_items:cart.map(x=>({product_id:x.product.id,quantity:x.quantity})),p_payment_method:payment,p_customer_name:(customers.find(c=>c.id===selectedCustomer)?.name||customer.trim()||'Consumidor final'),p_discount:discountValue,p_notes:null})
   if(error)throw error
   const saleId=String(data)
   const {data:sale}=await supabase.from('eparts_sales').select('id,order_number,total_amount').eq('company_id',companyId).eq('id',saleId).single()
   setLastSale({id:saleId,number:Number(sale?.order_number||0),total:Number(sale?.total_amount||total),items:cart,customer:(customers.find(c=>c.id===selectedCustomer)?.name||customer.trim()||'Consumidor final'),payment})
   setNotice('Venda finalizada! O estoque foi baixado automaticamente.')
   setCart([]);setCustomer('');setSelectedCustomer('');setDiscount('0');await load()
  }catch(e){setError(e instanceof Error?e.message:'Não foi possível finalizar a venda.')}
  finally{setBusy(false)}
 }
 function printReceipt(mode:'thermal'|'a4'){
  const cleanup=()=>{delete document.body.dataset.epartsPrint;window.removeEventListener('afterprint',cleanup)}
  document.body.dataset.epartsPrint=mode
  window.addEventListener('afterprint',cleanup)
  window.print()
 }
 return <section className="eparts-pos">
  <style>{`
   .eparts-pos{color:#fff;min-width:0}
   .eparts-pos .pos-heading{display:flex;align-items:center;gap:15px;margin:0 0 22px}
   .eparts-pos .pos-heading-icon{width:54px;height:54px;display:grid;place-items:center;flex:none;color:#ff6878}
   .eparts-pos .pos-heading h2{margin:0;color:#fff;font-size:clamp(25px,3vw,38px);letter-spacing:-1px}
   .eparts-pos .pos-heading p{margin:2px 0 0;color:#b8b0a4;font-size:14px}
   .eparts-pos .pos-toolbar{display:flex;align-items:center;gap:10px;margin-bottom:18px}
   .eparts-pos .pos-search{display:flex;align-items:center;gap:12px;flex:1;min-width:0;min-height:58px;padding:0 16px;border:1px solid #a90019;border-radius:13px;background:linear-gradient(100deg,#171411,#111)}
   .eparts-pos .pos-search>svg{color:#ed4052;flex:none}
   .eparts-pos .pos-search input{width:100%;min-width:0;padding:12px 0!important;border:0!important;outline:none!important;box-shadow:none!important;background:transparent!important;color:#fff;font-size:16px}
   .eparts-pos .pos-scan{width:58px;height:58px;display:grid;place-items:center;border:1px solid #a90019;border-radius:13px;background:#19140e;color:#ff6878}
   .eparts-pos .pos-products{display:grid;gap:9px;margin-bottom:20px}
   .eparts-pos .pos-product{display:grid;grid-template-columns:116px minmax(0,1fr) auto;align-items:center;gap:16px;min-width:0;padding:12px;border:1px solid #414141;border-radius:15px;background:linear-gradient(110deg,#202020,#141414);box-shadow:0 6px 16px #0004}
   .eparts-pos .pos-product-image{width:116px;height:108px;display:grid;place-items:center;overflow:hidden;border-radius:12px;background:#0d0d0d;border:1px solid #2b2b2b}
   .eparts-pos .pos-product-image img{width:100%;height:100%;object-fit:contain}
   .eparts-pos .pos-product-image span{color:#8c806b}
   .eparts-pos .pos-product-info{min-width:0}
   .eparts-pos .pos-product-info b{display:block;color:#fff;font-size:17px;line-height:1.25;overflow-wrap:anywhere}
   .eparts-pos .pos-product-info small{display:block;margin-top:5px;color:#b8b8b8;font-size:13px}
   .eparts-pos .pos-product-info strong{display:block;margin-top:4px;color:#fff;font-size:21px}
   .eparts-pos .pos-product-controls{display:flex;align-items:center;gap:8px}
   .eparts-pos .pos-qty{display:flex;align-items:center;overflow:hidden;border:1px solid #9d0719;border-radius:9px;background:#101010}
   .eparts-pos .pos-qty button,.eparts-pos .pos-qty span{width:40px;height:43px;display:grid;place-items:center;border:0;color:white;font-size:19px;font-weight:800}
   .eparts-pos .pos-qty button{background:linear-gradient(#ed142c,#a90019);cursor:pointer}
   .eparts-pos .pos-qty span{background:#171717}
   .eparts-pos .pos-add{width:54px;height:48px;display:grid;place-items:center;border:1px solid #f22;border-radius:11px;background:linear-gradient(145deg,#fa182e,#a90019);color:white;cursor:pointer;box-shadow:0 5px 13px #c00a2438}
   .eparts-pos .pos-cart{padding:17px 19px;margin:18px 0;border:1px solid #5b3037;border-radius:15px;background:linear-gradient(140deg,#1b1b1b,#111);box-shadow:0 8px 25px #0005}
   .eparts-pos .pos-cart-head{display:flex;align-items:center;justify-content:space-between;gap:10px;padding-bottom:13px;border-bottom:1px solid #484848}
   .eparts-pos .pos-cart-head h3{display:flex;align-items:center;gap:10px;margin:0;color:#fff;font-size:20px}
   .eparts-pos .pos-clear{display:flex;align-items:center;gap:6px;border:0;background:none;color:#f13a4a;font-weight:700;cursor:pointer}
   .eparts-pos .pos-cart-lines{display:grid;gap:0}
   .eparts-pos .pos-line{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:11px 2px;border-bottom:1px solid #363636}
   .eparts-pos .pos-line-name{min-width:0;color:#f3f3f3;font-size:14px}
   .eparts-pos .pos-line-tools{display:flex;align-items:center;gap:7px;flex:none}
   .eparts-pos .pos-line-tools button{width:27px;height:27px;display:grid;place-items:center;border:1px solid #5b3037;border-radius:7px;background:#1b1113;color:#fff}
   .eparts-pos .pos-line-tools b{min-width:20px;text-align:center}
   .eparts-pos .pos-line-price{min-width:84px;text-align:right;color:#f4f0e8}
   .eparts-pos .pos-summary{display:grid;gap:8px;padding-top:12px}
   .eparts-pos .pos-summary-row{display:flex;justify-content:space-between;gap:10px;color:#e7e2d9;font-size:15px}
   .eparts-pos .pos-summary-row.total{padding-top:9px;border-top:1px solid #555;font-size:25px;font-weight:800}
   .eparts-pos .pos-summary-row.total strong{color:#fff;font-size:31px}
   .eparts-pos .pos-field{display:grid;gap:6px;margin:12px 0;color:#d9c9ca;font-size:12px}
   .eparts-pos .pos-field input{width:100%;padding:10px 12px;border:1px solid #5b3037;border-radius:8px;background:#101010;color:white}
   .eparts-pos .pos-payment-title{display:flex;align-items:center;gap:10px;margin:22px 0 10px;color:#fff;font-size:17px;font-weight:750}
   .eparts-pos .pos-pay{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
   .eparts-pos .pos-pay button{min-height:68px;display:flex;align-items:center;justify-content:center;gap:9px;padding:10px;border:1px solid #555;border-radius:13px;background:linear-gradient(#222,#171717);color:#eee;font-size:16px;font-weight:750;cursor:pointer}
   .eparts-pos .pos-pay button svg{color:#edc56e}
   .eparts-pos .pos-pay button.active{border:2px solid #edc56e;background:linear-gradient(120deg,#b50920,#71000e);color:#fff;box-shadow:0 0 0 2px #edc56e25}
   .eparts-pos .pos-final{width:100%;min-height:76px;display:flex;align-items:center;justify-content:center;gap:14px;margin-top:18px;border:1px solid #ff3347;border-radius:14px;background:linear-gradient(100deg,#ed142c,#a90019);color:#fff;font-size:25px;font-weight:850;box-shadow:0 8px 22px #d00b2530;cursor:pointer}
   .eparts-pos .pos-final:disabled{opacity:.55;cursor:not-allowed}
   .eparts-pos .pos-stock-note{display:flex;align-items:center;gap:14px;margin-top:16px;padding:14px 16px;border:2px solid #79d96a;border-radius:15px;background:linear-gradient(100deg,#07160b,#0b120d);color:#e6f4e5;font-size:15px;line-height:1.35}
   .eparts-pos .pos-stock-note svg{flex:none;color:#70df55}
   .eparts-pos .pos-stock-note b{color:#fff}
   .eparts-pos .pos-message{padding:12px 14px;margin-bottom:13px;border-radius:9px;background:#392126;color:#ffb5b5;font-size:13px}
   .eparts-pos .pos-message.success{display:flex;align-items:center;gap:8px;background:#102515;border:1px solid #438d46;color:#b7efb3}
   .eparts-pos .pos-muted{color:#aaa;font-size:13px}
   .eparts-pos .pos-empty{padding:22px;text-align:center;color:#999;border:1px dashed #5b3037;border-radius:12px}
   .eparts-pos .pos-receipt{display:none}
   @media(max-width:900px){.eparts-pos .pos-product{grid-template-columns:88px minmax(0,1fr);gap:12px}.eparts-pos .pos-product-image{width:88px;height:88px}.eparts-pos .pos-product-controls{grid-column:2;justify-content:flex-start}}
   @media(max-width:560px){
    .eparts-pos .pos-heading{gap:8px;margin-bottom:16px}.eparts-pos .pos-heading-icon{width:40px;height:40px}.eparts-pos .pos-heading h2{font-size:25px}.eparts-pos .pos-heading p{font-size:12px}
    .eparts-pos .pos-toolbar{gap:7px}.eparts-pos .pos-search{min-height:51px;padding:0 10px}.eparts-pos .pos-search input{font-size:13px}.eparts-pos .pos-scan{width:50px;height:51px}
    .eparts-pos .pos-product{grid-template-columns:76px minmax(0,1fr);gap:10px;padding:9px}.eparts-pos .pos-product-image{width:76px;height:76px}.eparts-pos .pos-product-info b{font-size:14px}.eparts-pos .pos-product-info small{font-size:11px}.eparts-pos .pos-product-info strong{font-size:18px}
    .eparts-pos .pos-product-controls{grid-column:1/-1;justify-content:flex-end}.eparts-pos .pos-qty button,.eparts-pos .pos-qty span{width:35px;height:37px}.eparts-pos .pos-add{width:45px;height:40px}
    .eparts-pos .pos-cart{padding:13px;margin:13px 0}.eparts-pos .pos-cart-head h3{font-size:16px}.eparts-pos .pos-line{align-items:flex-start;flex-wrap:wrap}.eparts-pos .pos-line-name{flex:1 1 55%}.eparts-pos .pos-line-tools{order:3}.eparts-pos .pos-line-price{margin-left:auto}
    .eparts-pos .pos-summary-row.total{font-size:20px}.eparts-pos .pos-summary-row.total strong{font-size:25px}
    .eparts-pos .pos-pay{gap:7px}.eparts-pos .pos-pay button{min-height:59px;flex-direction:column;gap:4px;font-size:12px}
    .eparts-pos .pos-final{min-height:63px;font-size:20px}.eparts-pos .pos-stock-note{padding:11px;font-size:12px}
   }
   @media print{body[data-eparts-print] *{visibility:hidden!important}body[data-eparts-print] .eparts-pos .pos-receipt,body[data-eparts-print] .eparts-pos .pos-receipt *{visibility:visible!important}body[data-eparts-print] .eparts-pos .pos-receipt{display:block!important;position:absolute;left:0;top:0;width:100%;color:#000;background:#fff;padding:8px;font:12px monospace}body[data-eparts-print=thermal] .eparts-pos .pos-receipt{width:72mm}body[data-eparts-print=a4] .eparts-pos .pos-receipt{width:190mm;padding:15mm;font:14px Arial}@page{margin:5mm}}

   /* EPARTS POS visual refinement: consistent matte black, subtle gold and controlled red */
   .eparts-pos{font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif!important}
   .eparts-pos .pos-heading-icon{width:48px!important;height:48px!important;border:1px solid #5b3037!important;border-radius:13px!important;background:linear-gradient(145deg,#1b1113,#111)!important;color:#dfba70!important}
   .eparts-pos .pos-heading h2{font-size:clamp(23px,2.5vw,31px)!important;letter-spacing:-.045em!important;color:#f0d49a!important}
   .eparts-pos .pos-heading p{font-size:12px!important;color:#a9a092!important}
   .eparts-pos .pos-search{min-height:52px!important;border-color:#5b3037!important;border-radius:11px!important;background:#131210!important}
   .eparts-pos .pos-scan{width:52px!important;height:52px!important;border-color:#5b3037!important;border-radius:11px!important;background:#171511!important;color:#fff!important}
   .eparts-pos .pos-product{grid-template-columns:92px minmax(0,1fr) auto!important;gap:13px!important;padding:11px!important;border-color:#39342b!important;border-radius:12px!important;background:linear-gradient(110deg,#191816,#111)!important;box-shadow:none!important}
   .eparts-pos .pos-product-image{width:92px!important;height:88px!important;border-color:#373128!important;border-radius:9px!important;background:#0b0b0a!important;color:#9e8b66!important}
   .eparts-pos .pos-product-info b{font-size:14px!important;font-weight:650!important;color:#eee6d9!important}
   .eparts-pos .pos-product-info small{font-size:11px!important;color:#9f988b!important}
   .eparts-pos .pos-product-info strong{font-size:18px!important;color:#fff!important}
   .eparts-pos .pos-qty{border-color:#5b3037!important;border-radius:8px!important;background:#111!important}
   .eparts-pos .pos-qty button{background:#271115!important;color:#fff!important}
   .eparts-pos .pos-qty button:hover{background:#431019!important}
   .eparts-pos .pos-qty span{background:#111!important;color:#fff!important}
   .eparts-pos .pos-add{width:43px!important;height:42px!important;border-color:#ed142c!important;border-radius:9px!important;background:linear-gradient(145deg,#ed142c,#76000e)!important;box-shadow:none!important}
   .eparts-pos .pos-cart{padding:17px!important;border-color:#51432d!important;border-radius:13px!important;background:#151412!important;box-shadow:none!important}
   .eparts-pos .pos-cart-head{border-color:#383128!important}
   .eparts-pos .pos-cart-head h3{font-size:17px!important;color:#fff!important}
   .eparts-pos .pos-clear{font-size:11px!important}
   .eparts-pos .pos-line{border-color:#302d27!important}
   .eparts-pos .pos-line-name{font-size:12px!important;color:#e6dfd3!important}
   .eparts-pos .pos-line-tools button{border-color:#51432d!important;background:#1b1113!important;color:#fff!important}
   .eparts-pos .pos-line-price{font-size:12px!important}
   .eparts-pos .pos-field{color:#e6dada!important;font-weight:650!important}
   .eparts-pos .pos-field input,.eparts-pos .pos-field select{min-height:41px!important;border-color:#494033!important;border-radius:8px!important;background:#0c0c0b!important;color:#f4efe6!important;padding:9px 11px!important}
   .eparts-pos .pos-summary-row{font-size:13px!important;color:#cfc7b8!important}
   .eparts-pos .pos-summary-row.total{font-size:20px!important}
   .eparts-pos .pos-summary-row.total strong{font-size:25px!important;color:#e9c879!important}
   .eparts-pos .pos-payment-title{font-size:15px!important;color:#e8ddc8!important}
   .eparts-pos .pos-pay{gap:9px!important}
   .eparts-pos .pos-pay button{min-height:58px!important;border-color:#494033!important;border-radius:10px!important;background:#171614!important;color:#ddd4c4!important;font-size:13px!important}
   .eparts-pos .pos-pay button svg{color:#ff6878!important}
   .eparts-pos .pos-pay button.active{border:1px solid #a90019!important;background:linear-gradient(120deg,#5b3037,#21180d)!important;color:#ffe4a4!important;box-shadow:inset 0 0 0 1px #a9001930!important}
   .eparts-pos .pos-final{min-height:58px!important;margin-top:14px!important;border:1px solid #ed142c!important;border-radius:10px!important;background:linear-gradient(100deg,#a90019,#76000e)!important;font-size:17px!important;box-shadow:0 6px 16px #8f15242b!important}
   .eparts-pos .pos-stock-note{border:1px solid #4c6946!important;border-radius:10px!important;background:#111a11!important;color:#c7d9c2!important;font-size:12px!important}
   .eparts-pos .pos-stock-note svg{color:#9bc48e!important}
   .eparts-pos .pos-empty{border-color:#494033!important;border-radius:10px!important;color:#aaa092!important;background:#131210!important}
   @media(max-width:900px){
     .eparts-pos .pos-product{grid-template-columns:76px minmax(0,1fr)!important}
     .eparts-pos .pos-product-image{width:76px!important;height:76px!important}
     .eparts-pos .pos-product-controls{grid-column:1/-1!important;justify-content:flex-end!important}
   }
   @media(max-width:560px){
     .eparts-pos .pos-heading{align-items:center!important}
     .eparts-pos .pos-heading-icon{width:40px!important;height:40px!important}
     .eparts-pos .pos-heading-icon svg{width:25px!important;height:25px!important}
     .eparts-pos .pos-heading h2{font-size:23px!important}
     .eparts-pos .pos-product{grid-template-columns:66px minmax(0,1fr)!important;padding:9px!important}
     .eparts-pos .pos-product-image{width:66px!important;height:66px!important}
     .eparts-pos .pos-product-controls{grid-column:1/-1!important}
     .eparts-pos .pos-pay button{min-height:55px!important;font-size:11px!important}
     .eparts-pos .pos-final{min-height:54px!important;font-size:16px!important}
   }
   .eparts-pos .pos-heading h2{color:#fff!important}
   .eparts-pos .pos-heading-icon,.eparts-pos .pos-search>svg{color:#ed142c!important}
   .eparts-pos .pos-search,.eparts-pos .pos-scan{border-color:#ed142c!important;background:#151012!important;color:#fff!important}
   .eparts-pos .pos-product{border-color:#4b252b!important;background:linear-gradient(110deg,#1b1315,#101010)!important}
   .eparts-pos .pos-product-info strong{color:#fff!important}
   .eparts-pos .pos-cart{border-color:#64202a!important;background:linear-gradient(140deg,#1b1214,#0e0c0c)!important}
   .eparts-pos .pos-cart-head h3,.eparts-pos .pos-summary-row.total strong{color:#fff!important}
   .eparts-pos .pos-pay button{border-color:#5b3037!important;background:#191214!important;color:#fff!important}
   .eparts-pos .pos-pay button.active{border-color:#ff4052!important;background:linear-gradient(120deg,#ed142c,#76000e)!important;color:#fff!important}
   .eparts-pos .pos-final{background:linear-gradient(100deg,#ed142c,#850012)!important;border-color:#ff4052!important}
  
   .eparts-pos .pos-pay button svg{color:#ff6878!important}
   .eparts-pos .pos-field{color:#e8dfe0!important}
   .eparts-pos .pos-summary-row.total strong{color:#fff!important}
   .eparts-pos .pos-stock-note{border-color:#438d46!important}
    `}
</style>
  <div className="pos-heading"><span className="pos-heading-icon"><ShoppingCart size={48}/></span><div><h2>PDV <span style={{color:'#d8d0c5',fontWeight:450}}>– Ponto de Venda</span></h2><p>Venda rápida · controle de estoque em tempo real</p></div></div>
  {error&&<div className="pos-message">{error}</div>}{notice&&<div className="pos-message success"><CheckCircle2 size={18}/>{notice}</div>}
  <div className="pos-toolbar">
   <label className="pos-search"><Search size={23}/><input aria-label="Buscar produto" placeholder="Buscar produto, código ou código de barras" value={search} onChange={e=>setSearch(e.target.value)}/></label>
   <button className="pos-scan" type="button" title="Leitor de código de barras USB ou Bluetooth"><ScanBarcode size={30}/></button>
  </div>
  <div className="pos-products">{loading?<p className="pos-empty">Carregando produtos...</p>:search.trim()?filtered.map(p=>{const line=cart.find(x=>x.product.id===p.id);return <article className="pos-product" key={p.id}>
    <div className="pos-product-image">{p.image_url?<img src={p.image_url} alt={p.name}/>:<PackageCheck size={35}/>}</div>
    <div className="pos-product-info"><b>{p.name}</b><small>Estoque: {p.stock_quantity} un{p.sku?' · SKU '+p.sku:''}</small><strong>{money(p.sale_price)}</strong></div>
    <div className="pos-product-controls"><div className="pos-qty"><button onClick={()=>change(p.id,-1)} disabled={!line} aria-label="Diminuir quantidade"><Minus size={18}/></button><span>{line?.quantity||0}</span><button onClick={()=>add(p)} disabled={p.stock_quantity<= (line?.quantity||0)} aria-label="Aumentar quantidade"><Plus size={18}/></button></div><button className="pos-add" onClick={()=>add(p)} disabled={p.stock_quantity<= (line?.quantity||0)} aria-label="Adicionar ao carrinho"><Plus size={26}/></button></div>
   </article>}) : <p className="pos-empty">Digite o nome ou código para localizar produtos.</p>}{!loading&&search.trim()&&!filtered.length&&<p className="pos-empty">Nenhum produto encontrado.</p>}</div>
  <div className="pos-cart">
   <div className="pos-cart-head"><h3><ShoppingCart size={25}/> Carrinho ({cart.reduce((n,x)=>n+x.quantity,0)} itens)</h3><button className="pos-clear" onClick={()=>setCart([])} disabled={!cart.length}><Trash2 size={18}/> Limpar</button></div>
   <div className="pos-cart-lines">{cart.map(line=><div className="pos-line" key={line.product.id}><span className="pos-line-name">{line.quantity}x&nbsp; {line.product.name}</span><div className="pos-line-tools"><button onClick={()=>change(line.product.id,-1)} aria-label="Diminuir"><Minus size={14}/></button><b>{line.quantity}</b><button onClick={()=>change(line.product.id,1)} aria-label="Aumentar"><Plus size={14}/></button><button onClick={()=>change(line.product.id,-line.quantity)} aria-label="Remover"><Trash2 size={14}/></button></div><b className="pos-line-price">{money(line.product.sale_price*line.quantity)}</b></div>)}</div>
   <label className="pos-field">Cliente cadastrado (opcional)<select value={selectedCustomer} onChange={e=>{setSelectedCustomer(e.target.value);setCustomer('')}}><option value="">Consumidor final / digitar abaixo</option>{customers.map(c=><option key={c.id} value={c.id}>{c.name}{c.phone?' · '+c.phone:''}</option>)}</select></label>
   {!selectedCustomer&&<label className="pos-field">Nome do cliente<input value={customer} onChange={e=>setCustomer(e.target.value)} placeholder="Nome do cliente avulso"/></label>}
   <label className="pos-field">Desconto (R$)<input type="number" min="0" step="0.01" value={discount} onChange={e=>setDiscount(e.target.value)}/></label>
   <div className="pos-summary"><div className="pos-summary-row"><span>Subtotal</span><b>{money(subtotal)}</b></div>{discountValue>0&&<div className="pos-summary-row"><span>Desconto</span><b>- {money(discountValue)}</b></div>}<div className="pos-summary-row total"><span>Total</span><strong>{money(total)}</strong></div></div>
  </div>
  <div className="pos-payment-title"><CreditCard size={24}/> Forma de Pagamento</div>
  <div className="pos-pay"><button className={payment==='pix'?'active':''} onClick={()=>setPayment('pix')}><QrCode size={25}/> PIX</button><button className={payment==='cash'?'active':''} onClick={()=>setPayment('cash')}><Banknote size={25}/> Dinheiro</button><button className={payment==='card'?'active':''} onClick={()=>setPayment('card')}><CreditCard size={25}/> Cartão</button></div>
  <button className="pos-final" disabled={busy||!cart.length} onClick={()=>void finish()}><ShoppingCart size={32}/>{busy?'Finalizando venda...':'Finalizar Venda'}</button>
  <div className="pos-stock-note"><CheckCircle2 size={34}/><span><b>Baixa automática de estoque.</b><br/>Ao finalizar a venda, o sistema atualiza o estoque e registra toda a movimentação.</span><PackageCheck size={35}/></div>
  {lastSale&&<div style={{display:'flex',gap:9,flexWrap:'wrap',marginTop:14}}><b>Venda #{lastSale.number} · {money(lastSale.total)}</b><button className="company-secondary" onClick={()=>printReceipt('thermal')}><Printer size={15}/> Térmica</button><button className="company-secondary" onClick={()=>printReceipt('a4')}><Printer size={15}/> A4</button></div>}
  {lastSale&&<div className="pos-receipt"><center><b>EPARTS · COMPROVANTE DE VENDA</b><br/>Venda #{lastSale.number}</center><hr/>{lastSale.items.map(x=><p key={x.product.id}>{x.quantity}x {x.product.name} — {money(x.product.sale_price*x.quantity)}</p>)}<p>Cliente: {lastSale.customer}</p><p>Pagamento: {lastSale.payment.toUpperCase()}</p><hr/><b>Total: {money(lastSale.total)}</b><p>Obrigado pela preferência!</p></div>}
 </section>
}
