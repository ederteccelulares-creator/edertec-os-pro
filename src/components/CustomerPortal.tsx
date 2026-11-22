import { useEffect, useState } from 'react'
import { AlertCircle, CheckCircle2, Clock3, LoaderCircle, Smartphone } from 'lucide-react'
import { supabase, isSupabaseConfigured } from '../lib/supabase'

type PortalEvent = { status: string; created_at: string }
type PortalData = {
  organization_name: string
  order_number: number
  status: string
  reported_issue: string
  estimated_amount: number
  approved_amount: number | null
  received_at: string
  updated_at: string
  customer_name: string
  device: { brand: string; model: string } | null
  events: PortalEvent[]
}

const labels: Record<string, string> = {
  received: 'Recebido',
  diagnosing: 'Em diagnóstico',
  waiting_approval: 'Aguardando sua aprovação',
  waiting_parts: 'Aguardando peça',
  repairing: 'Em conserto',
  ready: 'Pronto para retirada',
  delivered: 'Entregue',
  cancelled: 'Cancelado',
}

const money = (value: number) => Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export default function CustomerPortal({ token }: { token: string }) {
  const [data, setData] = useState<PortalData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    async function load() {
      if (!isSupabaseConfigured || !supabase) {
        if (active) { setError('O portal ainda não está conectado ao banco de dados.'); setLoading(false) }
        return
      }
      const { data: result, error: requestError } = await supabase.rpc('get_service_order_portal', { p_token: token })
      if (!active) return
      if (requestError) setError('Não foi possível consultar esta ordem de serviço.')
      else if (!result) setError('Este link é inválido, foi revogado ou expirou. Solicite um novo link à assistência.')
      else setData(result as PortalData)
      setLoading(false)
    }
    void load()
    return () => { active = false }
  }, [token])

  return <main className="customer-portal-page">
    <section className="customer-portal-card">
      <div className="customer-portal-brand"><span><Smartphone size={22}/></span><div><b>EDERTEC <i>OS PRO</i></b><small>ACOMPANHAMENTO DO CLIENTE</small></div></div>
      {loading ? <div className="customer-portal-state"><LoaderCircle className="spin" size={26}/> Consultando sua ordem de serviço...</div>
        : error ? <div className="customer-portal-state customer-portal-error"><AlertCircle size={28}/><h1>Não foi possível abrir o acompanhamento</h1><p>{error}</p></div>
        : data && <>
          <div className="customer-portal-heading"><small>{data.organization_name}</small><h1>Olá, {data.customer_name}!</h1><p>Acompanhe aqui o andamento do seu aparelho.</p></div>
          <div className="customer-portal-order"><div><small>ORDEM DE SERVIÇO</small><strong>#{data.order_number}</strong></div><span className={'customer-portal-status status-'+data.status}><CheckCircle2 size={16}/>{labels[data.status] || data.status}</span></div>
          <div className="customer-portal-device"><Smartphone size={20}/><div><b>{data.device ? `${data.device.brand} ${data.device.model}` : 'Aparelho em atendimento'}</b><small>Recebido em {new Date(data.received_at).toLocaleDateString('pt-BR')}</small></div></div>
          <section className="customer-portal-section"><h2>Atendimento</h2><p><b>Problema informado:</b> {data.reported_issue}</p></section>
          <section className="customer-portal-section customer-portal-values"><h2>Orçamento</h2><p><span>Valor estimado</span><b>{money(data.estimated_amount)}</b></p>{data.approved_amount !== null && <p><span>Valor aprovado</span><b>{money(data.approved_amount)}</b></p>}</section>
          <section className="customer-portal-section"><h2><Clock3 size={17}/> Histórico do atendimento</h2>{data.events.length === 0 ? <p>O histórico será atualizado conforme o atendimento avançar.</p> : <div className="customer-portal-timeline">{data.events.map((event,index)=><article key={index}><span/><div><b>{labels[event.status] || event.status}</b><small>{new Date(event.created_at).toLocaleString('pt-BR')}</small></div></article>)}</div>}</section>
          <p className="customer-portal-updated">Última atualização: {new Date(data.updated_at).toLocaleString('pt-BR')}</p>
        </>}
      <footer>Este link é pessoal. Não compartilhe com terceiros.</footer>
    </section>
  </main>
}
