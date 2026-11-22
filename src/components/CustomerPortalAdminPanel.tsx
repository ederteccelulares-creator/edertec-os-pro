import { useState } from 'react'
import { Copy, MessageCircle, Share2, Users } from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { Company, CompanyCustomer } from '../lib/company-data'

export default function CustomerPortalAdminPanel({company,customers}:{company:Company;customers:CompanyCustomer[]}){
 const [busy,setBusy]=useState<string|null>(null)
 const [links,setLinks]=useState<Record<string,string>>({})
 const [message,setMessage]=useState('')
 async function share(customer:CompanyCustomer){
  if(!supabase)return
  setBusy(customer.id);setMessage('')
  try{
   let url=links[customer.id]
   if(!url){
    const {data,error}=await supabase.rpc('create_company_customer_portal_link',{p_company_id:company.id,p_customer_id:customer.id})
    if(error)throw error
    if(typeof data!=='string'||data.length!==64)throw new Error('Não foi possível gerar o link.')
    url=new URL('?area-cliente='+data,window.location.origin+window.location.pathname).toString()
    setLinks(old=>({...old,[customer.id]:url}))
   }
   const text='Olá, '+customer.name+'! Acesse sua Área do Cliente da '+company.name+' para acompanhar todas as suas ordens de serviço, aprovar orçamentos e consultar suas garantias: '+url
   if(navigator.share){await navigator.share({title:'Área do Cliente · '+company.name,text,url})}
   else{await navigator.clipboard.writeText(text);setMessage('Link copiado para compartilhar com '+customer.name+'.')}
  }catch(e){setMessage(e instanceof Error?e.message:'Não foi possível compartilhar o link.')}
  finally{setBusy(null)}
 }
 async function copy(customer:CompanyCustomer){
  if(!supabase)return
  setBusy(customer.id);setMessage('')
  try{
   let url=links[customer.id]
   if(!url){
    const {data,error}=await supabase.rpc('create_company_customer_portal_link',{p_company_id:company.id,p_customer_id:customer.id})
    if(error)throw error
    if(typeof data!=='string'||data.length!==64)throw new Error('Não foi possível gerar o link.')
    url=new URL('?area-cliente='+data,window.location.origin+window.location.pathname).toString()
    setLinks(old=>({...old,[customer.id]:url}))
   }
   await navigator.clipboard.writeText(url)
   setMessage('Link da Área do Cliente copiado para '+customer.name+'.')
  }catch(e){setMessage(e instanceof Error?e.message:'Não foi possível copiar o link.')}
  finally{setBusy(null)}
 }
 return <section className="company-panel">
  <div className="company-panel-head"><div><b>Compartilhar Área do Cliente</b><small>Gere um acesso individual para cada cliente consultar todas as suas OS e garantias</small></div><Share2 size={22}/></div>
  <p className="customer-portal-admin-note">O link é exclusivo deste cliente e permite acompanhar serviços, responder orçamentos pendentes e consultar garantias. Se gerar um novo link, o anterior será revogado.</p>
  {message&&<p className="company-notice-banner">{message}</p>}
  {customers.length===0?<p className="company-empty">Cadastre um cliente antes de compartilhar a área.</p>:<div className="company-portal-customer-list">{customers.map(customer=><div className="company-portal-customer" key={customer.id}><span><Users size={18}/></span><div><b>{customer.name}</b><small>{customer.phone||'Telefone não cadastrado'}</small></div><button className="company-secondary company-small-action" disabled={busy===customer.id} onClick={()=>void copy(customer)}><Copy size={15}/> Copiar link</button><button className="company-primary company-small-action" disabled={busy===customer.id} onClick={()=>void share(customer)}><MessageCircle size={15}/> {busy===customer.id?'Aguarde...':'Compartilhar'}</button></div>)}</div>}
 </section>
}
