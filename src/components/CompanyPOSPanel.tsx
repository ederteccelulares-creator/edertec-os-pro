import {useCallback,useEffect,useMemo,useState} from 'react'
import {Barcode,Minus,Plus,RefreshCw,Search,ShoppingCart,Trash2,Wallet} from 'lucide-react'
import {listCompanyProducts,type CompanyProduct} from '../lib/company-inventory'
import {listCompanyBranches,type Company,type CompanyBranch} from '../lib/company-data'
import {supabase} from '../lib/supabase'

type CartLine={product:CompanyProduct;quantity:number}
const money=(n:number)=>Number(n||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})
const methods=[['pix','PIX'],['cash','Dinheiro'],['debit_card','Cartão de débito'],['credit_card','Cartão de crédito'],['bank_transfer','Transferência'],['other','Outro']]
export default function CompanyPOSPanel({company}:{company:Company}){
 const [products,setProducts]=useState<CompanyProduct[]>([])
 const [branches,setBranches]=useState<CompanyBranch[]>([])
 const [accounts,setAccounts]=useState<Array<{id:string;account_name:string;bank_name:string;branch_id:string|null}>>([])
 const [financialAccountId,setFinancialAccountId]=useState('')
 const [saleAttempt,setSaleAttempt]=useState<{fingerprint:string;key:string}|null>(null)
 const [sales,setSales]=useState<any[]>([])
 const [selectedSale,setSelectedSale]=useState<any|null>(null)
 const [saleItems,setSaleItems]=useState<any[]>([])
 const [historyLoading,setHistoryLoading]=useState(false)
 const [cancelTarget,setCancelTarget]=useState<any|null>(null)
 const [cancelReason,setCancelReason]=useState('')
 const [cancelBusy,setCancelBusy]=useState(false)
 const [cart,setCart]=useState<CartLine[]>([])
 const [search,setSearch]=useState('')
 const [branchId,setBranchId]=useState('')
 const [method,setMethod]=useState('pix')
 const [discount,setDiscount]=useState('0')
 const [received,setReceived]=useState('')
 const [loading,setLoading]=useState(true)
 const [busy,setBusy]=useState(false)
 const [error,setError]=useState('')
 const [notice,setNotice]=useState('')
 const load=useCallback(async()=>{setLoading(true);setError('');try{const [p,b,a]=await Promise.all([listCompanyProducts({companyId:company.id,search,limit:500}),listCompanyBranches(company.id),supabase!.from('company_financial_accounts').select('id,account_name,bank_name,branch_id').eq('company_id',company.id).eq('is_active',true).order('account_name')]);if(a.error)throw a.error;setProducts(p);setBranches(b);setAccounts(a.data||[])}catch(e){setError(e instanceof Error?e.message:'Não foi possível carregar os produtos do PDV.')}finally{setLoading(false)}},[company.id,search])
 useEffect(()=>{const timer=window.setTimeout(()=>{void load()},250);return()=>window.clearTimeout(timer)},[load])
 const loadHistory=useCallback(async()=>{if(!supabase)return;setHistoryLoading(true);try{const {data,error}=await supabase.from('company_pos_sales').select('id,sale_number,created_at,total,discount,payment_method,status,change_amount,amount_received,description,cancellation_reason').eq('company_id',company.id).order('created_at',{ascending:false}).limit(50);if(error)throw error;setSales(data||[])}catch(e){setError(e instanceof Error?e.message:'Não foi possível carregar o histórico de vendas.')}finally{setHistoryLoading(false)}},[company.id])
 useEffect(()=>{void loadHistory()},[loadHistory])
 const subtotal=useMemo(()=>cart.reduce((sum,line)=>sum+line.product.sale_price*line.quantity,0),[cart])
 const discountValue=Math.min(Math.max(Number(discount)||0,0),subtotal)
 const total=Math.max(0,subtotal-discountValue)
 const term=search.trim().toLowerCase()
 const filtered=term?products.filter(p=>p.is_active&&Number(p.stock_quantity)>0&&[p.name,p.sku||''].some(v=>v.toLowerCase().includes(term))):[]
 function add(product:CompanyProduct){setError('');setCart(old=>{const found=old.find(x=>x.product.id===product.id);if(found){if(found.quantity>=Number(product.stock_quantity))return old;return old.map(x=>x.product.id===product.id?{...x,quantity:x.quantity+1}:x)}return Number(product.stock_quantity)>0?[...old,{product,quantity:1}]:old})}
 function changeQty(id:string,quantity:number){const product=products.find(p=>p.id===id);if(!product)return;setCart(old=>quantity<=0?old.filter(x=>x.product.id!==id):old.map(x=>x.product.id===id?{...x,quantity:Math.min(quantity,Number(product.stock_quantity))}:x))}
 async function cancelSale(){if(!cancelTarget)return;const reason=cancelReason.trim();if(reason.length<5){setError('Informe um motivo com pelo menos 5 caracteres.');return}setCancelBusy(true);setError('');try{const {error}=await supabase!.rpc('cancel_company_pos_sale',{p_company_id:company.id,p_sale_id:cancelTarget.id,p_reason:reason,p_idempotency_key:crypto.randomUUID()});if(error)throw error;setNotice('Venda #'+cancelTarget.sale_number+' cancelada. Estoque restaurado e estorno lançado no caixa.');setCancelTarget(null);setCancelReason('');setSelectedSale(null);await Promise.all([load(),loadHistory()])}catch(e){setError(e instanceof Error?e.message:'Não foi possível cancelar a venda.')}finally{setCancelBusy(false)}}
 async function finishSale(){if(!cart.length){setError('Adicione produtos ao carrinho.');return}if(cart.some(x=>x.quantity>Number(x.product.stock_quantity))){setError('Há produtos com estoque insuficiente. Atualize o estoque e tente novamente.');return}if(total<=0){setError('O total da venda precisa ser maior que zero.');return}if(method==='cash'&&Number(received)<total){setError('O valor recebido é menor que o total da venda.');return}
  setBusy(true);setError('');setNotice('')
  try{
   const lines=cart.map(x=>x.quantity+'x '+x.product.name).join(', ')
   const description='Venda PDV: '+lines+(discountValue>0?' · Desconto '+money(discountValue):'')
   const items=cart.map(x=>({product_id:x.product.id,quantity:x.quantity}))
   const fingerprint=JSON.stringify({branchId:branchId||null,items,subtotal,discount:discountValue,amount:total,received:method==='cash'?Number(received):total,method,financialAccountId:financialAccountId||null})
   const key=saleAttempt?.fingerprint===fingerprint?saleAttempt.key:crypto.randomUUID()
   setSaleAttempt({fingerprint,key})
   const {error:checkoutError}=await supabase!.rpc('finalize_company_pos_sale',{p_company_id:company.id,p_branch_id:branchId||null,p_items:items,p_subtotal:subtotal,p_discount:discountValue,p_amount:total,p_payment_method:method,p_financial_account_id:financialAccountId||null,p_idempotency_key:key,p_description:description,p_amount_received:method==='cash'?Number(received):total})
   if(checkoutError)throw checkoutError
   const change=method==='cash'?Math.max(0,Number(received)-total):0
   setNotice('Venda registrada! Total '+money(total)+(change>0?' · Troco '+money(change):''))
   setCart([]);setDiscount('0');setReceived('');setFinancialAccountId('');setSaleAttempt(null);await Promise.all([load(),loadHistory()])
  }catch(e){setError((e instanceof Error?e.message:'Falha ao registrar venda.')+' Confira o estoque e o caixa antes de tentar novamente.')}
  finally{setBusy(false)}
 }
 return <section className="company-pos">
  <div className="company-panel company-pos-products">
   <div className="company-panel-head"><div><b>PDV · Frente de caixa</b><small>{loading?'Carregando produtos...':search.trim()?`${filtered.length} produtos encontrados · toque em um produto para adicionar`:'Digite o nome ou código para localizar um produto'}</small></div><button className="company-secondary" onClick={()=>void load()}><RefreshCw size={15}/> Atualizar</button></div>
   {error&&<div className="company-error-banner">{error}</div>}{notice&&<div className="company-notice-banner">{notice}</div>}
   <div className="company-pos-tools"><label><Search size={16}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar produto ou código"/></label><label className="company-pos-branch">Filial<select value={branchId} onChange={e=>setBranchId(e.target.value)}><option value="">Matriz / não especificada</option>{branches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label></div>
   {loading?<p className="company-empty">Carregando produtos...</p>:filtered.length===0?<p className="company-empty">Nenhum produto encontrado. Confira o nome ou código digitado.</p>:<div className="company-pos-product-grid">{filtered.map(p=><button type="button" className="company-pos-product" key={p.id} disabled={Number(p.stock_quantity)<=0||busy} onClick={()=>add(p)}>{p.image_url?<img className="company-pos-product-image" src={p.image_url} alt={p.name}/>:<span><Barcode size={18}/></span>}<b>{p.name}</b><strong>{money(p.sale_price)}</strong><small>Estoque: {Number(p.stock_quantity)}</small><em><Plus size={14}/> Adicionar</em></button>)}</div>}
  </div>
  <div className="company-panel company-pos-cart">
   <div className="company-panel-head"><div><b><ShoppingCart size={17}/> Carrinho</b><small>{cart.reduce((n,x)=>n+x.quantity,0)} itens</small></div></div>
   {cart.length===0?<p className="company-empty">O carrinho está vazio. Adicione produtos para iniciar uma venda.</p>:<div className="company-pos-cart-lines">{cart.map(line=><div className="company-pos-line" key={line.product.id}><div><b>{line.product.name}</b><small>{money(line.product.sale_price)} cada</small></div><div className="company-pos-qty"><button type="button" onClick={()=>changeQty(line.product.id,line.quantity-1)}><Minus size={13}/></button><b>{line.quantity}</b><button type="button" disabled={line.quantity>=Number(line.product.stock_quantity)} onClick={()=>changeQty(line.product.id,line.quantity+1)}><Plus size={13}/></button><button type="button" className="company-pos-remove" onClick={()=>changeQty(line.product.id,0)}><Trash2 size={14}/></button></div><strong>{money(line.product.sale_price*line.quantity)}</strong></div>)}</div>}
   <div className="company-pos-checkout"><label>Desconto (R$)<input type="number" min="0" step="0.01" value={discount} onChange={e=>setDiscount(e.target.value)}/></label><div className="company-pos-total"><span>Subtotal</span><b>{money(subtotal)}</b></div><div className="company-pos-total"><span>Desconto</span><b>{money(discountValue)}</b></div><div className="company-pos-grand"><span>Total a pagar</span><strong>{money(total)}</strong></div><label>Forma de pagamento<select value={method} onChange={e=>setMethod(e.target.value)}>{methods.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label><label>Conta de recebimento<select value={financialAccountId} onChange={e=>setFinancialAccountId(e.target.value)}><option value="">Não vincular conta</option>{accounts.filter(a=>!a.branch_id||a.branch_id===(branchId||null)).map(a=><option key={a.id} value={a.id}>{a.account_name} · {a.bank_name}</option>)}</select></label>{method==='cash'&&<><label>Valor recebido (R$)<input type="number" min="0" step="0.01" value={received} onChange={e=>setReceived(e.target.value)}/></label><div className="company-pos-total"><span>Troco</span><b>{money(Math.max(0,Number(received||0)-total))}</b></div></>}<button className="company-primary company-pos-finish" disabled={busy||!cart.length} onClick={()=>void finishSale()}><Wallet size={17}/>{busy?'Registrando venda...':'Finalizar venda'}</button></div>
  </div>
  <div className="company-panel company-pos-history">
   <div className="company-panel-head"><div><b>Histórico de vendas</b><small>Últimas 50 vendas registradas nesta empresa</small></div><button type="button" className="company-secondary" onClick={()=>void loadHistory()}><RefreshCw size={15}/> Atualizar</button></div>
   {historyLoading?<p className="company-empty">Carregando histórico...</p>:sales.length===0?<p className="company-empty">Nenhuma venda registrada ainda.</p>:<div className="company-table-wrap"><table><thead><tr><th>VENDA</th><th>DATA</th><th>PAGAMENTO</th><th>TOTAL</th><th>STATUS</th><th></th></tr></thead><tbody>{sales.map(s=><tr key={s.id}><td>#{s.sale_number}</td><td>{new Date(s.created_at).toLocaleString('pt-BR')}</td><td>{methods.find(x=>x[0]===s.payment_method)?.[1]||s.payment_method}</td><td>{money(Number(s.total))}</td><td>{s.status==='completed'?'Concluída':'Cancelada'}</td><td><button type="button" className="company-secondary" onClick={async()=>{const {data,error}=await supabase!.from('company_pos_sale_items').select('product_name,sku,quantity,unit_price,line_total').eq('company_id',company.id).eq('sale_id',s.id).order('created_at');if(error){setError(error.message);return}setSaleItems(data||[]);setSelectedSale(s)}}>Detalhes</button>{s.status==='completed'&&<button type="button" className="company-danger" onClick={()=>{setCancelTarget(s);setCancelReason('')}}>Cancelar</button>}</td></tr>)}</tbody></table></div>}
  </div>
  {cancelTarget&&<div className="company-modal-backdrop"><section className="company-form company-payment-modal"><h3>Cancelar venda #{cancelTarget.sale_number}</h3><p>O sistema devolverá os itens ao estoque e lançará um estorno financeiro no caixa original. Só é permitido enquanto o caixa original estiver aberto.</p><label>Motivo do cancelamento<textarea value={cancelReason} onChange={e=>setCancelReason(e.target.value)} rows={3} maxLength={500} placeholder="Ex.: cliente desistiu da compra"/></label><div className="company-form-actions"><button type="button" className="company-secondary" disabled={cancelBusy} onClick={()=>setCancelTarget(null)}>Voltar</button><button type="button" className="company-danger" disabled={cancelBusy||cancelReason.trim().length<5} onClick={()=>void cancelSale()}>{cancelBusy?'Cancelando...':'Confirmar cancelamento'}</button></div></section></div>}
  {selectedSale&&<div className="company-modal-backdrop"><section className="company-form company-payment-modal"><h3>Venda #{selectedSale.sale_number}</h3><p>{new Date(selectedSale.created_at).toLocaleString('pt-BR')} · {methods.find(x=>x[0]===selectedSale.payment_method)?.[1]||selectedSale.payment_method}</p><div className="company-table-wrap"><table><thead><tr><th>PRODUTO</th><th>QTD.</th><th>UNIT.</th><th>TOTAL</th></tr></thead><tbody>{saleItems.map((i,n)=><tr key={n}><td>{i.product_name}</td><td>{Number(i.quantity)}</td><td>{money(Number(i.unit_price))}</td><td>{money(Number(i.line_total))}</td></tr>)}</tbody></table></div><div className="company-pos-total"><span>Desconto</span><b>{money(Number(selectedSale.discount))}</b></div><div className="company-pos-grand"><span>Total</span><strong>{money(Number(selectedSale.total))}</strong></div>{selectedSale.payment_method==='cash'&&<div className="company-pos-total"><span>Troco</span><b>{money(Number(selectedSale.change_amount))}</b></div>}{selectedSale.status==='cancelled'&&<div className="company-error-banner">Venda cancelada: {selectedSale.cancellation_reason||'Motivo não informado'}</div>}<div className="company-form-actions"><button type="button" className="company-secondary" onClick={()=>setSelectedSale(null)}>Fechar</button><button type="button" className="company-primary" onClick={()=>window.print()}>Imprimir</button></div></section></div>}
 </section>
}
