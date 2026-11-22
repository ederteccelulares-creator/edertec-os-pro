import {useEffect,useState} from 'react'
import {LifeBuoy,RefreshCw,Send,Building2,Volume2,VolumeX} from 'lucide-react'
import {supabase} from '../lib/supabase'
import {playSupportNotification} from '../lib/support-notifications'
import {listPlatformSupportTickets,listSupportMessages,sendSupportMessage,updatePlatformSupportTicket,type SupportTicket,type SupportMessage} from '../lib/company-support'
const statusLabels:Record<string,string>={open:'Aberto',in_progress:'Em atendimento',waiting_company:'Aguardando empresa',resolved:'Resolvido',closed:'Fechado'}
export default function PlatformSupportPanel(){
 const [tickets,setTickets]=useState<SupportTicket[]>([]),[active,setActive]=useState<SupportTicket|null>(null),[messages,setMessages]=useState<SupportMessage[]>([]),[reply,setReply]=useState(''),[status,setStatus]=useState('open'),[priority,setPriority]=useState('normal'),[internal,setInternal]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[soundOn,setSoundOn]=useState(false)
 async function load(){setBusy(true);setError('');try{const rows=await listPlatformSupportTickets();setTickets(rows);if(active){const t=rows.find(x=>x.id===active.id);if(t)setActive(t)}}catch(e){setError(e instanceof Error?e.message:'Falha ao carregar chamados.')}finally{setBusy(false)}}
 useEffect(()=>{void load()},[])
 useEffect(()=>{
  if(!supabase)return
  const channel=supabase.channel('platform-support-alerts')
   .on('postgres_changes',{event:'INSERT',schema:'public',table:'support_tickets'},()=>{if(soundOn)playSupportNotification();void load()})
   .on('postgres_changes',{event:'INSERT',schema:'public',table:'support_ticket_messages'},payload=>{
    const row=payload.new as SupportMessage
    if(!row.is_internal&&soundOn)playSupportNotification()
    void load()
    if(active?.id===row.ticket_id)void listSupportMessages(row.ticket_id).then(setMessages).catch(()=>{})
   })
   .subscribe()
  return()=>{void supabase.removeChannel(channel)}
 },[soundOn,active?.id])
 async function open(t:SupportTicket){setActive(t);setStatus(t.status);setPriority(t.priority);try{setMessages(await listSupportMessages(t.id))}catch(e){setError(e instanceof Error?e.message:'Falha ao carregar conversa.')}}
 async function save(){if(!active)return;setBusy(true);setError('');try{await updatePlatformSupportTicket({ticketId:active.id,status,priority});await load()}catch(e){setError(e instanceof Error?e.message:'Falha ao atualizar chamado.')}finally{setBusy(false)}}
 async function send(){if(!active||!reply.trim())return;setBusy(true);setError('');try{await sendSupportMessage({ticketId:active.id,companyId:active.company_id,body:reply,internal});setReply('');setMessages(await listSupportMessages(active.id));await load()}catch(e){setError(e instanceof Error?e.message:'Falha ao responder.')}finally{setBusy(false)}}
 return <section className="tenant-panel"><div className="tenant-panel-head"><div><b><LifeBuoy size={17}/> Central de suporte</b><small>Chamados separados por empresa e identificados pelo ID da empresa</small></div><div className="support-alert-actions"><button className="tenant-history-button" onClick={()=>setSoundOn(v=>!v)}>{soundOn?<Volume2 size={15}/>:<VolumeX size={15}/>} {soundOn?"Som ativado":"Ativar som"}</button><button className="tenant-history-button" disabled={busy} onClick={()=>void load()}><RefreshCw size={15}/> Atualizar</button></div></div>{error&&<p className="tenant-error">{error}</p>}<div className="company-support-layout"><div className="company-support-list">{tickets.map(t=><button key={t.id} className="company-support-item" onClick={()=>void open(t)}><b>#{t.ticket_number} · {t.subject}</b><small><Building2 size={12}/> {Array.isArray(t.companies)?t.companies[0]?.name:t.companies?.name||'Empresa'} · {t.company_id.slice(0,8)}…</small><small>{statusLabels[t.status]||t.status} · {t.priority}</small></button>)}{!tickets.length&&<p>Nenhum chamado recebido.</p>}</div>{active&&<div className="company-support-thread"><h3>Chamado #{active.ticket_number}</h3><p><b>{active.subject}</b></p><p>{active.description}</p><small>Empresa: {Array.isArray(active.companies)?active.companies[0]?.name:active.companies?.name} · ID completo: {active.company_id}</small><div className="tenant-form"><label>Status<select value={status} onChange={e=>setStatus(e.target.value)}>{Object.entries(statusLabels).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label><label>Prioridade<select value={priority} onChange={e=>setPriority(e.target.value)}><option value="low">Baixa</option><option value="normal">Normal</option><option value="high">Alta</option><option value="urgent">Urgente</option></select></label><button className="tenant-primary" disabled={busy} onClick={()=>void save()}>Salvar atendimento</button></div><div className="company-support-messages">{messages.map(m=><article key={m.id}><small>{m.is_internal?'Nota interna':m.author_id===active.created_by?'Empresa':'Equipe de suporte'} · {new Date(m.created_at).toLocaleString('pt-BR')}</small><p>{m.body}</p></article>)}</div><textarea rows={3} value={reply} onChange={e=>setReply(e.target.value)} placeholder="Responder à empresa..."/><label><input type="checkbox" checked={internal} onChange={e=>setInternal(e.target.checked)}/> Nota interna (não aparece para a empresa)</label><button className="tenant-primary" disabled={busy||!reply.trim()} onClick={()=>void send()}><Send size={14}/> Enviar resposta</button></div>}</div></section>
}
