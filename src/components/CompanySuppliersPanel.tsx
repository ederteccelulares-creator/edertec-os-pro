import { useCallback,useEffect,useState,type FormEvent } from 'react'
import { Plus,RefreshCw,Search,Truck } from 'lucide-react'
import { createCompanySupplier,listCompanySuppliers,type CompanySupplier } from '../lib/company-suppliers'
import type { Company } from '../lib/company-data'

export default function CompanySuppliersPanel({company}:{company:Company}) {
  const [items,setItems]=useState<CompanySupplier[]>([])
  const [search,setSearch]=useState('')
  const [loading,setLoading]=useState(true)
  const [busy,setBusy]=useState(false)
  const [show,setShow]=useState(false)
  const [error,setError]=useState('')
  const [notice,setNotice]=useState('')
  const [form,setForm]=useState({name:'',taxId:'',contactName:'',phone:'',email:'',notes:''})
  const load=useCallback(async()=>{
    setLoading(true);setError('')
    try{setItems(await listCompanySuppliers(company.id,search))}
    catch(e){setError(e instanceof Error?e.message:'Erro ao carregar fornecedores.')}
    finally{setLoading(false)}
  },[company.id,search])
  useEffect(()=>{void load()},[load])
  async function submit(e:FormEvent){
    e.preventDefault();setBusy(true);setError('');setNotice('')
    try{
      await createCompanySupplier({companyId:company.id,...form})
      setForm({name:'',taxId:'',contactName:'',phone:'',email:'',notes:''})
      setShow(false);setNotice('Fornecedor cadastrado.');await load()
    }catch(e){setError(e instanceof Error?e.message:'Falha ao cadastrar fornecedor.')}
    finally{setBusy(false)}
  }
  return <section className="company-panel">
    <div className="company-panel-head"><div><b>Fornecedores</b><small>{items.length} fornecedores ativos</small></div><button className="company-primary" onClick={()=>setShow(v=>!v)}><Plus size={16}/> Novo fornecedor</button></div>
    {error&&<div className="company-error-banner">{error}</div>}{notice&&<div className="company-notice-banner">{notice}</div>}
    <div className="company-inventory-tools"><label><Search size={16}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar nome, CNPJ ou telefone"/></label><button className="company-icon-button" onClick={()=>void load()} title="Atualizar"><RefreshCw size={16}/></button></div>
    {show&&<form className="company-form" onSubmit={submit}><h3>Novo fornecedor</h3>
      <div className="company-form-grid">
        <label>Nome / Razão social<input required value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></label>
        <label>CNPJ / CPF<input value={form.taxId} onChange={e=>setForm({...form,taxId:e.target.value})}/></label>
        <label>Contato<input value={form.contactName} onChange={e=>setForm({...form,contactName:e.target.value})}/></label>
        <label>Telefone / WhatsApp<input value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})}/></label>
        <label>E-mail<input type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})}/></label>
      </div>
      <label>Observações<input value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})}/></label>
      <div className="company-form-actions"><button type="button" className="company-secondary" onClick={()=>setShow(false)}>Cancelar</button><button className="company-primary" disabled={busy}>{busy?'Salvando...':'Salvar fornecedor'}</button></div>
    </form>}
    {loading?<p className="company-empty">Carregando fornecedores...</p>:items.length===0?<p className="company-empty"><Truck size={22}/><br/>Nenhum fornecedor cadastrado.</p>:
      <div className="company-table-wrap"><table><thead><tr><th>FORNECEDOR</th><th>DOCUMENTO</th><th>CONTATO</th><th>TELEFONE</th><th>E-MAIL</th></tr></thead><tbody>
        {items.map(s=><tr key={s.id}><td><b>{s.name}</b><small>{s.contact_name||'—'}</small></td><td>{s.tax_id||'—'}</td><td>{s.contact_name||'—'}</td><td>{s.phone||'—'}</td><td>{s.email||'—'}</td></tr>)}
      </tbody></table></div>}
  </section>
}
