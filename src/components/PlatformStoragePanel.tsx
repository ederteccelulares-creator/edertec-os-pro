import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Database, FileImage, HardDrive, RefreshCw } from 'lucide-react'
import { supabase } from '../lib/supabase'

type CompanyUsage = { company_id:string; company_name:string; files:number; bytes:number; photos:number }
type Usage = { total_files:number; total_bytes:number; total_photos:number; buckets:{id:string;name:string;is_public:boolean;file_size_limit:number|null}[]; companies:CompanyUsage[]; scanned_at:string; truncated:boolean }
const STORAGE_LIMIT_BYTES = 1024 * 1024 * 1024
const formatBytes = (bytes:number) => {
  if (!bytes) return '0 B'
  const units = ['B','KB','MB','GB','TB']
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  return (bytes / Math.pow(1024,index)).toLocaleString('pt-BR',{maximumFractionDigits:2})+' '+units[index]
}
const percent = (bytes:number, limit:number) => Math.min(100, Math.max(0, bytes / limit * 100))
const level = (value:number) => value >= 95 ? 'critical' : value >= 85 ? 'high' : value >= 70 ? 'warning' : 'normal'

export default function PlatformStoragePanel() {
  const [usage,setUsage]=useState<Usage|null>(null)
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState('')
  const load=useCallback(async()=>{
    if(!supabase)return
    setLoading(true);setError('')
    try{
      const {data,error}=await supabase.functions.invoke('platform-storage-usage',{method:'GET'})
      if(error)throw error
      if(data?.error)throw new Error(data.error)
      setUsage(data as Usage)
    }catch(e){setError(e instanceof Error?e.message:'Não foi possível carregar o armazenamento.')}
    finally{setLoading(false)}
  },[])
  useEffect(()=>{void load()},[load])
  const used=usage?.total_bytes||0
  const usedPercent=percent(used,STORAGE_LIMIT_BYTES)
  const status=level(usedPercent)
  const remaining=Math.max(0,STORAGE_LIMIT_BYTES-used)
  const companyRows=useMemo(()=>usage?.companies||[],[usage])
  const styles:Record<string,React.CSSProperties>={
    card:{background:'var(--platform-card, #17191f)',border:'1px solid var(--platform-border, #2b2e37)',borderRadius:14,padding:18,minWidth:0},
    muted:{color:'var(--platform-muted, #9ca3af)',fontSize:12},
    value:{display:'block',fontSize:26,fontWeight:750,marginTop:8},
    bar:{height:12,background:'#30333c',borderRadius:99,overflow:'hidden',marginTop:12},
    row:{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,padding:'12px 0',borderBottom:'1px solid var(--platform-border, #2b2e37)'},
  }
  return <section className="platform-panel">
    <div className="platform-panel-title">
      <div><h2>Armazenamento da plataforma</h2><p className="platform-hint">Consumo global de fotos e arquivos de todas as empresas</p></div>
      <button type="button" onClick={()=>void load()} disabled={loading}><RefreshCw size={15}/> {loading?'Atualizando...':'Atualizar'}</button>
    </div>
    {error&&<div className="platform-error">{error}</div>}
    {loading&&!usage?<p className="platform-empty">Consultando o armazenamento...</p>:usage&&<>
      <div style={{...styles.card,marginBottom:16}}>
        <div style={{display:'flex',justifyContent:'space-between',gap:12,flexWrap:'wrap'}}>
          <div><span style={styles.muted}>Espaço utilizado</span><strong style={styles.value}>{formatBytes(used)}</strong></div>
          <div><span style={styles.muted}>Limite de referência · Supabase Free</span><strong style={styles.value}>{formatBytes(STORAGE_LIMIT_BYTES)}</strong></div>
          <div><span style={styles.muted}>Espaço restante estimado</span><strong style={styles.value}>{formatBytes(remaining)}</strong></div>
        </div>
        <div style={styles.bar}><div style={{height:'100%',width:usedPercent+'%',background:status==='critical'?'#ef4444':status==='high'?'#f97316':status==='warning'?'#eab308':'#22c55e',borderRadius:99,transition:'width .25s'}}/></div>
        <div style={{display:'flex',justifyContent:'space-between',gap:8,marginTop:8,fontSize:13}}><b>{usedPercent.toLocaleString('pt-BR',{maximumFractionDigits:1})}% utilizado</b><span style={styles.muted}>Alertas: 70% · 85% · 95%</span></div>
        {usedPercent>=70&&<p style={{color:status==='critical'?'#f87171':'#fbbf24',fontWeight:650,marginTop:12,display:'flex',alignItems:'center',gap:8}}><AlertTriangle size={17}/>{usedPercent>=95?'Armazenamento crítico: planeje a limpeza ou ampliação do plano.':usedPercent>=85?'Atenção: o armazenamento está próximo do limite.':'Aviso: o consumo atingiu 70% do limite de referência.'}</p>}
      </div>
      <div className="platform-stats">
        <article><HardDrive/><small>Arquivos armazenados</small><b>{usage.total_files.toLocaleString('pt-BR')}</b></article>
        <article><FileImage/><small>Fotos e imagens</small><b>{usage.total_photos.toLocaleString('pt-BR')}</b></article>
        <article><Database/><small>Buckets</small><b>{usage.buckets.length}</b></article>
      </div>
      <section style={{...styles.card,marginTop:16}}>
        <h3 style={{marginTop:0}}>Consumo por empresa</h3>
        {companyRows.length?companyRows.map(row=><div key={row.company_id} style={styles.row}>
          <div style={{minWidth:0}}><b style={{display:'block',overflow:'hidden',textOverflow:'ellipsis'}}>{row.company_name}</b><span style={styles.muted}>{row.photos} fotos · {row.files} arquivos</span></div>
          <strong style={{whiteSpace:'nowrap'}}>{formatBytes(row.bytes)}</strong>
        </div>):<p className="platform-empty">Nenhum arquivo encontrado no Storage.</p>}
      </section>
      <section style={{...styles.card,marginTop:16}}>
        <h3 style={{marginTop:0}}>Buckets de armazenamento</h3>
        {usage.buckets.map(bucket=><div key={bucket.id} style={styles.row}><div><b>{bucket.name}</b><div style={styles.muted}>{bucket.is_public?'Público':'Privado'}</div></div><span style={styles.muted}>Máx. por arquivo: {bucket.file_size_limit?formatBytes(bucket.file_size_limit):'Não definido'}</span></div>)}
      </section>
      <p className="platform-hint" style={{marginTop:14}}>Última consulta: {new Date(usage.scanned_at).toLocaleString('pt-BR')}. O limite de 1 GB é uma referência do plano Free, não uma leitura automática da franquia contratada. {usage.truncated?'A leitura atingiu o limite de 100 mil arquivos e pode estar incompleta.':''}</p>
    </>}
  </section>
}
