import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { CheckCircle2, Clock3, PackageCheck, AlertCircle, Smartphone, ThumbsUp, ThumbsDown } from 'lucide-react'

type Tracking = {
  company_name:string; order_number:number; status:string; device_type:string|null;
  device_brand:string|null; device_model:string|null; received_at:string;
  updated_at:string; promised_at:string|null; reported_issue:string; diagnosis:string|null; estimated_price:number; final_price:number; customer_approval_decision?:string|null;
  customer_approval_at?:string|null; customer_approval_note?:string|null;
}
const labels:Record<string,string>={received:'Recebido',diagnosis:'Em diagnóstico',waiting_approval:'Aguardando sua aprovação',approved:'Serviço aprovado',in_repair:'Em conserto',waiting_parts:'Aguardando peça',ready:'Pronto para retirada',delivered:'Entregue',cancelled:'Cancelado',rejected:'Serviço recusado'}
const steps=['received','diagnosis','waiting_approval','approved','in_repair','ready','delivered']
export default function CustomerOrderTracking({token}:{token:string}){
 const [data,setData]=useState<Tracking|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[submitting,setSubmitting]=useState(false),[feedback,setFeedback]=useState('')
 async function loadTracking(){
  if(!supabase)throw new Error('Serviço temporariamente indisponível.')
  const {data,error}=await supabase.rpc('get_company_service_order_tracking',{p_token:token})
  if(error)throw error
  if(!data)throw new Error('Este link é inválido ou expirou. Solicite uma nova via à assistência.')
  setData(data as Tracking)
 }
 useEffect(()=>{let active=true;(async()=>{try{if(!supabase)throw new Error('Serviço temporariamente indisponível.');const {data,error}=await supabase.rpc('get_company_service_order_tracking',{p_token:token});if(error)throw error;if(!data)throw new Error('Este link é inválido ou expirou. Solicite uma nova via à assistência.');if(active)setData(data as Tracking)}catch(e){if(active)setError(e instanceof Error?e.message:'Não foi possível consultar a ordem.')}finally{if(active)setLoading(false)}})();return()=>{active=false}},[token])
 async function respond(decision:'approved'|'rejected'){
  if(!supabase||submitting)return
  if(decision==='rejected'&&!window.confirm('Confirma que deseja recusar este orçamento?'))return
  setSubmitting(true);setFeedback('');setError('')
  try{
   const {error}=await supabase.rpc('respond_company_service_order_approval',{p_token:token,p_decision:decision,p_note:null})
   if(error)throw error
   await loadTracking()
   setFeedback(decision==='approved'?'Aprovação registrada. A assistência já pode dar continuidade ao serviço.':'Recusa registrada. A assistência foi informada da sua decisão.')
  }catch(e){setError(e instanceof Error?e.message:'Não foi possível registrar sua resposta. Atualize a página e tente novamente.')}
  finally{setSubmitting(false)}
 }
 const current=steps.indexOf(data?.status||'received')
 const canRespond=data?.status==='waiting_approval'&&!data.customer_approval_decision
 return <main className="customer-tracking"><div className="tracking-card"><div className="tracking-brand"><span><Smartphone/></span><div><b>{data?.company_name||'Acompanhamento de OS'}</b><small>PORTAL DO CLIENTE</small></div></div>
 {loading?<div className="tracking-state"><Clock3/><h2>Consultando sua ordem...</h2></div>:error&&!data?<div className="tracking-state"><AlertCircle/><h2>Não foi possível localizar a OS</h2><p>{error}</p></div>:data&&<><div className="tracking-order"><small>ORDEM DE SERVIÇO</small><h1>#{data.order_number}</h1><span className="tracking-status">{labels[data.status]||data.status}</span></div><div className="tracking-device"><Smartphone/><div><small>APARELHO</small><b>{[data.device_brand,data.device_model].filter(Boolean).join(' ')||data.device_type||'Equipamento'}</b></div></div>
 {canRespond&&<section className="tracking-approval"><div><h2>Orçamento aguardando sua resposta</h2><p>Confira os detalhes e o valor antes de autorizar o conserto.</p></div><div className="tracking-approval-details"><div><small>DEFEITO / SERVIÇO A REALIZAR</small><b>{data.diagnosis?.trim()||data.reported_issue||'Não informado pela assistência'}</b></div><div className="tracking-approval-price"><small>VALOR DO ORÇAMENTO</small><strong>{(Number(data.final_price)>0?Number(data.final_price):Number(data.estimated_price)).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</strong></div></div><div className="tracking-approval-actions"><button className="tracking-approve" disabled={submitting} onClick={()=>void respond('approved')}><ThumbsUp size={18}/>{submitting?'Registrando...':'Aprovar serviço'}</button><button className="tracking-reject" disabled={submitting} onClick={()=>void respond('rejected')}><ThumbsDown size={18}/>Recusar serviço</button></div></section>}
 {feedback&&<p className="tracking-feedback"><CheckCircle2 size={17}/>{feedback}</p>}
 {error&&data&&<p className="tracking-error"><AlertCircle size={17}/>{error}</p>}
 {data.customer_approval_decision&&<div className="tracking-decision"><b>{data.customer_approval_decision==='approved'?'Você aprovou este serviço':'Você recusou este serviço'}</b>{data.customer_approval_at&&<small>Resposta registrada em {new Date(data.customer_approval_at).toLocaleString('pt-BR')}</small>}</div>}
 <h2>Andamento do serviço</h2><div className="tracking-timeline">{steps.filter(s=>s!=='waiting_approval'&&s!=='approved').map((step)=>{const index=steps.indexOf(step),done=current>=index&&data.status!=='rejected';return <div className={done?'tracking-step done':'tracking-step'} key={step}><span>{done?<CheckCircle2 size={18}/>:<span className="tracking-dot"/>}</span><b>{labels[step]}</b></div>})}</div><div className="tracking-dates"><p><span>Recebido em</span><b>{new Date(data.received_at).toLocaleString('pt-BR')}</b></p>{data.promised_at&&<p><span>Previsão informada</span><b>{new Date(data.promised_at).toLocaleString('pt-BR')}</b></p>}<p><span>Última atualização</span><b>{new Date(data.updated_at).toLocaleString('pt-BR')}</b></p></div><p className="tracking-note"><PackageCheck size={17}/> Esta página mostra o status atual informado pela assistência. Para dúvidas, entre em contato diretamente com a loja.</p></>}
 </div><footer>EDERTEC OS PRO · Acompanhamento seguro de ordem de serviço</footer></main>
}
