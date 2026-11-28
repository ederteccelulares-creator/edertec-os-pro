import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { BadgePlus, Boxes, Package, RefreshCw, Truck, Wallet } from 'lucide-react'
import { supabase } from '../lib/supabase'

type Customer = { id:string; name:string; email:string|null; phone:string|null; document:string|null; address:Record<string,unknown> }
type Brand = { id:string; name:string }
type Supplier = { id:string; name:string; contact_name:string|null; document:string|null; email:string|null; phone:string|null; notes:string|null; user_id?:string|null; is_active:boolean }
type Product = { id:string; name:string; sku:string|null; barcode:string|null; sale_price:number; cost_price:number; stock_quantity:number; is_active:boolean; show_in_catalog:boolean; eparts_brands?:{name:string}[]|null; eparts_suppliers?:{name:string}[]|null }
type Props = { companyId:string; initialTab?:Tab; initialCreate?:boolean }
type Sale = { id:string; order_number:number; status:string; payment_status:string; total_amount:number; eparts_commission_amount:number; supplier_amount:number; customer_name:string|null; customer_phone:string|null; customer_email?:string|null; customer_address?:Record<string,unknown>|null; notes?:string|null; source?:string; created_at:string };
type SaleItem = {id:string;product_name:string;sku:string|null;quantity:number;unit_price:number;line_total:number;eparts_commission_amount:number;supplier_amount:number};
type SaleEvent = {id:string;old_status:string|null;new_status:string;old_payment_status:string|null;new_payment_status:string;created_at:string};
type Payout = {id:string;supplier_id:string;sale_id:string|null;amount:number;payment_method:string;paid_at:string;reference:string|null;notes:string|null;eparts_suppliers?:{name:string}[]|null};
type SupplierBalance = {supplier_id:string;supplier_name:string;eligible_amount:number;paid_amount:number;pending_amount:number};
type Tab = 'products'|'suppliers'|'brands'|'sales'|'payouts'|'customers'
const money=(value:number)=>Number(value||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})

export default function EpartsCatalogAdminPanel({companyId,initialTab='products',initialCreate=false}:Props) {
  const [tab,setTab]=useState<Tab>(initialTab)
  const [products,setProducts]=useState<Product[]>([])
  const [customers,setCustomers]=useState<Customer[]>([])
  const [customerForm,setCustomerForm]=useState({name:'',phone:'',email:'',document:'',street:'',number:'',complement:'',neighborhood:'',city:'',state:'',zip:'',notes:''})
  const [customerSearch,setCustomerSearch]=useState('')
  const [editingCustomerId,setEditingCustomerId]=useState<string|null>(null)
  const [supplierSearch,setSupplierSearch]=useState('')
  const [editingSupplierId,setEditingSupplierId]=useState<string|null>(null)
  const [suppliers,setSuppliers]=useState<Supplier[]>([])
  const [brands,setBrands]=useState<Brand[]>([])
  const [sales,setSales]=useState<Sale[]>([])
  const [payouts,setPayouts]=useState<Payout[]>([])
  const [supplierBalances,setSupplierBalances]=useState<SupplierBalance[]>([])
  const [payoutForm,setPayoutForm]=useState({supplierId:'',saleId:'',amount:'',paymentMethod:'pix',reference:'',notes:''})
  const [loading,setLoading]=useState(true)
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const [notice,setNotice]=useState('')
  const [updatingSale,setUpdatingSale]=useState<string|null>(null)
  const [selectedSale,setSelectedSale]=useState<Sale|null>(null)
  const [saleItems,setSaleItems]=useState<SaleItem[]>([])
  const [saleEvents,setSaleEvents]=useState<SaleEvent[]>([])
  const [detailLoading,setDetailLoading]=useState(false)
  const [showForm,setShowForm]=useState(initialCreate)
  const [productForm,setProductForm]=useState({name:'',sku:'',barcode:'',description:'',brandId:'',supplierId:'',costPrice:'0',salePrice:'0',stock:'0',showInCatalog:true})
  const [supplierForm,setSupplierForm]=useState({name:'',contactName:'',document:'',email:'',phone:'',notes:'',userId:''})
  const [supplierBrandIds,setSupplierBrandIds]=useState<string[]>([])
  const [brandName,setBrandName]=useState('')

  const load=useCallback(async()=>{
    if(!supabase)return
    setLoading(true);setError('')
    try{
      const [p,s,b,o,po,balances,cu]=await Promise.all([ 
        supabase.from('eparts_products').select('id,name,sku,barcode,sale_price,cost_price,stock_quantity,is_active,show_in_catalog,eparts_brands(name),eparts_suppliers(name)').eq('company_id',companyId).order('name'),
        supabase.from('eparts_suppliers').select('id,name,contact_name,document,email,phone,notes,user_id,is_active').eq('company_id',companyId).order('name'),
        supabase.from('eparts_brands').select('id,name').eq('company_id',companyId).order('name'),
        supabase.from('eparts_sales').select('id,order_number,status,payment_status,total_amount,eparts_commission_amount,supplier_amount,customer_name,customer_phone,created_at').eq('company_id',companyId).order('created_at',{ascending:false}).limit(100),
        supabase.from('eparts_supplier_payouts').select('id,supplier_id,sale_id,amount,payment_method,paid_at,reference,notes,eparts_suppliers(name)').eq('company_id',companyId).order('paid_at',{ascending:false}).limit(200),
        supabase.rpc('eparts_supplier_balances',{p_company_id:companyId}),
        supabase.from('eparts_customers').select('id,name,email,phone,document,address').eq('company_id',companyId).order('name'),
      ])
      if(p.error)throw p.error;if(s.error)throw s.error;if(b.error)throw b.error;if(o.error)throw o.error;if(po.error)throw po.error;if(balances.error)throw balances.error;if(cu.error)throw cu.error
      setProducts((p.data||[]) as Product[]);setSuppliers((s.data||[]) as Supplier[]);setBrands((b.data||[]) as Brand[]);setSales((o.data||[]) as Sale[]);setPayouts((po.data||[]) as Payout[]);setSupplierBalances((balances.data||[]) as SupplierBalance[]);setCustomers((cu.data||[]) as Customer[])
    }catch(e){setError(e instanceof Error?e.message:'Não foi possível carregar os dados do Eparts.')}
    finally{setLoading(false)}
  },[companyId])
  useEffect(()=>{void load()},[load])
  useEffect(()=>{if(initialCreate){setTab(initialTab);setShowForm(true)}},[initialCreate,initialTab])

  async function saveCustomer(event:FormEvent){
    event.preventDefault();if(!supabase)return
    if(customerForm.name.trim().length<2){setError('Informe o nome do cliente.');return}
    setBusy(true);setError('');setNotice('')
    const address={street:customerForm.street.trim(),number:customerForm.number.trim(),complement:customerForm.complement.trim(),neighborhood:customerForm.neighborhood.trim(),city:customerForm.city.trim(),state:customerForm.state.trim(),zip:customerForm.zip.trim(),notes:customerForm.notes.trim()}
    try{const payload={name:customerForm.name.trim(),phone:customerForm.phone.trim()||null,email:customerForm.email.trim()||null,document:customerForm.document.trim()||null,address};const result=editingCustomerId?await supabase.from('eparts_customers').update(payload).eq('company_id',companyId).eq('id',editingCustomerId):await supabase.from('eparts_customers').insert({company_id:companyId,...payload});if(result.error)throw result.error;setCustomerForm({name:'',phone:'',email:'',document:'',street:'',number:'',complement:'',neighborhood:'',city:'',state:'',zip:'',notes:''});setEditingCustomerId(null);setShowForm(false);setNotice(editingCustomerId?'Cliente atualizado com sucesso.':'Cliente cadastrado com sucesso.');await load()}
    catch(e){setError(e instanceof Error?e.message:'Falha ao cadastrar cliente.')}
    finally{setBusy(false)}
  }
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
    try{const payload={name:supplierForm.name.trim(),contact_name:supplierForm.contactName.trim()||null,document:supplierForm.document.trim()||null,email:supplierForm.email.trim()||null,phone:supplierForm.phone.trim()||null,notes:supplierForm.notes.trim()||null,user_id:supplierForm.userId.trim()||null};let supplierId=editingSupplierId;if(supplierId){const result=await supabase.from('eparts_suppliers').update(payload).eq('company_id',companyId).eq('id',supplierId);if(result.error)throw result.error}else{const result=await supabase.from('eparts_suppliers').insert({company_id:companyId,...payload}).select('id').single();if(result.error)throw result.error;supplierId=result.data.id}const remove=await supabase.from('eparts_supplier_brands').delete().eq('company_id',companyId).eq('supplier_id',supplierId);if(remove.error)throw remove.error;if(supplierBrandIds.length){const add=await supabase.from('eparts_supplier_brands').insert(supplierBrandIds.map(brand_id=>({company_id:companyId,supplier_id:supplierId,brand_id})));if(add.error)throw add.error}setSupplierForm({name:'',contactName:'',document:'',email:'',phone:'',notes:'',userId:''});setSupplierBrandIds([]);setEditingSupplierId(null);setShowForm(false);setNotice(editingSupplierId?'Fornecedor e marcas atualizados.':'Fornecedor cadastrado com marcas vinculadas.');await load()}
    catch(e){setError(e instanceof Error?e.message:'Falha ao cadastrar fornecedor.')}
    finally{setBusy(false)}
  }

  function editCustomer(customer:Customer){
    const a=customer.address||{};
    setCustomerForm({name:customer.name,phone:customer.phone||'',email:customer.email||'',document:customer.document||'',street:String(a.street||''),number:String(a.number||''),complement:String(a.complement||''),neighborhood:String(a.neighborhood||''),city:String(a.city||''),state:String(a.state||''),zip:String(a.zip||''),notes:String(a.notes||'')});
    setEditingCustomerId(customer.id);setShowForm(true);setError('');setNotice('');
  }
  async function editSupplier(supplier:Supplier){
    setSupplierForm({name:supplier.name,contactName:supplier.contact_name||'',document:supplier.document||'',email:supplier.email||'',phone:supplier.phone||'',notes:supplier.notes||'',userId:supplier.user_id||''});
    setEditingSupplierId(supplier.id);setShowForm(true);setError('');setNotice('');setSupplierBrandIds([]);
    const {data,error}=await supabase!.from('eparts_supplier_brands').select('brand_id').eq('company_id',companyId).eq('supplier_id',supplier.id);
    if(error){setError(error.message);return}setSupplierBrandIds((data||[]).map(row=>row.brand_id));
  }
  async function toggleSupplier(supplier:Supplier){
    if(!supabase)return;setBusy(true);setError('');setNotice('');
    try{const {error}=await supabase.from('eparts_suppliers').update({is_active:!supplier.is_active}).eq('company_id',companyId).eq('id',supplier.id);if(error)throw error;setNotice(supplier.is_active?'Fornecedor inativado.':'Fornecedor reativado.');await load()}
    catch(e){setError(e instanceof Error?e.message:'Não foi possível alterar o fornecedor.')}finally{setBusy(false)}
  }
  async function saveProduct(event:FormEvent){
    event.preventDefault();if(!supabase)return
    const cost=Number(productForm.costPrice),price=Number(productForm.salePrice),stock=Number(productForm.stock)
    if(!productForm.name.trim()||!productForm.supplierId||!Number.isFinite(cost)||!Number.isFinite(price)||!Number.isInteger(stock)||cost<0||price<0||stock<0){setError('Informe o nome, selecione o fornecedor e confira preços e estoque.');return}
    setBusy(true);setError('');setNotice('')
    try{
      const {error}=await supabase.from('eparts_products').insert({company_id:companyId,name:productForm.name.trim(),sku:productForm.sku.trim()||null,barcode:productForm.barcode.trim()||null,description:productForm.description.trim()||null,brand_id:productForm.brandId||null,supplier_id:productForm.supplierId||null,cost_price:cost,sale_price:price,stock_quantity:stock,show_in_catalog:productForm.showInCatalog,is_active:true})
      if(error)throw error
      setProductForm({name:'',sku:'',barcode:'',description:'',brandId:'',supplierId:'',costPrice:'0',salePrice:'0',stock:'0',showInCatalog:true});setShowForm(false);setNotice('Produto cadastrado no Eparts.');await load()
    }catch(e){setError(e instanceof Error?e.message:'Falha ao cadastrar produto.')}
    finally{setBusy(false)}
  }
  async function savePayout(event:FormEvent){
    event.preventDefault();if(!supabase)return
    const amount=Number(payoutForm.amount)
    if(!payoutForm.supplierId||!Number.isFinite(amount)||amount<=0){setError('Selecione o fornecedor e informe um valor válido.');return}
    setBusy(true);setError('');setNotice('')
    try{
      const {error}=await supabase.rpc('eparts_register_supplier_payout',{p_company_id:companyId,p_supplier_id:payoutForm.supplierId,p_amount:amount,p_payment_method:payoutForm.paymentMethod,p_sale_id:payoutForm.saleId||null,p_reference:payoutForm.reference.trim()||null,p_notes:payoutForm.notes.trim()||null})
      if(error)throw error
      setPayoutForm({supplierId:'',saleId:'',amount:'',paymentMethod:'pix',reference:'',notes:''})
      setNotice('Repasse registrado com sucesso.');await load()
    }catch(e){setError(e instanceof Error?e.message:'Falha ao registrar repasse.')}
    finally{setBusy(false)}
  }
  async function openSale(sale:Sale){
    if(!supabase)return
    setSelectedSale(sale);setDetailLoading(true);setSaleItems([]);setSaleEvents([])
    try{
      const [items,events]=await Promise.all([
        supabase.from('eparts_sale_items').select('id,product_name,sku,quantity,unit_price,line_total,eparts_commission_amount,supplier_amount').eq('company_id',companyId).eq('sale_id',sale.id).order('created_at'),
        supabase.from('eparts_sale_events').select('id,old_status,new_status,old_payment_status,new_payment_status,created_at').eq('company_id',companyId).eq('sale_id',sale.id).order('created_at',{ascending:false}).limit(50)
      ])
      if(items.error)throw items.error;if(events.error)throw events.error
      setSaleItems((items.data||[]) as SaleItem[]);setSaleEvents((events.data||[]) as SaleEvent[])
    }catch(e){setError(e instanceof Error?e.message:'Não foi possível abrir os detalhes do pedido.')}finally{setDetailLoading(false)}
  }
  async function cancelPosSale(sale:Sale){
    if(!supabase||sale.source!=='pos'||sale.status==='cancelled')return
    const confirmed=window.confirm('Cancelar a venda PDV #'+sale.order_number+' e devolver os itens ao estoque? Esta ação não pode ser desfeita.')
    if(!confirmed)return
    setUpdatingSale(sale.id);setError('');setNotice('')
    try{
      const {error}=await supabase.rpc('eparts_cancel_pos_sale',{p_company_id:companyId,p_sale_id:sale.id,p_reason:'Cancelamento solicitado no painel EPARTS'})
      if(error)throw error
      setNotice('Venda cancelada e estoque devolvido. O histórico foi preservado.')
      if(selectedSale?.id===sale.id)setSelectedSale({...sale,status:'cancelled',payment_status:'refunded'})
      await load()
    }catch(e){setError(e instanceof Error?e.message:'Não foi possível cancelar a venda.')}
    finally{setUpdatingSale(null)}
  }
  async function updateSale(sale:Sale,status:string,paymentStatus:string){
    if(!supabase)return
    if(status==='cancelled'){
      setError('Use a ação de cancelamento para devolver o estoque com segurança.');return
    }
    setUpdatingSale(sale.id);setError('');setNotice('')
    try{
      const {error}=await supabase.rpc('eparts_update_sale',{p_company_id:companyId,p_sale_id:sale.id,p_status:status,p_payment_status:paymentStatus})
      if(error)throw error
      setNotice('Pedido atualizado com sucesso.');await load()
    }catch(e){setError(e instanceof Error?e.message:'Não foi possível atualizar o pedido.')}
    finally{setUpdatingSale(null)}
  }
  const startNew=()=>{setShowForm(true);setError('');setNotice('')}
  return <section className="company-panel eparts-admin-panel">
    <style>{`
      .eparts-admin-panel .eparts-tabs {
        display: grid !important;
        grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
        gap: 10px !important;
        width: 100% !important;
        max-width: 100% !important;
        min-width: 0 !important;
        box-sizing: border-box !important;
      }
      .eparts-admin-panel .eparts-tabs > button {
        display: flex !important;
        min-width: 0 !important;
        width: 100% !important;
        max-width: 100% !important;
        flex: initial !important;
        justify-content: center !important;
        white-space: normal !important;
        text-align: center !important;
        line-height: 1.25 !important;
        padding: 12px 8px !important;
        overflow-wrap: anywhere !important;
        box-sizing: border-box !important;
      }
      .eparts-admin-panel .eparts-tabs > button {
        min-height: 46px !important;
        border-radius: 12px !important;
        font-weight: 700 !important;
        gap: 9px !important;
      }
      .eparts-admin-panel .company-panel-head {
        gap: 14px;
      }
      .eparts-admin-panel .company-panel-head small {
        display: block;
        line-height: 1.45;
        margin-top: 5px;
      }
      .eparts-admin-panel .company-form {
        border: 1px solid rgba(214,166,92,.28);
        border-radius: 16px;
        padding: clamp(14px, 2.5vw, 22px);
        background: rgba(255,255,255,.025);
        margin: 16px 0;
      }
      .eparts-admin-panel .company-form-grid {
        gap: 14px;
      }
      .eparts-admin-panel .company-form label {
        min-width: 0;
      }
      .eparts-admin-panel .company-form input,
      .eparts-admin-panel .company-form select,
      .eparts-admin-panel .company-form textarea {
        width: 100%;
        max-width: 100%;
        box-sizing: border-box;
      }
      .eparts-admin-panel .company-table-wrap {
        max-width: 100%;
        overflow-x: auto;
        -webkit-overflow-scrolling: touch;
        border-radius: 12px;
      }
      .eparts-admin-panel table {
        min-width: 720px;
      }
      @media (max-width: 640px) {
        .eparts-admin-panel .eparts-tabs {
          grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
          gap: 8px !important;
        }
        .eparts-admin-panel .eparts-tabs > button {
          justify-content: center !important;
          text-align: center !important;
          min-height: 48px !important;
          padding: 10px 8px !important;
          font-size: 13px !important;
          overflow-wrap: anywhere !important;
        }
      }
      @media (max-width: 600px) {
        .eparts-admin-panel {
          min-width: 0;
          max-width: 100%;
          box-sizing: border-box;
        }
        .eparts-admin-panel .company-panel-head {
          align-items: stretch;
          flex-wrap: wrap;
        }
        .eparts-admin-panel .company-panel-head > button {
          width: 100%;
          justify-content: center;
        }
        .eparts-admin-panel .eparts-list-head {
          align-items: stretch;
          flex-wrap: wrap;
          gap: 12px;
        }
        .eparts-admin-panel .eparts-list-head > button {
          width: 100%;
          justify-content: center;
        }
        .eparts-admin-panel .company-form-actions {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
        }
      }
    `}</style>
    <div className="company-panel-head"><div><b>Central Eparts</b><small>Cadastros e catálogo do marketplace · comissão da plataforma: 12%</small></div><button className="company-secondary" onClick={()=>void load()} disabled={loading}><RefreshCw size={15}/> Atualizar</button></div>
    <div className="company-inline-actions eparts-tabs">
      <button className={tab==='customers'?'company-primary':'company-secondary'} onClick={()=>{setTab('customers');setShowForm(false)}}><BadgePlus size={15}/> Clientes ({customers.length})</button>
      <button className={tab==='products'?'company-primary':'company-secondary'} onClick={()=>{setTab('products');setShowForm(false)}}><Package size={15}/> Produtos ({products.length})</button>
      <button className={tab==='suppliers'?'company-primary':'company-secondary'} onClick={()=>{setTab('suppliers');setShowForm(false)}}><Truck size={15}/> Fornecedores ({suppliers.length})</button>
      <button className={tab==='brands'?'company-primary':'company-secondary'} onClick={()=>{setTab('brands');setShowForm(false)}}><Boxes size={15}/> Marcas ({brands.length})</button>
      <button className={tab==='sales'?'company-primary':'company-secondary'} onClick={()=>{setTab('sales');setShowForm(false)}}><Truck size={15}/> Vendas ({sales.length})</button>
      <button className={tab==='payouts'?'company-primary':'company-secondary'} onClick={()=>{setTab('payouts');setShowForm(false)}}><Wallet size={15}/> Repasses ({payouts.length})</button>
    </div>
    <div className="company-panel-head eparts-list-head"><div><b>{tab==='customers'?'Clientes cadastrados':tab==='products'?'Produtos do catálogo':tab==='suppliers'?'Fornecedores cadastrados':tab==='brands'?'Marcas cadastradas':tab==='payouts'?'Repasses aos fornecedores':'Pedidos e vendas'}</b><small>{tab==='customers'?'Cadastre e consulte os clientes da sua empresa':tab==='products'?'Gerencie preço, custo, estoque e publicação no catálogo':tab==='suppliers'?'Cadastre parceiros que acompanham suas vendas':tab==='brands'?'Organize os produtos por marca':tab==='payouts'?'Registre e consulte valores já repassados':'Acompanhe pedidos, comissão da Eparts e valores dos fornecedores'}</small></div>{tab!=='sales'&&tab!=='payouts'&&<button type="button" className="company-primary" onClick={startNew}><BadgePlus size={16}/> {tab==='customers'?'Cadastrar cliente':tab==='suppliers'?'Cadastrar fornecedor':tab==='brands'?'Cadastrar marca':'Novo produto'}</button>}</div>
    {error&&<div className="company-error-banner">{error}</div>}{notice&&<div className="company-success-banner">{notice}</div>}
    {showForm&&tab==='customers'&&<form className="company-form" onSubmit={saveCustomer}>
      <div className="company-form-grid"><label>Nome completo<input required value={customerForm.name} onChange={e=>setCustomerForm(v=>({...v,name:e.target.value}))}/></label><label>Telefone / WhatsApp<input value={customerForm.phone} onChange={e=>setCustomerForm(v=>({...v,phone:e.target.value}))}/></label><label>E-mail<input type="email" value={customerForm.email} onChange={e=>setCustomerForm(v=>({...v,email:e.target.value}))}/></label><label>CPF / CNPJ<input value={customerForm.document} onChange={e=>setCustomerForm(v=>({...v,document:e.target.value}))}/></label><label>CEP<input value={customerForm.zip} onChange={e=>setCustomerForm(v=>({...v,zip:e.target.value}))}/></label><label>Rua<input value={customerForm.street} onChange={e=>setCustomerForm(v=>({...v,street:e.target.value}))}/></label><label>Número<input value={customerForm.number} onChange={e=>setCustomerForm(v=>({...v,number:e.target.value}))}/></label><label>Complemento<input value={customerForm.complement} onChange={e=>setCustomerForm(v=>({...v,complement:e.target.value}))}/></label><label>Bairro<input value={customerForm.neighborhood} onChange={e=>setCustomerForm(v=>({...v,neighborhood:e.target.value}))}/></label><label>Cidade<input value={customerForm.city} onChange={e=>setCustomerForm(v=>({...v,city:e.target.value}))}/></label><label>Estado<input maxLength={2} value={customerForm.state} onChange={e=>setCustomerForm(v=>({...v,state:e.target.value.toUpperCase()}))}/></label></div>
      <label>Observações<textarea rows={2} value={customerForm.notes} onChange={e=>setCustomerForm(v=>({...v,notes:e.target.value}))}/></label><div className="company-form-actions"><button type="button" className="company-secondary" onClick={()=>{setShowForm(false);setEditingCustomerId(null)}}>Cancelar</button><button className="company-primary" disabled={busy}>{busy?'Salvando...':editingCustomerId?'Atualizar cliente':'Salvar cliente'}</button></div>
    </form>}
    {showForm&&tab==='products'&&<form className="company-form" onSubmit={saveProduct}>
      <div className="company-form-grid"><label>Nome do produto<input required value={productForm.name} onChange={e=>setProductForm(v=>({...v,name:e.target.value}))}/></label><label>SKU / Código interno<input value={productForm.sku} onChange={e=>setProductForm(v=>({...v,sku:e.target.value}))}/></label><label>Código de barras<input value={productForm.barcode} onChange={e=>setProductForm(v=>({...v,barcode:e.target.value.replace(/\s/g,'')}))} placeholder='EAN / GTIN'/></label><label>Marca<select value={productForm.brandId} onChange={e=>setProductForm(v=>({...v,brandId:e.target.value}))}><option value="">Sem marca</option>{brands.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label><label>Fornecedor<select required value={productForm.supplierId} onChange={e=>setProductForm(v=>({...v,supplierId:e.target.value}))}><option value="">Sem fornecedor</option>{suppliers.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label><label>Preço de custo (R$)<input type="number" min="0" step="0.01" required value={productForm.costPrice} onChange={e=>setProductForm(v=>({...v,costPrice:e.target.value}))}/></label><label>Preço de venda (R$)<input type="number" min="0" step="0.01" required value={productForm.salePrice} onChange={e=>setProductForm(v=>({...v,salePrice:e.target.value}))}/></label><label>Estoque inicial<input type="number" min="0" step="1" required value={productForm.stock} onChange={e=>setProductForm(v=>({...v,stock:e.target.value}))}/></label></div>
      <label>Descrição<textarea rows={2} value={productForm.description} onChange={e=>setProductForm(v=>({...v,description:e.target.value}))}/></label><label className="eparts-checkbox"><input type="checkbox" checked={productForm.showInCatalog} onChange={e=>setProductForm(v=>({...v,showInCatalog:e.target.checked}))}/> Publicar no catálogo online</label>
      <div className="company-form-actions"><button type="button" className="company-secondary" onClick={()=>setShowForm(false)}>Cancelar</button><button className="company-primary" disabled={busy}>{busy?'Salvando...':'Salvar produto'}</button></div>
    </form>}
    {showForm&&tab==='suppliers'&&<form className="company-form" onSubmit={saveSupplier}><div className="company-form-grid"><label>Nome da empresa / fornecedor<input required value={supplierForm.name} onChange={e=>setSupplierForm(v=>({...v,name:e.target.value}))}/></label><label>Responsável<input value={supplierForm.contactName} onChange={e=>setSupplierForm(v=>({...v,contactName:e.target.value}))}/></label><label>CPF / CNPJ<input value={supplierForm.document} onChange={e=>setSupplierForm(v=>({...v,document:e.target.value}))}/></label><label>E-mail<input type="email" value={supplierForm.email} onChange={e=>setSupplierForm(v=>({...v,email:e.target.value}))}/></label><label>Telefone / WhatsApp<input value={supplierForm.phone} onChange={e=>setSupplierForm(v=>({...v,phone:e.target.value}))}/></label><label>Vínculo da conta (opcional)<input value={supplierForm.userId} onChange={e=>setSupplierForm(v=>({...v,userId:e.target.value}))} placeholder="UUID da conta existente"/><small>Preencha apenas se o fornecedor já tiver acesso ao sistema.</small></label></div><fieldset style={{border:'1px solid rgba(214,166,92,.3)',borderRadius:12,padding:14,margin:'14px 0'}}><legend>Marcas que este fornecedor pode visualizar</legend>{brands.length===0?<small>Cadastre as marcas antes de vinculá-las.</small>:<div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:10}}>{brands.map(brand=><label key={brand.id} style={{display:'flex',alignItems:'center',gap:8}}><input type="checkbox" checked={supplierBrandIds.includes(brand.id)} onChange={e=>setSupplierBrandIds(ids=>e.target.checked?[...ids,brand.id]:ids.filter(id=>id!==brand.id))}/>{brand.name}</label>)}</div>}<small>O fornecedor verá movimentações dos produtos pertencentes às marcas selecionadas.</small></fieldset><label>Observações<textarea rows={2} value={supplierForm.notes} onChange={e=>setSupplierForm(v=>({...v,notes:e.target.value}))}/></label><div className="company-form-actions"><button type="button" className="company-secondary" onClick={()=>{setShowForm(false);setEditingSupplierId(null)}}>Cancelar</button><button className="company-primary" disabled={busy}>{busy?'Salvando...':editingSupplierId?'Atualizar fornecedor':'Salvar fornecedor'}</button></div></form>}
    {showForm&&tab==='brands'&&<form className="company-form" onSubmit={saveBrand}><label>Nome da marca<input required value={brandName} onChange={e=>setBrandName(e.target.value)}/></label><div className="company-form-actions"><button type="button" className="company-secondary" onClick={()=>setShowForm(false)}>Cancelar</button><button className="company-primary" disabled={busy}>{busy?'Salvando...':'Salvar marca'}</button></div></form>}
    {tab==='payouts'&&<>
      <div className="company-panel-head"><div><b>Saldo por fornecedor</b><small>Somente pedidos não cancelados e totalmente pagos liberam valores para repasse</small></div></div>
      <div className="company-stats-grid">
        <article className="company-stat-card"><span>Total liberado</span><strong>{money(supplierBalances.reduce((sum,b)=>sum+Number(b.eligible_amount),0))}</strong></article>
        <article className="company-stat-card"><span>Total repassado</span><strong>{money(supplierBalances.reduce((sum,b)=>sum+Number(b.paid_amount),0))}</strong></article>
        <article className="company-stat-card"><span>Saldo a repassar</span><strong>{money(supplierBalances.reduce((sum,b)=>sum+Math.max(Number(b.pending_amount),0),0))}</strong></article>
      </div>
      <div className="company-table-wrap"><table><thead><tr><th>FORNECEDOR</th><th>VALOR LIBERADO</th><th>JÁ REPASSADO</th><th>SITUAÇÃO DO SALDO</th></tr></thead><tbody>{supplierBalances.map(balance=>{const pending=Number(balance.pending_amount);return <tr key={balance.supplier_id}><td><b>{balance.supplier_name}</b></td><td>{money(Number(balance.eligible_amount))}</td><td>{money(Number(balance.paid_amount))}</td><td><b>{pending<0?'Crédito / adiantamento: '+money(Math.abs(pending)):money(pending)}</b></td></tr>})}{supplierBalances.length===0&&<tr><td colSpan={4}>Nenhum fornecedor cadastrado.</td></tr>}</tbody></table></div>
    </>}
    {tab==='payouts'&&<form className="company-form" onSubmit={savePayout}>
      <div className="company-form-grid">
        <label>Fornecedor<select required value={payoutForm.supplierId} onChange={e=>setPayoutForm(v=>({...v,supplierId:e.target.value}))}><option value="">Selecione</option>{suppliers.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
        <label>Valor do repasse (R$)<input type="number" min="0.01" step="0.01" required value={payoutForm.amount} onChange={e=>setPayoutForm(v=>({...v,amount:e.target.value}))}/></label>
        <label>Vincular a um pedido (opcional)<select value={payoutForm.saleId} onChange={e=>setPayoutForm(v=>({...v,saleId:e.target.value}))}><option value="">Repasse geral do fornecedor</option>{sales.filter(s=>s.payment_status==='paid'&&s.status!=='cancelled').map(s=><option key={s.id} value={s.id}>Pedido #{s.order_number} · {s.customer_name||'Cliente'} · {money(s.supplier_amount)}</option>)}</select><small>O sistema confere o saldo desse fornecedor especificamente no pedido.</small></label>
        <label>Forma de pagamento<select value={payoutForm.paymentMethod} onChange={e=>setPayoutForm(v=>({...v,paymentMethod:e.target.value}))}><option value="pix">PIX</option><option value="cash">Dinheiro</option><option value="transfer">Transferência</option><option value="bank_slip">Boleto</option><option value="card">Cartão</option><option value="other">Outro</option></select></label>
        <label>Referência<input value={payoutForm.reference} onChange={e=>setPayoutForm(v=>({...v,reference:e.target.value}))} placeholder="ID da transação ou pedido"/></label>
      </div>
      <label>Observações<textarea rows={2} value={payoutForm.notes} onChange={e=>setPayoutForm(v=>({...v,notes:e.target.value}))}/></label>
      <div className="company-form-actions"><button className="company-primary" disabled={busy}>{busy?'Salvando...':'Registrar repasse'}</button></div>
    </form>}
    {loading?<p className="company-empty">Carregando cadastros...</p>:tab==='customers'?<><label className="company-form" style={{display:'block'}}>Buscar cliente<input value={customerSearch} onChange={e=>setCustomerSearch(e.target.value)} placeholder="Nome, telefone, e-mail ou documento"/></label>{customers.filter(c=>[c.name,c.phone||'',c.email||'',c.document||''].some(v=>v.toLocaleLowerCase('pt-BR').includes(customerSearch.toLocaleLowerCase('pt-BR')))).length===0?<p className="company-empty">Nenhum cliente encontrado. Use Novo cadastro para adicionar o primeiro.</p>:<div className="company-table-wrap"><table><thead><tr><th>CLIENTE</th><th>TELEFONE</th><th>E-MAIL</th><th>CPF / CNPJ</th><th>AÇÕES</th></tr></thead><tbody>{customers.filter(c=>[c.name,c.phone||'',c.email||'',c.document||''].some(v=>v.toLocaleLowerCase('pt-BR').includes(customerSearch.toLocaleLowerCase('pt-BR')))).map(c=><tr key={c.id}><td><b>{c.name}</b></td><td>{c.phone||'—'}</td><td>{c.email||'—'}</td><td>{c.document||'—'}</td><td><button type="button" className="company-secondary" onClick={()=>editCustomer(c)}>Editar</button></td></tr>)}</tbody></table></div>}</>:tab==='products'?products.length===0?<p className="company-empty">Nenhum produto cadastrado. Comece adicionando o primeiro item do catálogo.</p>:<div className="company-table-wrap"><table><thead><tr><th>PRODUTO</th><th>MARCA</th><th>FORNECEDOR</th><th>CUSTO</th><th>VENDA</th><th>ESTOQUE</th><th>CATÁLOGO</th></tr></thead><tbody>{products.map(p=><tr key={p.id}><td><b>{p.name}</b><small>{p.sku||'Sem SKU'} · Barras: {p.barcode||'—'}</small></td><td>{p.eparts_brands?.[0]?.name||'—'}</td><td>{p.eparts_suppliers?.[0]?.name||'—'}</td><td>{money(p.cost_price)}</td><td><b>{money(p.sale_price)}</b></td><td>{p.stock_quantity}</td><td>{p.show_in_catalog?'Publicado':'Oculto'}</td></tr>)}</tbody></table></div>:tab==='suppliers'?<><label className="company-form" style={{display:'block'}}>Buscar fornecedor<input value={supplierSearch} onChange={e=>setSupplierSearch(e.target.value)} placeholder="Empresa, responsável, telefone ou CNPJ"/></label>{suppliers.filter(s=>[s.name,s.contact_name||'',s.email||'',s.phone||'',s.document||''].some(v=>v.toLocaleLowerCase('pt-BR').includes(supplierSearch.toLocaleLowerCase('pt-BR')))).length===0?<p className="company-empty">Nenhum fornecedor encontrado.</p>:<div className="company-table-wrap"><table><thead><tr><th>FORNECEDOR</th><th>E-MAIL</th><th>TELEFONE</th><th>SITUAÇÃO</th><th>AÇÕES</th></tr></thead><tbody>{suppliers.filter(s=>[s.name,s.contact_name||'',s.email||'',s.phone||'',s.document||''].some(v=>v.toLocaleLowerCase('pt-BR').includes(supplierSearch.toLocaleLowerCase('pt-BR')))).map(s=><tr key={s.id}><td><b>{s.name}</b><small>{s.contact_name||'Responsável não informado'} · {s.document||'Sem documento'}</small></td><td>{s.email||'—'}</td><td>{s.phone||'—'}</td><td>{s.is_active?'Ativo':'Inativo'}</td><td><div style={{display:'flex',gap:6,flexWrap:'wrap'}}><button type="button" className="company-secondary" onClick={()=>editSupplier(s)}>Editar</button><button type="button" className="company-secondary" disabled={busy} onClick={()=>void toggleSupplier(s)}>{s.is_active?'Inativar':'Reativar'}</button></div></td></tr>)}</tbody></table></div>}</> :tab==='payouts'?(payouts.length===0?<p className='company-empty'>Nenhum repasse registrado.</p>:<div className='company-table-wrap'><table><thead><tr><th>FORNECEDOR</th><th>PEDIDO</th><th>DATA</th><th>VALOR</th><th>PAGAMENTO</th><th>REFERÊNCIA</th><th>OBSERVAÇÕES</th></tr></thead><tbody>{payouts.map(p=><tr key={p.id}><td><b>{p.eparts_suppliers?.[0]?.name||suppliers.find(s=>s.id===p.supplier_id)?.name||'Fornecedor'}</b></td><td>{p.sale_id?('Pedido #'+(sales.find(s=>s.id===p.sale_id)?.order_number||'—')):'Geral'}</td><td>{new Date(p.paid_at).toLocaleString('pt-BR')}</td><td><b>{money(p.amount)}</b></td><td>{p.payment_method.toUpperCase()}</td><td>{p.reference||'—'}</td><td>{p.notes||'—'}</td></tr>)}</tbody></table></div>):tab==='brands'?(brands.length===0?<p className="company-empty">Nenhuma marca cadastrada.</p>:<div className="company-table-wrap"><table><thead><tr><th>MARCA</th></tr></thead><tbody>{brands.map(b=><tr key={b.id}><td>{b.name}</td></tr>)}</tbody></table></div>):(sales.length===0?<p className="company-empty">Nenhum pedido registrado. As vendas aparecerão aqui.</p>:<div className="company-table-wrap"><table><thead><tr><th>PEDIDO</th><th>CLIENTE</th><th>DATA</th><th>TOTAL</th><th>COMISSÃO Eparts (12%)</th><th>FORNECEDORES (88%)</th><th>PAGAMENTO</th><th>DETALHES</th><th>GERENCIAR</th></tr></thead><tbody>{sales.map(sale=><tr key={sale.id}><td><b>#{sale.order_number}</b><small>{sale.status}</small></td><td><b>{sale.customer_name||'Cliente do catálogo'}</b><small>{sale.customer_phone||'—'}</small></td><td>{new Date(sale.created_at).toLocaleDateString('pt-BR')}</td><td><b>{money(sale.total_amount)}</b></td><td>{money(sale.eparts_commission_amount)}</td><td>{money(sale.supplier_amount)}</td><td>{sale.payment_status==='paid'?'Pago':sale.payment_status==='partially_paid'?'Parcial':sale.payment_status==='refunded'?'Estornado':'Pendente'}</td><td><button type='button' className='company-secondary' onClick={()=>void openSale(sale)}>Ver pedido</button></td><td><div style={{display:'grid',gap:6,minWidth:150}}><select aria-label={'Status do pedido '+sale.order_number} value={sale.status} disabled={updatingSale===sale.id||sale.status==='cancelled'} onChange={e=>void updateSale(sale,e.target.value,sale.payment_status)}><option value='pending'>Pendente</option><option value='confirmed'>Confirmado</option><option value='processing'>Em separação</option><option value='shipped'>Enviado</option><option value='delivered'>Entregue</option></select><select aria-label={'Pagamento do pedido '+sale.order_number} value={sale.payment_status} disabled={updatingSale===sale.id} onChange={e=>void updateSale(sale,sale.status,e.target.value)}><option value='pending'>Pendente</option><option value='partially_paid'>Parcial</option><option value='paid'>Pago</option><option value='refunded'>Estornado</option></select>{sale.source==='pos'&&sale.status!=='cancelled'&&<button type='button' className='company-secondary' disabled={updatingSale===sale.id} onClick={()=>void cancelPosSale(sale)}>Cancelar venda e devolver estoque</button>}{updatingSale===sale.id&&<small>Salvando...</small>}</div></td></tr>)}</tbody></table></div>)}

    {selectedSale&&<div role="dialog" aria-modal="true" aria-label={'Detalhes do pedido '+selectedSale.order_number} style={{position:'fixed',inset:0,zIndex:1000,background:'rgba(0,0,0,.72)',display:'grid',placeItems:'center',padding:16}}><div style={{background:'#171717',color:'#fff',border:'1px solid #333',borderRadius:16,width:'min(900px,100%)',maxHeight:'90vh',overflowY:'auto',padding:20}}><div className='company-panel-head'><div><b>Pedido #{selectedSale.order_number}</b><small>{new Date(selectedSale.created_at).toLocaleString('pt-BR')}</small></div><button className='company-secondary' onClick={()=>setSelectedSale(null)}>Fechar</button></div><div className='company-stats-grid'><article className='company-stat-card'><span>Total</span><strong>{money(selectedSale.total_amount)}</strong></article><article className='company-stat-card'><span>Comissão Eparts (12%)</span><strong>{money(selectedSale.eparts_commission_amount)}</strong></article><article className='company-stat-card'><span>Fornecedores (88%)</span><strong>{money(selectedSale.supplier_amount)}</strong></article></div><h3>Dados do cliente</h3><p><b>{selectedSale.customer_name||'Cliente não informado'}</b><br/>{selectedSale.customer_phone||'Sem telefone'}</p><h3>Produtos do pedido</h3>{detailLoading?<p className='company-empty'>Carregando itens...</p>:saleItems.length===0?<p className='company-empty'>Nenhum item encontrado.</p>:<div className='company-table-wrap'><table><thead><tr><th>PRODUTO</th><th>SKU</th><th>QTD.</th><th>UNITÁRIO</th><th>TOTAL</th><th>FORNECEDOR</th></tr></thead><tbody>{saleItems.map(item=><tr key={item.id}><td><b>{item.product_name}</b></td><td>{item.sku||'—'}</td><td>{item.quantity}</td><td>{money(item.unit_price)}</td><td>{money(item.line_total)}</td><td>{money(item.supplier_amount)}</td></tr>)}</tbody></table></div>}<h3>Histórico de alterações</h3>{saleEvents.length===0?<p className='company-empty'>Nenhuma alteração registrada ainda.</p>:<div className='company-table-wrap'><table><thead><tr><th>DATA</th><th>STATUS</th><th>PAGAMENTO</th></tr></thead><tbody>{saleEvents.map(ev=><tr key={ev.id}><td>{new Date(ev.created_at).toLocaleString('pt-BR')}</td><td>{ev.old_status||'—'} → {ev.new_status}</td><td>{ev.old_payment_status||'—'} → {ev.new_payment_status}</td></tr>)}</tbody></table></div>}</div></div>}
  </section>
}
