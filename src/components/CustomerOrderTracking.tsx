import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { CheckCircle2, Clock3, PackageCheck, Wrench, AlertCircle, Smartphone } from 'lucide-react'

type Tracking = {
  company_name:string; order_number:number; status:string; device_type:string|null;
  device_brand:string|null; device_model:string|null; received_at:string;
  updated_at:string; promised_at:string|null;
}
const labels:Record<string,string>={received:'Recebido',diagnosis:'Em diagnóstico',waiting_approval:'Aguardando aprovação',approved:'Aprovado',in_repair:'Em conserto',waiting_parts:'Aguardando peça',ready:'Pronto para retirada',delivered:'Entregue',cancelled:'Cancelado'}
const steps=['received','diagnosis','waiting_approval','approved','in_repair','ready','delivered']
export default function CustomerOrderTracking({token}:{token:string}){
 const [data,setData]=useState<Tracking|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState('')
 useEffect(()=>{let active=true;(async()=>{try{if(!supabase)throw new Error('Serviço temporariamente indisponível.');const {data,error}=await supabase.rpc('get_company_service_order_tracking',{p_token:token});if(error)throw error;if(!data)throw new Error('Este link é inválido ou expirou. Solicite uma nova via à assistência.');if(active)setData(data as Tracking)}catch(e){if(active)setError(e instanceof Error?e.message:'Não foi possível consultar a ordem.')}finally{if(active)setLoading(false)}})();return()=>{active=false}},[token])
 const current=steps.indexOf(data?.status||'received')
 return <main className="customer-tracking"><div className="tracking-card"><div className="tracking-brand"><span><Smartphone/></span><div><b>{data?.company_name||'Acompanhamento de OS'}</b><small>PORTAL DO CLIENTE</small></div></div>
 {loading?<div className="tracking-state"><Clock3/><h2>Consultando sua ordem...</h2></div>:error?<div className="tracking-state"><AlertCircle/><h2>Não foi possível localizar a OS</h2><p>{error}</p></div>:data&&<><div className="tracking-order"><small>ORDEM DE SERVIÇO</small><h1>#{data.order_number}</h1><span className="tracking-status">{labels[data.status]||data.status}</span></div><div className="tracking-device"><Smartphone/><div><small>APARELHO</small><b>{[data.device_brand,data.device_model].filter(Boolean).join(' ')||data.device_type||'Equipamento'}</b></div></div><h2>Andamento do serviço</h2><div className="tracking-timeline">{steps.filter(s=>s!=='waiting_approval'&&s!=='approved').map((step)=>{const index=steps.indexOf(step),done=current>=index;return <div className={done?'tracking-step done':'tracking-step'} key={step}><span>{done?<CheckCircle2 size={18}/>:<span className="tracking-dot"/>}</span><b>{labels[step]}</b></div>})}</div><div className="tracking-dates"><p><span>Recebido em</span><b>{new Date(data.received_at).toLocaleString('pt-BR')}</b></p>{data.promised_at&&<p><span>Previsão informada</span><b>{new Date(data.promised_at).toLocaleString('pt-BR')}</b></p>}<p><span>Última atualização</span><b>{new Date(data.updated_at).toLocaleString('pt-BR')}</b></p></div><p className="tracking-note"><PackageCheck size={17}/> Esta página mostra o status atual informado pela assistência. Para dúvidas, entre em contato diretamente com a loja.</p></>}
 </div><footer>EDERTEC OS PRO · Acompanhamento seguro de ordem de serviço</footer></main>
}
