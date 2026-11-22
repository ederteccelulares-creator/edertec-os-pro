import { useCallback, useEffect, useState, type FormEvent, type ChangeEvent } from 'react'
import { Plus, RefreshCw, Search, Package, AlertTriangle } from 'lucide-react'
import { createCompanyProduct, listCompanyProducts, listCompanyStockMovements, recordCompanyStockMovement, type CompanyProduct, type CompanyStockMovement } from '../lib/company-inventory'
import type { Company } from '../lib/company-data'

const money = (n:number) => Number(n||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})

export default function CompanyInventoryPanel({company}:{company:Company}) {
  const [products,setProducts] = useState<CompanyProduct[]>([])
  const [movements,setMovements] = useState<CompanyStockMovement[]>([])
  const [loading,setLoading] = useState(true)
  const [busy,setBusy] = useState(false)
  const [error,setError] = useState('')
  const [notice,setNotice] = useState('')
  const [search,setSearch] = useState('')
  const [showForm,setShowForm] = useState(false)
  const [movementProduct,setMovementProduct] = useState<CompanyProduct|null>(null)
  const [movement,setMovement] = useState({type:'in' as 'in'|'out'|'adjustment',quantity:'1',unitCost:'0',reason:''})
  const [form,setForm] = useState({sku:'',name:'',description:'',costPrice:'0',salePrice:'0',minimumStock:'0'})
  const [imageFile,setImageFile] = useState<File|null>(null)

  const load = useCallback(async()=>{
    setLoading(true);setError('')
    try { const [items,history] = await Promise.all([listCompanyProducts({companyId:company.id,search,limit:300}),listCompanyStockMovements({companyId:company.id,limit:100})]); setProducts(items); setMovements(history) }
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
        minimumStock:Number(form.minimumStock),imageFile,
      })
      setForm({sku:'',name:'',description:'',costPrice:'0',salePrice:'0',minimumStock:'0'});setImageFile(null)
      setShowForm(false);setNotice('Produto cadastrado com sucesso.');await load()
    } catch(e) {setError(e instanceof Error?e.message:'Falha ao cadastrar produto.')}
    finally {setBusy(false)}
  }

  async function submitMovement(event:FormEvent) {
    event.preventDefault()
    if (!movementProduct) return
    setBusy(true);setError('');setNotice('')
    try {
      await recordCompanyStockMovement({
        companyId:company.id,productId:movementProduct.id,movementType:movement.type,
        quantity:Number(movement.quantity),unitCost:Number(movement.unitCost),reason:movement.reason,
      })
      setMovementProduct(null);setMovement({type:'in',quantity:'1',unitCost:'0',reason:''})
      setNotice('Movimentação registrada e saldo atualizado.');await load()
    } catch(e) {setError(e instanceof Error?e.message:'Falha ao registrar movimentação.')}
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
    {movementProduct&&<form className="company-form" onSubmit={submitMovement}>
      <h3>Movimentar estoque · {movementProduct.name}</h3>
      <div className="company-form-grid">
        <label>Operação<select value={movement.type} onChange={e=>setMovement({...movement,type:e.target.value as typeof movement.type})}><option value="in">Entrada</option><option value="out">Saída</option><option value="adjustment">Ajustar saldo para</option></select></label>
        <label>{movement.type==='adjustment'?'Novo saldo':'Quantidade'}<input required type="number" min="0.01" step="0.01" value={movement.quantity} onChange={e=>setMovement({...movement,quantity:e.target.value})}/></label>
        <label>Custo unitário (R$)<input type="number" min="0" step="0.01" value={movement.unitCost} onChange={e=>setMovement({...movement,unitCost:e.target.value})}/></label>
      </div>
      <label>Motivo / observação<input value={movement.reason} onChange={e=>setMovement({...movement,reason:e.target.value})} placeholder="Ex.: compra, venda, perda, inventário"/></label>
      <div className="company-form-actions"><button type="button" className="company-secondary" onClick={()=>setMovementProduct(null)}>Cancelar</button><button className="company-primary" disabled={busy}>{busy?'Registrando...':'Confirmar movimentação'}</button></div>
    </form>}
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
      <label>Foto do produto (JPG, PNG ou WebP · até 5 MB)<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e:ChangeEvent<HTMLInputElement>)=>setImageFile(e.target.files?.[0]||null)}/>{imageFile&&<small>{imageFile.name}</small>}</label>
      <div className="company-form-actions"><button type="button" className="company-secondary" onClick={()=>setShowForm(false)}>Cancelar</button><button className="company-primary" disabled={busy}>{busy?'Salvando...':'Salvar produto'}</button></div>
    </form>}
    {loading?<p className="company-empty">Carregando estoque...</p>:search.trim()===''?<p className="company-empty">Digite o nome ou SKU na pesquisa para visualizar os produtos.</p>:products.length===0?<p className="company-empty"><Package size={22}/><br/>Nenhum produto encontrado para esta pesquisa.</p>:
      <div className="company-table-wrap"><table><thead><tr><th>PRODUTO</th><th>SKU</th><th>CUSTO</th><th>VENDA</th><th>ESTOQUE</th><th>MÍNIMO</th><th>SITUAÇÃO</th><th>AÇÃO</th></tr></thead><tbody>
        {products.map(p=><tr key={p.id}><td><div className="company-product-cell">{p.image_url?<img src={p.image_url} alt={p.name}/>:<span className="company-product-placeholder"><Package size={18}/></span>}<div><b>{p.name}</b><small>{p.description||'—'}</small></div></div></td><td>{p.sku||'—'}</td><td>{money(p.cost_price)}</td><td>{money(p.sale_price)}</td><td><b>{Number(p.stock_quantity).toLocaleString('pt-BR')}</b></td><td>{Number(p.min_stock).toLocaleString('pt-BR')}</td><td>{Number(p.stock_quantity)<=Number(p.min_stock)?<span className="company-low-stock"><AlertTriangle size={13}/> Estoque baixo</span>:<span className="company-stock-ok">Normal</span>}</td><td><button className="company-secondary company-small-action" onClick={()=>{setMovementProduct(p);setMovement({type:'in',quantity:'1',unitCost:String(p.cost_price||0),reason:''})}}>Movimentar</button></td></tr>)}
      </tbody></table></div>}
    <div className="company-inventory-history">
      <div className="company-panel-head"><div><b>Histórico de movimentações</b><small>Últimos {movements.length} registros</small></div></div>
      {movements.length===0?<p className="company-empty">Nenhuma movimentação registrada.</p>:<div className="company-table-wrap"><table><thead><tr><th>DATA</th><th>PRODUTO</th><th>OPERAÇÃO</th><th>QUANTIDADE</th><th>CUSTO UNITÁRIO</th><th>MOTIVO</th></tr></thead><tbody>
        {movements.map(m=><tr key={m.id}><td>{new Date(m.created_at).toLocaleString('pt-BR')}</td><td>{products.find(p=>p.id===m.product_id)?.name||'Produto'}</td><td>{m.movement_type==='in'?'Entrada':m.movement_type==='out'?'Saída':'Ajuste'}</td><td>{Number(m.quantity).toLocaleString('pt-BR')}</td><td>{money(m.unit_cost||0)}</td><td>{m.reason||'—'}</td></tr>)}
      </tbody></table></div>}
    </div>
    <p className="company-inventory-note">Entradas, saídas e ajustes de saldo são registrados de forma transacional e ficam no histórico do banco. O saldo mostrado é consolidado por empresa; a filial informada no histórico ainda não mantém saldo separado por filial.</p>
  </section>
}
