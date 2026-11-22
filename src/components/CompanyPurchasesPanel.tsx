import {useCallback,useEffect,useState,type FormEvent} from 'react'
import {Plus,RefreshCw,ShoppingCart,PackageCheck} from 'lucide-react'
import {createCompanyPurchase,listCompanyPurchases,receiveCompanyPurchase,type CompanyPurchase,type PurchaseItemInput} from '../lib/company-purchases'
import {listCompanySuppliers,type CompanySupplier} from '../lib/company-suppliers'
import {listCompanyProducts,type CompanyProduct} from '../lib/company-inventory'
import {listCompanyBranches,type CompanyBranch,type Company} from '../lib/company-data'

const money=(n:number)=>Number(n||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})
const statusLabel:Record<string,string>={draft:'Rascunho',ordered:'Pedido realizado',received:'Recebida',cancelled:'Cancelada'}
export default function CompanyPurchasesPanel({company}:{company:Company}){
 const [purchases,setPurchases]=useState<CompanyPurchase[]>([])
 const [suppliers,setSuppliers]=useState<CompanySupplier[]>([])
 const [products,setProducts]=useState<CompanyProduct[]>([])
 const [branches,setBranches]=useState<CompanyBranch[]>([])
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[show,setShow]=useState(false)
 const [error,setError]=useState(''),[notice,setNotice]=useState('')
 const [supplierId,setSupplierId]=useState(''),[branchId,setBranchId]=useState('')
 const [discount,setDiscount]=useState('0'),[freight,setFreight]=useState('0'),[notes,setNotes]=useState('')
 const [items,setItems]=useState<PurchaseItemInput[]>([{productId:null,description:'',quantity:1,unitCost:0}])
 const load=useCallback(async()=>{
  setLoading(true);setError('')
  try{const [p,s,pr,b]=await Promise.all([listCompanyPurchases(company.id),listCompanySuppliers(company.id),listCompanyProducts({companyId:company.id,limit:500}),listCompanyBranches(company.id)]);setPurchases(p);setSuppliers(s);setProducts(pr);setBranches(b)}
  catch(e){setError(e instanceof Error?e.message:'Erro ao carregar compras.')}
  finally{setLoading(false)}
 },[company.id])
 useEffect(()=>{void load()},[load])
 const subtotal=items.reduce((sum,i)=>sum+(Number(i.quantity)||0)*(Number(i.unitCost)||0),0)
 const total=Math.max(0,subtotal-(Number(discount)||0)+(Number(freight)||0))
 function changeItem(index:number,patch:Partial<PurchaseItemInput>){setItems(old=>old.map((i,n)=>n===index?{...i,...patch}:i))}
 async function submit(e:FormEvent){
  e.preventDefault();setBusy(true);setError('');setNotice('')
  try{await createCompanyPurchase({companyId:company.id,supplierId:supplierId||null,branchId:branchId||null,discount:Number(discount),freight:Number(freight),notes,items});setShow(false);setItems([{productId:null,description:'',quantity:1,unitCost:0}]);setNotice('Pedido de compra criado como rascunho.');await load()}
  catch(e){setError(e instanceof Error?e.message:'Falha ao criar compra.')}
  finally{setBusy(false)}
 }
 async function receive(p:CompanyPurchase){
  if(!window.confirm('Confirmar recebimento? Os itens vinculados a produtos darão entrada no estoque.'))return
  setBusy(true);setError('');setNotice('')
  try{await receiveCompanyPurchase(company.id,p.id);setNotice('Compra recebida e estoque atualizado.');await load()}
  catch(e){setError(e instanceof Error?e.message:'Falha ao receber compra.')}
  finally{setBusy(false)}
 }
 return <section className="company-panel">
  <div className="company-panel-head"><div><b>Compras e recebimento</b><small>{purchases.length} pedidos registrados</small></div><button className="company-primary" onClick={()=>setShow(v=>!v)}><Plus size={16}/> Nova compra</button></div>
  {error&&<div className="company-error-banner">{error}</div>}{notice&&<div className="company-notice-banner">{notice}</div>}
  {show&&<form className="company-form" onSubmit={submit}>
   <h3>Pedido de compra</h3>
   <div className="company-form-grid">
    <label>Fornecedor<select value={supplierId} onChange={e=>setSupplierId(e.target.value)}><option value="">Não selecionado</option>{suppliers.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
    <label>Filial de recebimento<select value={branchId} onChange={e=>setBranchId(e.target.value)}><option value="">Matriz / não definida</option>{branches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
    <label>Desconto (R$)<input type="number" min="0" step="0.01" value={discount} onChange={e=>setDiscount(e.target.value)}/></label>
    <label>Frete (R$)<input type="number" min="0" step="0.01" value={freight} onChange={e=>setFreight(e.target.value)}/></label>
   </div>
   <h3>Itens</h3>
   {items.map((item,index)=><div className="company-purchase-line" key={index}>
    <label>Produto do estoque<select value={item.productId||''} onChange={e=>{const p=products.find(x=>x.id===e.target.value);changeItem(index,{productId:p?.id||null,description:p?.name||item.description,unitCost:p?.cost_price??item.unitCost})}}><option value="">Item sem produto vinculado</option>{products.map(p=><option key={p.id} value={p.id}>{p.name} · {money(p.cost_price)}</option>)}</select></label>
    <label>Descrição<input required value={item.description} onChange={e=>changeItem(index,{description:e.target.value})}/></label>
    <label>Qtd.<input required type="number" min="0.01" step="0.01" value={item.quantity} onChange={e=>changeItem(index,{quantity:Number(e.target.value)})}/></label>
    <label>Custo unitário<input required type="number" min="0" step="0.01" value={item.unitCost} onChange={e=>changeItem(index,{unitCost:Number(e.target.value)})}/></label>
    <button type="button" className="company-secondary" onClick={()=>setItems(old=>old.length===1?old:old.filter((_,n)=>n!==index))}>Remover</button>
   </div>)}
   <button type="button" className="company-secondary" onClick={()=>setItems(old=>[...old,{productId:null,description:'',quantity:1,unitCost:0}])}>Adicionar item</button>
   <label>Observações<input value={notes} onChange={e=>setNotes(e.target.value)}/></label>
   <div className="company-purchase-totals"><span>Subtotal: {money(subtotal)}</span><b>Total: {money(total)}</b></div>
   <div className="company-form-actions"><button type="button" className="company-secondary" onClick={()=>setShow(false)}>Cancelar</button><button className="company-primary" disabled={busy}>{busy?'Salvando...':'Criar pedido'}</button></div>
  </form>}
  {loading?<p className="company-empty">Carregando compras...</p>:purchases.length===0?<p className="company-empty"><ShoppingCart size={22}/><br/>Nenhuma compra cadastrada.</p>:
   <div className="company-table-wrap"><table><thead><tr><th>Nº</th><th>DATA</th><th>STATUS</th><th>SUBTOTAL</th><th>TOTAL</th><th>AÇÃO</th></tr></thead><tbody>
    {purchases.map(p=><tr key={p.id}><td>#{p.purchase_number}</td><td>{p.purchased_at?new Date(p.purchased_at).toLocaleDateString('pt-BR'):'—'}</td><td>{statusLabel[p.status]||p.status}</td><td>{money(p.subtotal)}</td><td><b>{money(p.total)}</b></td><td>{p.status!=='received'&&p.status!=='cancelled'?<button className="company-secondary company-small-action" disabled={busy} onClick={()=>void receive(p)}><PackageCheck size={14}/> Receber</button>:'—'}</td></tr>)}
   </tbody></table></div>}
 </section>
}
