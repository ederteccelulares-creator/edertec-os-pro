import { useEffect, useState, type FormEvent } from 'react'
import { BadgePlus, Users, Truck, Tags, FolderOpen, RefreshCw } from 'lucide-react'
import { supabase } from '../lib/supabase'

type Tab = 'customers'|'suppliers'|'brands'|'categories'
type Props = { companyId:string; initialTab:Tab; initialCreate?:boolean }
type Row = Record<string, any>
const empty = {name:'',phone:'',email:'',document:'',contact_name:'',street:'',number:'',complement:'',neighborhood:'',city:'',state:'',zip:'',notes:'',description:''}

export default function EpartsRegistrations({companyId,initialTab,initialCreate=false}:Props) {
  const [tab,setTab]=useState<Tab>(initialTab)
  const [rows,setRows]=useState<Row[]>([])
  const [form,setForm]=useState(empty)
  const [showForm,setShowForm]=useState(initialCreate)
  const [busy,setBusy]=useState(false)
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState('')
  const [notice,setNotice]=useState('')
  const [search,setSearch]=useState('')
  const [accessSupplier,setAccessSupplier]=useState<Row|null>(null)
  const [accessUsername,setAccessUsername]=useState('')
  const [accessPassword,setAccessPassword]=useState('')
  const table=tab==='customers'?'eparts_customers':tab==='suppliers'?'eparts_suppliers':tab==='brands'?'eparts_brands':'eparts_categories'
  const label=tab==='customers'?'cliente':tab==='suppliers'?'fornecedor':tab==='brands'?'marca':'categoria'
  const load=async()=>{
    if(!supabase)return
    setLoading(true);setError('')
    try {
      const columns=tab==='customers'?'id,name,phone,email,document,address':tab==='suppliers'?'id,name,contact_name,phone,email,document,notes,is_active,username':tab==='brands'?'id,name':'id,name,description,is_active'
      const {data,error}=await supabase.from(table).select(columns).eq('company_id',companyId).order('name')
      if(error)throw error
      setRows(data||[])
    } catch(e) {setError(e instanceof Error?e.message:'Não foi possível carregar os cadastros.')}
    finally {setLoading(false)}
  }
  useEffect(()=>{void load()},[companyId,tab])
  useEffect(()=>{setTab(initialTab);setShowForm(initialCreate)},[initialTab,initialCreate])
  const startNew=()=>{setForm(empty);setError('');setNotice('');setShowForm(true)}
  async function save(e:FormEvent){
    e.preventDefault();if(!supabase)return
    if(form.name.trim().length<2){setError('Informe um nome com pelo menos 2 caracteres.');return}
    setBusy(true);setError('');setNotice('')
    try {
      let payload:Row={company_id:companyId,name:form.name.trim()}
      if(tab==='customers') payload={...payload,phone:form.phone.trim()||null,email:form.email.trim()||null,document:form.document.trim()||null,address:{street:form.street.trim(),number:form.number.trim(),complement:form.complement.trim(),neighborhood:form.neighborhood.trim(),city:form.city.trim(),state:form.state.trim(),zip:form.zip.trim(),notes:form.notes.trim()}}
      if(tab==='suppliers') payload={...payload,contact_name:form.contact_name.trim()||null,phone:form.phone.trim()||null,email:form.email.trim()||null,document:form.document.trim()||null,notes:form.notes.trim()||null,is_active:true}
      if(tab==='categories') payload={...payload,description:form.description.trim()||null,is_active:true}
      const {error}=await supabase.from(table).insert(payload)
      if(error)throw error
      setForm(empty);setShowForm(false);setNotice(label[0].toUpperCase()+label.slice(1)+' cadastrado(a) com sucesso.');await load()
    } catch(e) {setError(e instanceof Error?e.message:'Não foi possível salvar o cadastro.')}
    finally {setBusy(false)}
  }
  async function saveSupplierAccess(e:FormEvent){
    e.preventDefault();if(!supabase||!accessSupplier)return
    setBusy(true);setError('');setNotice('')
    try{
      const {data,error}=await supabase.functions.invoke('eparts-supplier-access',{body:{supplier_id:accessSupplier.id,username:accessUsername.trim().toLowerCase(),password:accessPassword}})
      if(error)throw error
      if(data?.error)throw new Error(data.error)
      setNotice('Acesso criado/atualizado para '+accessSupplier.name+'. Entregue o usuário e a senha ao fornecedor.')
      setAccessSupplier(null);setAccessUsername('');setAccessPassword('');await load()
    }catch(e){setError(e instanceof Error?e.message:'Não foi possível criar o acesso do fornecedor.')}
    finally{setBusy(false)}
  }
  const filtered=rows.filter(r=>[r.name,r.phone||'',r.email||'',r.document||'',r.contact_name||'',r.description||''].join(' ').toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR')))
  const titles={customers:'Clientes',suppliers:'Fornecedores',brands:'Marcas',categories:'Categorias'}
  const Icon=tab==='customers'?Users:tab==='suppliers'?Truck:tab==='brands'?Tags:FolderOpen
  return <section className="company-panel eparts-registrations">
    <style>{`
      .eparts-registrations .er-tabs{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin:16px 0}
      .eparts-registrations .er-tabs button{min-height:44px;border:1px solid #66502c;border-radius:10px;background:#17130e;color:#ffd0d5;font-weight:650}
      .eparts-registrations .er-tabs button.active{background:linear-gradient(110deg,#604719,#241b0e);border-color:#ed142c;color:#ffb5bd}
      .eparts-registrations .er-form{display:grid;gap:12px;padding:16px;margin:14px 0;border:1px solid #8f1524;border-radius:14px;background:#12110f}
      .eparts-registrations .er-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
      .eparts-registrations label{display:grid;gap:6px;color:#d7c8ab;font-size:12px}
      .eparts-registrations input,.eparts-registrations textarea{width:100%;min-height:43px;box-sizing:border-box;padding:10px;border:1px solid #57472f;border-radius:9px;background:#090909;color:#fff;font-size:16px}
      .eparts-registrations .er-actions{display:flex;gap:9px;justify-content:flex-end;flex-wrap:wrap}
      .eparts-registrations .er-table{width:100%;overflow:auto}
      .eparts-registrations table{width:100%;min-width:520px;border-collapse:collapse}
      .eparts-registrations th,.eparts-registrations td{padding:12px;text-align:left;border-bottom:1px solid #3c3327;color:#e8e0d3;font-size:12px}
      .eparts-registrations th{color:#ed142c;font-size:10px}
      .eparts-registrations .er-message{padding:11px;border-radius:9px;margin:10px 0;background:#292016;color:#ffb5bd}
      @media(max-width:600px){.eparts-registrations .er-grid{grid-template-columns:1fr}.eparts-registrations .er-form{padding:12px}}
    `}</style>
    <div className="company-panel-head"><div><b>Cadastros da EPARTS</b><small>Gerencie clientes, fornecedores, marcas e categorias</small></div><button type="button" className="company-secondary" onClick={()=>void load()} disabled={loading}><RefreshCw size={15}/> Atualizar</button></div>
    <div className="er-tabs">{(Object.keys(titles) as Tab[]).map(k=>{const I=k==='customers'?Users:k==='suppliers'?Truck:k==='brands'?Tags:FolderOpen;return <button type="button" key={k} className={tab===k?'active':''} onClick={()=>{setTab(k);setShowForm(false);setSearch('')}}><I size={15}/> {titles[k]} ({k===tab?rows.length:'•'})</button>})}</div>
    <div className="company-panel-head"><div><b><Icon size={17}/> {titles[tab]} cadastrados</b><small>Cadastro separado por empresa, com acesso protegido</small></div><button type="button" className="company-primary" onClick={startNew}><BadgePlus size={16}/> Cadastrar {label}</button></div>
    {error&&<div className="er-message" role="alert">{error}</div>}{notice&&<div className="er-message" role="status">{notice}</div>}
    {tab==='suppliers'&&accessSupplier&&<form className="er-form" onSubmit={saveSupplierAccess}>
      <div><b>Acesso do fornecedor: {accessSupplier.name}</b><p>Crie um usuário e uma senha com pelo menos 8 caracteres.</p></div>
      <div className="er-grid">
        <label>Usuário<input required minLength={4} maxLength={30} autoCapitalize="none" value={accessUsername} onChange={e=>setAccessUsername(e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g,''))} placeholder="ex.: fornecedor01"/></label>
        <label>Senha provisória<input required minLength={8} maxLength={72} type="password" autoComplete="new-password" value={accessPassword} onChange={e=>setAccessPassword(e.target.value)} placeholder="Mínimo de 8 caracteres"/></label>
      </div>
      <div className="er-actions"><button type="button" className="company-secondary" onClick={()=>setAccessSupplier(null)}>Cancelar</button><button className="company-primary" disabled={busy}>{busy?'Salvando acesso...':'Salvar acesso'}</button></div>
    </form>}
    {showForm&&<form className="er-form" onSubmit={save}>
      <div className="er-grid">
        <label>Nome {tab==='customers'?'completo':tab==='suppliers'?'da empresa / fornecedor':tab==='brands'?'da marca':'da categoria'}<input autoFocus required value={form.name} onChange={e=>setForm(v=>({...v,name:e.target.value}))} placeholder="Digite o nome"/></label>
        {tab==='customers'&&<><label>Telefone / WhatsApp<input value={form.phone} onChange={e=>setForm(v=>({...v,phone:e.target.value}))}/></label><label>E-mail<input type="email" value={form.email} onChange={e=>setForm(v=>({...v,email:e.target.value}))}/></label><label>CPF / CNPJ<input value={form.document} onChange={e=>setForm(v=>({...v,document:e.target.value}))}/></label><label>CEP<input value={form.zip} onChange={e=>setForm(v=>({...v,zip:e.target.value}))}/></label><label>Rua<input value={form.street} onChange={e=>setForm(v=>({...v,street:e.target.value}))}/></label><label>Número<input value={form.number} onChange={e=>setForm(v=>({...v,number:e.target.value}))}/></label><label>Complemento<input value={form.complement} onChange={e=>setForm(v=>({...v,complement:e.target.value}))}/></label><label>Bairro<input value={form.neighborhood} onChange={e=>setForm(v=>({...v,neighborhood:e.target.value}))}/></label><label>Cidade<input value={form.city} onChange={e=>setForm(v=>({...v,city:e.target.value}))}/></label><label>Estado<input maxLength={2} value={form.state} onChange={e=>setForm(v=>({...v,state:e.target.value.toUpperCase()}))}/></label></>}
        {tab==='suppliers'&&<><label>Responsável<input value={form.contact_name} onChange={e=>setForm(v=>({...v,contact_name:e.target.value}))}/></label><label>Telefone / WhatsApp<input value={form.phone} onChange={e=>setForm(v=>({...v,phone:e.target.value}))}/></label><label>E-mail<input type="email" value={form.email} onChange={e=>setForm(v=>({...v,email:e.target.value}))}/></label><label>CPF / CNPJ<input value={form.document} onChange={e=>setForm(v=>({...v,document:e.target.value}))}/></label></>}
        {(tab==='categories')&&<label>Descrição<input value={form.description} onChange={e=>setForm(v=>({...v,description:e.target.value}))}/></label>}
      </div>
      {tab==='customers'&&<label>Observações<textarea rows={2} value={form.notes} onChange={e=>setForm(v=>({...v,notes:e.target.value}))}/></label>}
      {tab==='suppliers'&&<label>Observações<textarea rows={2} value={form.notes} onChange={e=>setForm(v=>({...v,notes:e.target.value}))}/></label>}
      <div className="er-actions"><button type="button" className="company-secondary" onClick={()=>setShowForm(false)}>Cancelar</button><button className="company-primary" disabled={busy}>{busy?'Salvando...':'Salvar '+label}</button></div>
    </form>}
    <label style={{display:'block',margin:'14px 0'}}>Buscar {label}<input value={search} onChange={e=>setSearch(e.target.value)} placeholder={'Digite o nome do '+label}/></label>
    {loading?<p className="company-empty">Carregando cadastros...</p>:filtered.length===0?<p className="company-empty">Nenhum(a) {label} encontrado(a). Clique em “Cadastrar {label}” para adicionar.</p>:<div className="er-table"><table><thead><tr><th>NOME</th>{tab==='customers'&&<><th>TELEFONE</th><th>E-MAIL</th><th>DOCUMENTO</th></>}{tab==='suppliers'&&<><th>RESPONSÁVEL</th><th>TELEFONE</th><th>E-MAIL</th><th>USUÁRIO</th><th>ACESSO</th></>}{tab==='categories'&&<th>DESCRIÇÃO</th>}{tab==='brands'&&<th>CADASTRO</th>}</tr></thead><tbody>{filtered.map(r=><tr key={r.id}><td><b>{r.name}</b></td>{tab==='customers'&&<><td>{r.phone||'—'}</td><td>{r.email||'—'}</td><td>{r.document||'—'}</td></>}{tab==='suppliers'&&<><td>{r.contact_name||'—'}</td><td>{r.phone||'—'}</td><td>{r.email||'—'}</td><td>{r.username||'Não criado'}</td><td><button type="button" className="company-secondary" onClick={()=>{setAccessSupplier(r);setAccessUsername(r.username||'');setAccessPassword('')}}>{r.username?'Alterar acesso':'Criar acesso'}</button></td></>}{tab==='categories'&&<td>{r.description||'—'}</td>}{tab==='brands'&&<td>Ativa</td>}</tr>)}</tbody></table></div>}
  </section>
}
