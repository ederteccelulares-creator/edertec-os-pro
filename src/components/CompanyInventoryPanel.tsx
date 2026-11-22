import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Plus, RefreshCw, Search, Package, AlertTriangle } from 'lucide-react'
import { createCompanyProduct, listCompanyProducts, type CompanyProduct } from '../lib/company-inventory'
import type { Company } from '../lib/company-data'

const money = (n:number) => Number(n||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})

export default function CompanyInventoryPanel({company}:{company:Company}) {
  const [products,setProducts] = useState<CompanyProduct[]>([])
  const [loading,setLoading] = useState(true)
  const [busy,setBusy] = useState(false)
  const [error,setError] = useState('')
  const [notice,setNotice] = useState('')
  const [search,setSearch] = useState('')
  const [showForm,setShowForm] = useState(false)
  const [form,setForm] = useState({sku:'',name:'',description:'',costPrice:'0',salePrice:'0',minimumStock:'0'})

  const load = useCallback(async()=>{
    setLoading(true);setError('')
    try { setProducts(await listCompanyProducts({companyId:company.id,search,limit:300})) }
    catch(e) {setError(e instanceof Error?e.message:'Erro ao carregar produtos.')}
    finally {setLoading(false)}
  },[company.id,search])

  useEffect(()=>{void load()},[load])

  async function submit(event:FormEvent) {
    event.preventDefault();setBusy(true);setError('');setNotice('')
    try {
      await createCompanyProduct({
        companyId:company.id,sku:form.sku,name:form.name,description:form.description,
        costPrice:Number(form.costPrice),salePrice:Number(form.salePrice),
        minimumStock:Number(form.minimumStock),
      })
      setForm({sku:'',name:'',description:'',costPrice:'0',salePrice:'0',minimumStock:'0'})
      setShowForm(false);setNotice('Produto cadastrado com sucesso.');await load()
    } catch(e) {setError(e instanceof Error?e.message:'Falha ao cadastrar produto.')}
    finally {setBusy(false)}
  }

  const lowStock = products.filter(p=>Number(p.stock_quantity)<=Number(p.min_stock)).length

  return <section className="company-panel">
    <div className="company-panel-head">
      <div><b>Estoque e produtos</b><small>{products.length} produtos · {lowStock} com estoque baixo</small></div>
      <button className="company-primary" onClick={()=>setShowForm(v=>!v)}><Plus size={16}/> Novo produto</button>
    </div>
    {error&&<div className="company-error-banner">{error}</div>}
    {notice&&<div className="company-notice-banner">{notice}</div>}
    <div className="company-inventory-tools">
      <label><Search size={16}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar por nome ou SKU"/></label>
      <button className="company-icon-button" onClick={()=>void load()} title="Atualizar"><RefreshCw size={16}/></button>
    </div>
    {showForm&&<form className="company-form" onSubmit={submit}>
      <h3>Novo produto</h3>
      <div className="company-form-grid">
        <label>Nome do produto<input required value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></label>
        <label>SKU / Código<input value={form.sku} onChange={e=>setForm({...form,sku:e.target.value})}/></label>
        <label>Preço de custo (R$)<input required type="number" min="0" step="0.01" value={form.costPrice} onChange={e=>setForm({...form,costPrice:e.target.value})}/></label>
        <label>Preço de venda (R$)<input required type="number" min="0" step="0.01" value={form.salePrice} onChange={e=>setForm({...form,salePrice:e.target.value})}/></label>
        <label>Estoque mínimo<input required type="number" min="0" step="0.01" value={form.minimumStock} onChange={e=>setForm({...form,minimumStock:e.target.value})}/></label>
      </div>
      <label>Descrição<input value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/></label>
      <div className="company-form-actions"><button type="button" className="company-secondary" onClick={()=>setShowForm(false)}>Cancelar</button><button className="company-primary" disabled={busy}>{busy?'Salvando...':'Salvar produto'}</button></div>
    </form>}
    {loading?<p className="company-empty">Carregando estoque...</p>:products.length===0?<p className="company-empty"><Package size={22}/><br/>Nenhum produto encontrado.</p>:
      <div className="company-table-wrap"><table><thead><tr><th>PRODUTO</th><th>SKU</th><th>CUSTO</th><th>VENDA</th><th>ESTOQUE</th><th>MÍNIMO</th><th>SITUAÇÃO</th></tr></thead><tbody>
        {products.map(p=><tr key={p.id}><td><b>{p.name}</b><small>{p.description||'—'}</small></td><td>{p.sku||'—'}</td><td>{money(p.cost_price)}</td><td>{money(p.sale_price)}</td><td><b>{Number(p.stock_quantity).toLocaleString('pt-BR')}</b></td><td>{Number(p.min_stock).toLocaleString('pt-BR')}</td><td>{Number(p.stock_quantity)<=Number(p.min_stock)?<span className="company-low-stock"><AlertTriangle size={13}/> Estoque baixo</span>:<span className="company-stock-ok">Normal</span>}</td></tr>)}
      </tbody></table></div>}
    <p className="company-inventory-note">O estoque inicial é registrado no cadastro do produto. Entradas, saídas e transferências serão liberadas após a rotina transacional de movimentação estar pronta.</p>
  </section>
}
