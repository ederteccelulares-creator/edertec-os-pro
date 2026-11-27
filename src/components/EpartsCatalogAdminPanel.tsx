import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { BadgePlus, Boxes, Package, RefreshCw, Truck } from 'lucide-react'
import { supabase } from '../lib/supabase'

type Brand = { id:string; name:string }
type Supplier = { id:string; name:string; email:string|null; phone:string|null; is_active?:boolean }
type Product = { id:string; name:string; sku:string|null; sale_price:number; cost_price:number; stock_quantity:number; is_active:boolean; show_in_catalog:boolean; eparts_brands?:{name:string}[]|null; eparts_suppliers?:{name:string}[]|null }
type Props = { companyId:string }
type Sale = { id:string; order_number:number; status:string; payment_status:string; total_amount:number; eparts_commission_amount:number; supplier_amount:number; customer_name:string|null; customer_phone:string|null; created_at:string };
type Tab = 'products'|'suppliers'|'brands'|'sales'
const money=(value:number)=>Number(value||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})

export default function EpartsCatalogAdminPanel({companyId}:Props) {
  const [tab,setTab]=useState<Tab>('products')
  const [products,setProducts]=useState<Product[]>([])
  const [suppliers,setSuppliers]=useState<Supplier[]>([])
  const [brands,setBrands]=useState<Brand[]>([])
  const [sales,setSales]=useState<Sale[]>([])
  const [loading,setLoading]=useState(true)
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const [notice,setNotice]=useState('')
  const [showForm,setShowForm]=useState(false)
  const [productForm,setProductForm]=useState({name:'',sku:'',description:'',brandId:'',supplierId:'',costPrice:'0',salePrice:'0',stock:'0',showInCatalog:true})
  const [supplierForm,setSupplierForm]=useState({name:'',email:'',phone:''})
  const [brandName,setBrandName]=useState('')

  const load=useCallback(async()=>{
    if(!supabase)return
    setLoading(true);setError('')
    try{
      const [p,s,b,o]=await Promise.all([
        supabase.from('eparts_products').select('id,name,sku,sale_price,cost_price,stock_quantity,is_active,show_in_catalog,eparts_brands(name),eparts_suppliers(name)').eq('company_id',companyId).order('name'),
        supabase.from('eparts_suppliers').select('id,name,email,phone,is_active').eq('company_id',companyId).order('name'),
        supabase.from('eparts_brands').select('id,name').eq('company_id',companyId).order('name'),
        supabase.from('eparts_sales').select('id,order_number,status,payment_status,total_amount,eparts_commission_amount,supplier_amount,customer_name,customer_phone,created_at').eq('company_id',companyId).order('created_at',{ascending:false}).limit(100),
      ])
      if(p.error)throw p.error;if(s.error)throw s.error;if(b.error)throw b.error;if(o.error)throw o.error
      setProducts((p.data||[]) as Product[]);setSuppliers((s.data||[]) as Supplier[]);setBrands((b.data||[]) as Brand[]);setSales((o.data||[]) as Sale[])
    }catch(e){setError(e instanceof Error?e.message:'Não foi possível carregar os dados do Eparts.')}
    finally{setLoading(false)}
  },[companyId])
  useEffect(()=>{void load()},[load])

  async function saveBrand(event:FormEvent){
    event.preventDefault();if(!supabase)return
    const name=brandName.trim();if(!name)return
    setBusy(true);setError('');setNotice('')
    try{const {error}=await supabase.from('eparts_brands').insert({company_id:companyId,name});if(error)throw error;setBrandName('');setShowForm(false);setNotice('Marca cadastrada.');await load()}
    catch(e){setError(e instanceof Error?e.message:'Falha ao cadastrar marca.')}
    finally{setBusy(false)}
  }
  async function saveSupplier(event:FormEvent){
    event.preventDefault();if(!supabase)return
    if(supplierForm.name.trim().length<2){setError('Informe o nome do fornecedor.');return}
    setBusy(true);setError('');setNotice('')
    try{const {error}=await supabase.from('eparts_suppliers').insert({company_id:companyId,name:supplierForm.name.trim(),email:supplierForm.email.trim()||null,phone:supplierForm.phone.trim()||null});if(error)throw error;setSupplierForm({name:'',email:'',phone:''});setShowForm(false);setNotice('Fornecedor cadastrado.');await load()}
    catch(e){setError(e instanceof Error?e.message:'Falha ao cadastrar fornecedor.')}
    finally{setBusy(false)}
  }
  async function saveProduct(event:FormEvent){
    event.preventDefault();if(!supabase)return
    const cost=Number(productForm.costPrice),price=Number(productForm.salePrice),stock=Number(productForm.stock)
    if(!productForm.name.trim()||!productForm.supplierId||!Number.isFinite(cost)||!Number.isFinite(price)||!Number.isInteger(stock)||cost<0||price<0||stock<0){setError('Informe o nome, selecione o fornecedor e confira preços e estoque.');return}
    setBusy(true);setError('');setNotice('')
    try{
      const {error}=await supabase.from('eparts_products').insert({company_id:companyId,name:productForm.name.trim(),sku:productForm.sku.trim()||null,description:productForm.description.trim()||null,brand_id:productForm.brandId||null,supplier_id:productForm.supplierId||null,cost_price:cost,sale_price:price,stock_quantity:stock,show_in_catalog:productForm.showInCatalog,is_active:true})
      if(error)throw error
      setProductForm({name:'',sku:'',description:'',brandId:'',supplierId:'',costPrice:'0',salePrice:'0',stock:'0',showInCatalog:true});setShowForm(false);setNotice('Produto cadastrado no Eparts.');await load()
    }catch(e){setError(e instanceof Error?e.message:'Falha ao cadastrar produto.')}
    finally{setBusy(false)}
  }
  const startNew=()=>{setShowForm(v=>!v);setError('');setNotice('')}
  return <section className="company-panel eparts-admin-panel">
    <div className="company-panel-head"><div><b>Central Eparts</b><small>Cadastros e catálogo do marketplace · comissão da plataforma: 12%</small></div><button className="company-secondary" onClick={()=>void load()} disabled={loading}><RefreshCw size={15}/> Atualizar</button></div>
    <div className="company-inline-actions eparts-tabs">
      <button className={tab==='products'?'company-primary':'company-secondary'} onClick={()=>{setTab('products');setShowForm(false)}}><Package size={15}/> Produtos ({products.length})</button>
      <button className={tab==='suppliers'?'company-primary':'company-secondary'} onClick={()=>{setTab('suppliers');setShowForm(false)}}><Truck size={15}/> Fornecedores ({suppliers.length})</button>
      <button className={tab==='brands'?'company-primary':'company-secondary'} onClick={()=>{setTab('brands');setShowForm(false)}}><Boxes size={15}/> Marcas ({brands.length})</button>
      <button className={tab==='sales'?'company-primary':'company-secondary'} onClick={()=>{setTab('sales');setShowForm(false)}}><Truck size={15}/> Vendas ({sales.length})</button>
    </div>
    <div className="company-panel-head eparts-list-head"><div><b>{tab==='products'?'Produtos do catálogo':tab==='suppliers'?'Fornecedores cadastrados':tab==='brands'?'Marcas cadastradas':'Pedidos e vendas'}</b><small>{tab==='products'?'Gerencie preço, custo, estoque e publicação no catálogo':tab==='suppliers'?'Cadastre parceiros que acompanham suas vendas':tab==='brands'?'Organize os produtos por marca':'Acompanhe pedidos, comissão da Eparts e valores dos fornecedores'}</small></div>{tab!=='sales'&&<button className="company-primary" onClick={startNew}><BadgePlus size={16}/> Novo cadastro</button>}</div>
    {error&&<div className="company-error-banner">{error}</div>}{notice&&<div className="company-success-banner">{notice}</div>}
    {showForm&&tab==='products'&&<form className="company-form" onSubmit={saveProduct}>
      <div className="company-form-grid"><label>Nome do produto<input required value={productForm.name} onChange={e=>setProductForm(v=>({...v,name:e.target.value}))}/></label><label>SKU / Código<input value={productForm.sku} onChange={e=>setProductForm(v=>({...v,sku:e.target.value}))}/></label><label>Marca<select value={productForm.brandId} onChange={e=>setProductForm(v=>({...v,brandId:e.target.value}))}><option value="">Sem marca</option>{brands.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label><label>Fornecedor<select required value={productForm.supplierId} onChange={e=>setProductForm(v=>({...v,supplierId:e.target.value}))}><option value="">Sem fornecedor</option>{suppliers.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label><label>Preço de custo (R$)<input type="number" min="0" step="0.01" required value={productForm.costPrice} onChange={e=>setProductForm(v=>({...v,costPrice:e.target.value}))}/></label><label>Preço de venda (R$)<input type="number" min="0" step="0.01" required value={productForm.salePrice} onChange={e=>setProductForm(v=>({...v,salePrice:e.target.value}))}/></label><label>Estoque inicial<input type="number" min="0" step="1" required value={productForm.stock} onChange={e=>setProductForm(v=>({...v,stock:e.target.value}))}/></label></div>
      <label>Descrição<textarea rows={2} value={productForm.description} onChange={e=>setProductForm(v=>({...v,description:e.target.value}))}/></label><label className="eparts-checkbox"><input type="checkbox" checked={productForm.showInCatalog} onChange={e=>setProductForm(v=>({...v,showInCatalog:e.target.checked}))}/> Publicar no catálogo online</label>
      <div className="company-form-actions"><button type="button" className="company-secondary" onClick={()=>setShowForm(false)}>Cancelar</button><button className="company-primary" disabled={busy}>{busy?'Salvando...':'Salvar produto'}</button></div>
    </form>}
    {showForm&&tab==='suppliers'&&<form className="company-form" onSubmit={saveSupplier}><div className="company-form-grid"><label>Nome do fornecedor<input required value={supplierForm.name} onChange={e=>setSupplierForm(v=>({...v,name:e.target.value}))}/></label><label>E-mail<input type="email" value={supplierForm.email} onChange={e=>setSupplierForm(v=>({...v,email:e.target.value}))}/></label><label>Telefone / WhatsApp<input value={supplierForm.phone} onChange={e=>setSupplierForm(v=>({...v,phone:e.target.value}))}/></label></div><div className="company-form-actions"><button type="button" className="company-secondary" onClick={()=>setShowForm(false)}>Cancelar</button><button className="company-primary" disabled={busy}>{busy?'Salvando...':'Salvar fornecedor'}</button></div></form>}
    {showForm&&tab==='brands'&&<form className="company-form" onSubmit={saveBrand}><label>Nome da marca<input required value={brandName} onChange={e=>setBrandName(e.target.value)}/></label><div className="company-form-actions"><button type="button" className="company-secondary" onClick={()=>setShowForm(false)}>Cancelar</button><button className="company-primary" disabled={busy}>{busy?'Salvando...':'Salvar marca'}</button></div></form>}
    {loading?<p className="company-empty">Carregando cadastros...</p>:tab==='products'?products.length===0?<p className="company-empty">Nenhum produto cadastrado. Comece adicionando o primeiro item do catálogo.</p>:<div className="company-table-wrap"><table><thead><tr><th>PRODUTO</th><th>MARCA</th><th>FORNECEDOR</th><th>CUSTO</th><th>VENDA</th><th>ESTOQUE</th><th>CATÁLOGO</th></tr></thead><tbody>{products.map(p=><tr key={p.id}><td><b>{p.name}</b><small>{p.sku||'Sem SKU'}</small></td><td>{p.eparts_brands?.[0]?.name||'—'}</td><td>{p.eparts_suppliers?.[0]?.name||'—'}</td><td>{money(p.cost_price)}</td><td><b>{money(p.sale_price)}</b></td><td>{p.stock_quantity}</td><td>{p.show_in_catalog?'Publicado':'Oculto'}</td></tr>)}</tbody></table></div>:tab==='suppliers'?suppliers.length===0?<p className="company-empty">Nenhum fornecedor cadastrado.</p>:<div className="company-table-wrap"><table><thead><tr><th>FORNECEDOR</th><th>E-MAIL</th><th>TELEFONE</th></tr></thead><tbody>{suppliers.map(s=><tr key={s.id}><td><b>{s.name}</b></td><td>{s.email||'—'}</td><td>{s.phone||'—'}</td></tr>)}</tbody></table></div>:tab==='brands'?(brands.length===0?<p className="company-empty">Nenhuma marca cadastrada.</p>:<div className="company-table-wrap"><table><thead><tr><th>MARCA</th></tr></thead><tbody>{brands.map(b=><tr key={b.id}><td>{b.name}</td></tr>)}</tbody></table></div>):(sales.length===0?<p className="company-empty">Nenhum pedido registrado. As vendas aparecerão aqui.</p>:<div className="company-table-wrap"><table><thead><tr><th>PEDIDO</th><th>CLIENTE</th><th>DATA</th><th>TOTAL</th><th>COMISSÃO Eparts (12%)</th><th>FORNECEDORES (88%)</th><th>PAGAMENTO</th></tr></thead><tbody>{sales.map(sale=><tr key={sale.id}><td><b>#{sale.order_number}</b><small>{sale.status}</small></td><td><b>{sale.customer_name||'Cliente do catálogo'}</b><small>{sale.customer_phone||'—'}</small></td><td>{new Date(sale.created_at).toLocaleDateString('pt-BR')}</td><td><b>{money(sale.total_amount)}</b></td><td>{money(sale.eparts_commission_amount)}</td><td>{money(sale.supplier_amount)}</td><td>{sale.payment_status==='paid'?'Pago':sale.payment_status==='partially_paid'?'Parcial':'Pendente'}</td></tr>)}</tbody></table></div>)}
  </section>
}
