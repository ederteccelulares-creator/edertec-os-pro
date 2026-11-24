import {useCallback,useEffect,useState,type FormEvent} from 'react'
import {Plus,ToggleLeft,ToggleRight,CreditCard} from 'lucide-react'
import {supabase} from '../lib/supabase'
import {listCompanyBranches,type Company,type CompanyBranch} from '../lib/company-data'

type Card={id:string;company_id:string;branch_id:string|null;card_name:string;issuer:string;brand:'visa'|'mastercard'|'elo'|'amex'|'hipercard'|'other';card_last4:string|null;credit_limit:number;billing_day:number;due_day:number;is_active:boolean;notes:string|null;created_at:string}
const money=(n:number)=>Number(n||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})
const brands:[Card['brand'],string][]=[['visa','Visa'],['mastercard','Mastercard'],['elo','Elo'],['amex','American Express'],['hipercard','Hipercard'],['other','Outra']]
export default function CompanyCreditCardsPanel({company}:{company:Company}){
 const [rows,setRows]=useState<Card[]>([]),[branches,setBranches]=useState<CompanyBranch[]>([])
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[show,setShow]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('')
 const [form,setForm]=useState({card_name:'',issuer:'',brand:'visa' as Card['brand'],card_last4:'',credit_limit:'0',billing_day:'10',due_day:'20',branch_id:'',notes:''})
 const load=useCallback(async()=>{if(!supabase)return;setLoading(true);setError('');try{const [c,b]=await Promise.all([supabase.from('company_credit_cards').select('*').eq('company_id',company.id).order('created_at',{ascending:false}),listCompanyBranches(company.id)]);if(c.error)throw c.error;setRows((c.data||[]) as Card[]);setBranches(b)}catch(e){setError(e instanceof Error?e.message:'Não foi possível carregar os cartões.')}finally{setLoading(false)}},[company.id])
 useEffect(()=>{void load()},[load])
 async function submit(e:FormEvent){e.preventDefault();if(!supabase)return;setBusy(true);setError('');setNotice('');try{const {error}=await supabase.from('company_credit_cards').insert({company_id:company.id,branch_id:form.branch_id||null,card_name:form.card_name.trim(),issuer:form.issuer.trim(),brand:form.brand,card_last4:form.card_last4.trim()||null,credit_limit:Number(form.credit_limit),billing_day:Number(form.billing_day),due_day:Number(form.due_day),notes:form.notes.trim()||null});if(error)throw error;setForm({card_name:'',issuer:'',brand:'visa',card_last4:'',credit_limit:'0',billing_day:'10',due_day:'20',branch_id:'',notes:''});setShow(false);setNotice('Cartão cadastrado com sucesso.');await load()}catch(e){setError(e instanceof Error?e.message:'Falha ao cadastrar cartão.')}finally{setBusy(false)}}
 async function toggle(row:Card){if(!supabase)return;setBusy(true);setError('');try{const {error}=await supabase.from('company_credit_cards').update({is_active:!row.is_active}).eq('id',row.id).eq('company_id',company.id);if(error)throw error;await load()}catch(e){setError(e instanceof Error?e.message:'Não foi possível atualizar o cartão.')}finally{setBusy(false)}}
 const branchName=(id:string|null)=>id?branches.find(b=>b.id===id)?.name||'Filial':'Matriz / todas'
 return <section className="company-panel">
  <div className="company-panel-head"><div><b>Cartões de crédito</b><small>Cadastre os cartões usados pela empresa e identifique a filial responsável</small></div><button className="company-primary" onClick={()=>setShow(v=>!v)}><Plus size={16}/> Novo cartão</button></div>
  {error&&<div className="company-error-banner">{error}</div>}{notice&&<div className="company-notice-banner">{notice}</div>}
  <div className="company-backup-content"><p>Por segurança, informe somente os últimos quatro dígitos. Nunca cadastre número completo, senha ou CVV.</p></div>
  {show&&<form className="company-form" onSubmit={submit}><h3>Novo cartão</h3><div className="company-form-grid">
   <label>Nome de identificação<input required maxLength={80} value={form.card_name} onChange={e=>setForm({...form,card_name:e.target.value})} placeholder="Ex.: Cartão compras matriz"/></label>
   <label>Banco / emissor<input required maxLength={80} value={form.issuer} onChange={e=>setForm({...form,issuer:e.target.value})} placeholder="Ex.: Nubank"/></label>
   <label>Bandeira<select value={form.brand} onChange={e=>setForm({...form,brand:e.target.value as Card['brand']})}>{brands.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
   <label>Filial<select value={form.branch_id} onChange={e=>setForm({...form,branch_id:e.target.value})}><option value="">Matriz / todas</option>{branches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
   <label>Últimos 4 dígitos<input inputMode="numeric" maxLength={4} pattern="[0-9]{4}" value={form.card_last4} onChange={e=>setForm({...form,card_last4:e.target.value.replace(/\D/g,'').slice(0,4)})} placeholder="0000"/></label>
   <label>Limite (R$)<input required type="number" min="0" step="0.01" value={form.credit_limit} onChange={e=>setForm({...form,credit_limit:e.target.value})}/></label>
   <label>Dia de fechamento<input required type="number" min="1" max="31" value={form.billing_day} onChange={e=>setForm({...form,billing_day:e.target.value})}/></label>
   <label>Dia de vencimento<input required type="number" min="1" max="31" value={form.due_day} onChange={e=>setForm({...form,due_day:e.target.value})}/></label>
  </div><label>Observações<input value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})}/></label><div className="company-form-actions"><button type="button" className="company-secondary" onClick={()=>setShow(false)}>Cancelar</button><button className="company-primary" disabled={busy}>{busy?'Salvando...':'Cadastrar cartão'}</button></div></form>}
  {loading?<p className="company-empty">Carregando cartões...</p>:rows.length===0?<p className="company-empty">Nenhum cartão cadastrado. Use “Novo cartão” para começar.</p>:<div className="company-table-wrap"><table><thead><tr><th>CARTÃO</th><th>EMISSOR</th><th>FILIAL</th><th>LIMITE</th><th>FECHAMENTO</th><th>VENCIMENTO</th><th>STATUS</th><th></th></tr></thead><tbody>{rows.map(row=><tr key={row.id}><td><b>{row.card_name}</b><small>{brands.find(([v])=>v===row.brand)?.[1]||'Outra'}{row.card_last4?' · final '+row.card_last4:''}</small></td><td>{row.issuer}</td><td>{branchName(row.branch_id)}</td><td>{money(Number(row.credit_limit))}</td><td>Dia {row.billing_day}</td><td>Dia {row.due_day}</td><td>{row.is_active?'Ativo':'Inativo'}</td><td><button className="company-secondary company-small-action" disabled={busy} onClick={()=>void toggle(row)}>{row.is_active?<ToggleRight size={15}/>:<ToggleLeft size={15}/>} {row.is_active?'Desativar':'Ativar'}</button></td></tr>)}</tbody></table></div>}
  <p className="company-inventory-note">Este primeiro passo registra cartões e regras de fechamento. Faturas, lançamentos e parcelas serão conectados na etapa seguinte, evitando duplicar despesas no fluxo de caixa.</p>
 </section>
}
