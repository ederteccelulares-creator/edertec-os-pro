import {useEffect,useState,type FormEvent} from 'react'
import {LifeBuoy,Plus,RefreshCw,Send,Volume2,VolumeX} from 'lucide-react'
import {supabase} from '../lib/supabase'
import {playSupportNotification} from '../lib/support-notifications'
import {createCompanySupportTicket,listCompanySupportTickets,listSupportMessages,sendSupportMessage,type SupportTicket,type SupportMessage} from '../lib/company-support'
const labels:Record<string,string>={open:'Aberto',in_progress:'Em atendimento',waiting_company:'Aguardando sua resposta',resolved:'Resolvido',closed:'Fechado'}
export default function CompanySupportPanel({companyId,companyName}:{companyId:string;companyName:string}){
 const [tickets,setTickets]=useState<SupportTicket[]>([]),[active,setActive]=useState<SupportTicket|null>(null),[messages,setMessages]=useState<SupportMessage[]>([])
 const [form,setForm]=useState(false),[subject,setSubject]=useState(''),[description,setDescription]=useState(''),[category,setCategory]=useState('technical'),[priority,setPriority]=useState('normal'),[reply,setReply]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[soundOn,setSoundOn]=useState(false)
 async function load(){try{setTickets(await listCompanySupportTickets(companyId))}catch(e){setError(e instanceof Error?e.message:'Erro ao carregar chamados.')}}
 useEffect(()=>{void load()},[companyId])
 useEffect(()=>{
  if(!supabase)return
  const channel=supabase.channel('company-support-alerts-'+companyId)
   .on('postgres_changes',{event:'UPDATE',schema:'public',table:'support_tickets',filter:'company_id=eq.'+companyId},payload=>{
    if(soundOn)playSupportNotification()
    void load()
    if(active?.id===(payload.new as SupportTicket).id)void open(payload.new as SupportTicket)
   })
   .on('postgres_changes',{event:'INSERT',schema:'public',table:'support_ticket_messages',filter:'company_id=eq.'+companyId},payload=>{
    const row=payload.new as SupportMessage
    if(soundOn){void supabase.auth.getUser().then(({data})=>{if(row.author_id!==data.user?.id)playSupportNotification()})}
    if(active?.id===row.ticket_id)void listSupportMessages(row.ticket_id).then(setMessages).catch(()=>{})
    void load()
   })
   .subscribe()
  return()=>{void supabase.removeChannel(channel)}
 },[companyId,soundOn,active?.id])
 async function open(t:SupportTicket){setActive(t);try{setMessages(await listSupportMessages(t.id))}catch(e){setError(e instanceof Error?e.message:'Erro ao abrir conversa.')}}
 async function create(e:FormEvent){e.preventDefault();setBusy(true);setError('');try{const t=await createCompanySupportTicket({companyId,subject,description,category,priority});setForm(false);setSubject('');setDescription('');await load();await open(t)}catch(e){setError(e instanceof Error?e.message:'Erro ao abrir chamado.')}finally{setBusy(false)}}
 async function send(e:FormEvent){e.preventDefault();if(!active||!reply.trim())return;setBusy(true);setError('');try{await sendSupportMessage({ticketId:active.id,companyId,body:reply});setReply('');setMessages(await listSupportMessages(active.id));await load()}catch(e){setError(e instanceof Error?e.message:'Erro ao responder.')}finally{setBusy(false)}}
 return <section className="company-panel"><div className="company-panel-head"><div><b><LifeBuoy size={17}/> Suporte</b><small>{companyName} · ID da empresa: {companyId}</small></div><div className="support-alert-actions"><button className="company-secondary" onClick={()=>setSoundOn(v=>!v)}>{soundOn?<Volume2 size={15}/>:<VolumeX size={15}/>} {soundOn?"Som ativado":"Ativar som"}</button><button className="company-secondary" onClick={()=>void load()}><RefreshCw size={15}/> Atualizar</button></div></div>{error&&<p className="company-error">{error}</p>}<button className="company-primary" onClick={()=>setForm(v=>!v)}><Plus size={15}/> Abrir chamado</button>
 {form&&<form className="company-form" onSubmit={create}><label>Assunto<input required minLength={4} maxLength={160} value={subject} onChange={e=>setSubject(e.target.value)}/></label><label>Categoria<select value={category} onChange={e=>setCategory(e.target.value)}><option value="technical">Problema técnico</option><option value="general">Dúvida geral</option><option value="billing">Financeiro / assinatura</option><option value="suggestion">Sugestão</option></select></label><label>Prioridade<select value={priority} onChange={e=>setPriority(e.target.value)}><option value="low">Baixa</option><option value="normal">Normal</option><option value="high">Alta</option><option value="urgent">Urgente</option></select></label><label>Descrição<textarea required minLength={10} maxLength={10000} rows={4} value={description} onChange={e=>setDescription(e.target.value)}/></label><button className="company-primary" disabled={busy}>Enviar chamado</button></form>}
 <div className="company-support-layout"><div className="company-support-list">{tickets.map(t=><button key={t.id} className="company-support-item" onClick={()=>void open(t)}><b>#{t.ticket_number} · {t.subject}</b><small>{labels[t.status]||t.status} · {new Date(t.updated_at).toLocaleString('pt-BR')}</small></button>)}{!tickets.length&&<p>Nenhum chamado registrado.</p>}</div>{active&&<div className="company-support-thread"><h3>#{active.ticket_number} · {active.subject}</h3><p>{active.description}</p><b>{labels[active.status]||active.status}</b><div className="company-support-messages">{messages.filter(m=>!m.is_internal).map(m=><article key={m.id}><small>{m.author_id===active.created_by?'Sua empresa':'Suporte Edertec'} · {new Date(m.created_at).toLocaleString('pt-BR')}</small><p>{m.body}</p></article>)}</div>{!['resolved','closed'].includes(active.status)&&<form onSubmit={send}><textarea required rows={2} value={reply} onChange={e=>setReply(e.target.value)} placeholder="Responder ao suporte..."/><button className="company-primary" disabled={busy}><Send size={14}/> Enviar</button></form>}</div>}</div></section>
}
