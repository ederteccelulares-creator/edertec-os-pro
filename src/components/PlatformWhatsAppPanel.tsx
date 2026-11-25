import { useEffect, useState, type FormEvent } from 'react'
import { MessageCircle, ShieldCheck, Copy } from 'lucide-react'
import { supabase } from '../lib/supabase'

type Status = { app_id?:string; phone_number_id?:string; waba_id?:string; app_secret_configured?:boolean; access_token_configured?:boolean; verify_token_configured?:boolean; updated_at?:string; callback_url?:string }

export default function PlatformWhatsAppPanel(){
  const [status,setStatus]=useState<Status|null>(null)
  const [form,setForm]=useState({appId:'',phoneId:'',wabaId:'',appSecret:'',accessToken:'',verifyToken:''})
  const [loading,setLoading]=useState(true)
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const [notice,setNotice]=useState('')
  const callback='https://btouoeftgatyrvuobicr.supabase.co/functions/v1/whatsapp-webhook'
  async function load(){
    if(!supabase)return
    setLoading(true);setError('')
    try{
      const {data,error}=await supabase.functions.invoke('whatsapp-webhook?action=settings',{method:'GET'})
      if(error)throw error
      setStatus(data||{})
      setForm(v=>({...v,appId:data?.app_id||'',phoneId:data?.phone_number_id||'',wabaId:data?.waba_id||''}))
    }catch(e){setError(e instanceof Error?e.message:'Não foi possível consultar o WhatsApp.')}
    finally{setLoading(false)}
  }
  useEffect(()=>{void load()},[])
  async function save(e:FormEvent){
    e.preventDefault();if(!supabase)return
    const payload={app_id:form.appId.trim(),phone_number_id:form.phoneId.trim(),waba_id:form.wabaId.trim(),app_secret:form.appSecret.trim(),access_token:form.accessToken.trim(),verify_token:form.verifyToken.trim()}
    if(!Object.values(payload).some(Boolean)){setError('Preencha pelo menos um campo.');return}
    if(payload.app_secret&&payload.app_secret.length<20){setError('A App Secret parece inválida.');return}
    if(payload.access_token&&payload.access_token.length<20){setError('O Access Token parece inválido.');return}
    if(payload.verify_token&&payload.verify_token.length<24){setError('O Verify Token deve ter no mínimo 24 caracteres.');return}
    setBusy(true);setError('');setNotice('')
    try{
      const {data,error}=await supabase.functions.invoke('whatsapp-webhook?action=settings',{body:payload})
      if(error)throw error
      if(data?.error)throw new Error(data.error)
      setForm(v=>({...v,appSecret:'',accessToken:'',verifyToken:''}))
      setNotice('Credenciais salvas com segurança no Supabase Vault. Elas não serão exibidas novamente.')
      await load()
    }catch(e){setError(e instanceof Error?e.message:'Não foi possível salvar as credenciais.')}
    finally{setBusy(false)}
  }
  return <section className="platform-panel">
    <div className="platform-panel-title"><h2><MessageCircle size={20}/> Central WhatsApp · Meta Cloud API</h2><span className="platform-hint">Somente Super Admin</span></div>
    <p className="platform-hint">Configure a integração global da plataforma. As credenciais são armazenadas criptografadas no Supabase Vault e nunca são devolvidas ao navegador.</p>
    {error&&<div className="platform-error">{error}</div>}{notice&&<div className="platform-notice">{notice}</div>}
    {loading?<p className="platform-empty">Verificando configuração...</p>:<div className="platform-stats">
      <article><ShieldCheck/><small>Meta App Secret</small><b>{status?.app_secret_configured?'Configurado':'Pendente'}</b></article>
      <article><ShieldCheck/><small>Access Token</small><b>{status?.access_token_configured?'Configurado':'Pendente'}</b></article>
      <article><ShieldCheck/><small>Verify Token</small><b>{status?.verify_token_configured?'Configurado':'Pendente'}</b></article>
    </div>}
    <form className="platform-form" onSubmit={save}>
      <label>Meta App ID<input value={form.appId} onChange={e=>setForm(v=>({...v,appId:e.target.value}))} placeholder="ID do aplicativo"/></label>
      <label>Phone Number ID<input value={form.phoneId} onChange={e=>setForm(v=>({...v,phoneId:e.target.value}))} placeholder="ID do número comercial"/></label>
      <label className="platform-wide">WhatsApp Business Account ID<input value={form.wabaId} onChange={e=>setForm(v=>({...v,wabaId:e.target.value}))} placeholder="WABA ID"/></label>
      <label className="platform-wide">Meta App Secret<input type="password" autoComplete="new-password" value={form.appSecret} onChange={e=>setForm(v=>({...v,appSecret:e.target.value}))} placeholder={status?.app_secret_configured?'Configurado — digite somente para substituir':'Chave secreta do aplicativo Meta'}/></label>
      <label className="platform-wide">WhatsApp Access Token<input type="password" autoComplete="new-password" value={form.accessToken} onChange={e=>setForm(v=>({...v,accessToken:e.target.value}))} placeholder={status?.access_token_configured?'Configurado — digite somente para substituir':'Token da Cloud API'}/></label>
      <label className="platform-wide">Webhook Verify Token<input type="password" autoComplete="new-password" value={form.verifyToken} onChange={e=>setForm(v=>({...v,verifyToken:e.target.value}))} placeholder={status?.verify_token_configured?'Configurado — digite somente para substituir':'Crie um token aleatório exclusivo (24+ caracteres)'}/></label>
      <div className="platform-form-actions"><button type="submit" disabled={busy}>{busy?'Salvando...':'Salvar configuração segura'}</button></div>
    </form>
    <h3>Assistente do Webhook</h3>
    <p className="platform-hint">A URL abaixo e o Verify Token salvo acima precisam ser informados na configuração de Webhooks da Meta. O App Secret é usado pelo servidor para validar a assinatura das notificações recebidas.</p>
    <div className="platform-form"><label className="platform-wide">URL de callback<input readOnly value={status?.callback_url||callback}/></label><div className="platform-form-actions"><button type="button" onClick={()=>{void navigator.clipboard.writeText(status?.callback_url||callback);setNotice('URL copiada.')}}><Copy size={15}/> Copiar URL</button></div></div>
    <div className="platform-notice">Etapas: salve os três segredos; copie o Verify Token para a Meta; clique em “Verificar e salvar” na Meta; depois conecte o número e assine os eventos do WhatsApp.</div>
    <p className="platform-hint">Última atualização: {status?.updated_at?new Date(status.updated_at).toLocaleString('pt-BR'):'Ainda não configurado'}.</p>
    <a className="platform-mp-open" href="https://developers.facebook.com/apps/" target="_blank" rel="noreferrer">Abrir Meta for Developers ↗</a>
  </section>
}
