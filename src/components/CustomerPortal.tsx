import { useEffect,useState } from 'react'
import { supabase } from '../lib/supabase'
import { Smartphone,Clock3,CheckCircle2,AlertCircle,ThumbsUp,ThumbsDown,ShieldCheck,RefreshCw,PackageCheck } from 'lucide-react'
type PortalOrder={id:string;order_number:number;status:string;device_type:string|null;device_brand:string|null;device_model:string|null;reported_issue:string;diagnosis:string|null;estimated_price:number;final_price:number;received_at:string;updated_at:string;promised_at:string|null;delivered_at:string|null;warranty_started_at:string|null;warranty_expires_at:string|null;warranty_days:number|null;customer_approval_decision:string|null;customer_approval_at:string|null}
type PortalData={company_name:string;customer_name:string;customer_phone:string|null;orders:PortalOrder[]}
const labels:Record<string,string>={received:'Recebido',diagnosis:'Em diagnóstico',waiting_approval:'Aguardando aprovação',approved:'Aprovado',in_repair:'Em conserto',waiting_parts:'Aguardando peça',ready:'Pronto para retirada',delivered:'Entregue',cancelled:'Cancelado',rejected:'Serviço recusado'}
const money=(n:number)=>Number(n||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})
export default function CustomerPortal({token}:{token:string}){
 const [data,setData]=useState<PortalData|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[busy,setBusy]=useState<string|null>(null),[notice,setNotice]=useState('')
 async function load(){if(!supabase)throw new Error('Serviço temporariamente indisponível.');const {data,error}=await supabase.rpc('get_company_customer_portal',{p_token:token});if(error)throw error;if(!data)throw new Error('Link inválido ou revogado. Solicite um novo acesso à assistência.');setData(data as PortalData)}
 useEffect(()=>{let active=true;(async()=>{try{if(!supabase)throw new Error('Serviço temporariamente indisponível.');const {data,error}=await supabase.rpc('get_company_customer_portal',{p_token:token});if(error)throw error;if(!data)throw new Error('Link inválido ou revogado. Solicite um novo acesso à assistência.');if(active)setData(data as PortalData)}catch(e){if(active)setError(e instanceof Error?e.message:'Não foi possível abrir a área do cliente.')}finally{if(active)setLoading(false)}})();return()=>{active=false}},[token])
 async function respond(order:PortalOrder,decision:'approved'|'rejected'){
  if(!supabase||busy)return
  if(decision==='rejected'&&!window.confirm('Confirma que deseja recusar este orçamento?'))return
  setBusy(order.id);setNotice('');setError('')
  try{const {error}=await supabase.rpc('respond_company_customer_portal_approval',{p_token:token,p_order_id:order.id,p_decision:decision});if(error)throw error;await load();setNotice(decision==='approved'?'Orçamento aprovado com sucesso.':'Recusa registrada com sucesso.')}
  catch(e){setError(e instanceof Error?e.message:'Não foi possível registrar sua resposta.')}
  finally{setBusy(null)}
 }
 return <main className="customer-tracking customer-portal"><div className="tracking-card"><div className="tracking-brand"><span><Smartphone/></span><div><b>{data?.company_name||'Área do Cliente'}</b><small>ÁREA DO CLIENTE</small></div><button className="customer-portal-refresh" onClick={()=>{setLoading(true);void load().catch(e=>setError(e instanceof Error?e.message:'Erro ao atualizar')).finally(()=>setLoading(false))}} title="Atualizar"><RefreshCw size={17}/></button></div>
 {loading?<div className="tracking-state"><Clock3/><h2>Carregando seus serviços...</h2></div>:error&&!data?<div className="tracking-state"><AlertCircle/><h2>Não foi possível acessar</h2><p>{error}</p></div>:data&&<>
 <div className="customer-portal-welcome"><small>OLÁ,</small><h1>{data.customer_name}</h1><p>Acompanhe seus serviços, orçamentos e garantias em um só lugar.</p></div>
 {notice&&<p className="tracking-feedback"><CheckCircle2 size={17}/>{notice}</p>}{error&&<p className="tracking-error"><AlertCircle size={17}/>{error}</p>}
 <div className="customer-portal-summary"><div><b>{data.orders.length}</b><small>Serviços</small></div><div><b>{data.orders.filter(o=>o.status==='waiting_approval'&&!o.customer_approval_decision).length}</b><small>Aprovações</small></div><div><b>{data.orders.filter(o=>o.warranty_expires_at&&new Date(o.warranty_expires_at).getTime()>=Date.now()).length}</b><small>Em garantia</small></div></div>
 <h2 className="customer-portal-section-title">Meus serviços</h2>
 {data.orders.length===0?<p className="company-empty">Nenhuma ordem de serviço encontrada.</p>:<div className="customer-portal-orders">{data.orders.map(order=>{
 const expiry=order.warranty_expires_at?new Date(order.warranty_expires_at):null
 const warrantyActive=!!expiry&&expiry.getTime()>=Date.now()
 const canApprove=order.status==='waiting_approval'&&!order.customer_approval_decision
 const amount=Number(order.final_price)>0?Number(order.final_price):Number(order.estimated_price)
 return <article className="customer-portal-order" key={order.id}>
  <div className="customer-portal-order-head"><div><small>ORDEM DE SERVIÇO</small><h3>#{order.order_number}</h3></div><span className="tracking-status">{labels[order.status]||order.status}</span></div>
  <div className="customer-portal-device"><Smartphone size={19}/><b>{[order.device_brand,order.device_model].filter(Boolean).join(' ')||order.device_type||'Equipamento'}</b></div>
  <div className="customer-portal-facts"><div><small>DEFEITO INFORMADO</small><b>{order.reported_issue||'Não informado'}</b></div>{order.diagnosis&&<div><small>DIAGNÓSTICO / SERVIÇO</small><b>{order.diagnosis}</b></div>}<div><small>VALOR DO ORÇAMENTO</small><b>{money(amount)}</b></div><div><small>ABERTA EM</small><b>{new Date(order.received_at).toLocaleDateString('pt-BR')}</b></div></div>
  {canApprove&&<div className="customer-portal-approval"><b>Este orçamento precisa da sua autorização</b><div><button className="tracking-approve" disabled={busy===order.id} onClick={()=>void respond(order,'approved')}><ThumbsUp size={16}/>{busy===order.id?'Aguarde...':'Aprovar serviço'}</button><button className="tracking-reject" disabled={busy===order.id} onClick={()=>void respond(order,'rejected')}><ThumbsDown size={16}/>Recusar serviço</button></div></div>}
  {order.customer_approval_decision&&<p className="customer-portal-decision">{order.customer_approval_decision==='approved'?'Você aprovou este serviço':'Você recusou este serviço'}{order.customer_approval_at?' · '+new Date(order.customer_approval_at).toLocaleString('pt-BR'):''}</p>}
  {order.warranty_expires_at&&<div className={warrantyActive?'customer-portal-warranty active':'customer-portal-warranty expired'}><ShieldCheck size={19}/><div><b>{warrantyActive?'Garantia ativa':'Garantia expirada'}</b><small>{order.warranty_days||90} dias · Início: {order.warranty_started_at?new Date(order.warranty_started_at).toLocaleDateString('pt-BR'):'—'} · Vencimento: {expiry?.toLocaleDateString('pt-BR')}</small>{warrantyActive&&<small>{Math.max(0,Math.ceil((expiry!.getTime()-Date.now())/86400000))} dia(s) restantes</small>}</div></div>}
  <small className="customer-portal-updated"><PackageCheck size={14}/> Última atualização: {new Date(order.updated_at).toLocaleString('pt-BR')}</small>
 </article>
 })}</div>}
 </>}
 </div><footer>EDERTEC OS PRO · Portal seguro do cliente</footer></main>
}
