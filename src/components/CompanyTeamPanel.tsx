import { useCallback,useEffect,useState } from 'react';
import { UserPlus,Users,ShieldCheck,UserX,RefreshCw } from 'lucide-react';
import { supabase } from '../lib/supabase';
type Member={user_id:string;email:string;role:string;is_active:boolean;created_at:string;employee?:{name:string;username:string|null;phone:string|null;job_title:string|null}|null};
const labels:Record<string,string>={owner:'Proprietário',admin:'Administrador',manager:'Gerente',attendant:'Atendente',technician:'Técnico'};
export default function CompanyTeamPanel({companyId,actorRole}:{companyId:string;actorRole:string}){
 const [members,setMembers]=useState<Member[]>([]),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [form,setForm]=useState({name:'',username:'',email:'',phone:'',job_title:'',password:'',pin:'',role:'technician'}),[companyCode,setCompanyCode]=useState('');
 const canCreateAdmin=actorRole==='owner';
 const call=useCallback(async(payload:Record<string,unknown>)=>{if(!supabase)throw new Error('Banco não configurado.');const {data:sessionData,error:sessionError}=await supabase.auth.getSession();if(sessionError)throw sessionError;const accessToken=sessionData.session?.access_token;if(!accessToken)throw new Error('Sua sessão expirou. Entre novamente no sistema.');const {data,error}=await supabase.functions.invoke('company-team',{body:{company_id:companyId,...payload},headers:{Authorization:'Bearer '+accessToken}});if(error)throw new Error('Falha na comunicação com o servidor: '+error.message);if(data?.error)throw new Error(data.error);return data;},[companyId]);
 const load=useCallback(async()=>{setLoading(true);setError('');try{const data=await call({action:'list'});setMembers(data.members||[]);setCompanyCode(data.company_code||'')}catch(e){setError(e instanceof Error?e.message:'Falha ao carregar funcionários.')}finally{setLoading(false)}},[call]);
 useEffect(()=>{void load()},[load]);
 async function create(e:React.FormEvent){e.preventDefault();setBusy(true);setError('');setNotice('');try{const data=await call({action:'create',...form});setNotice(data.message);setForm({name:'',username:'',email:'',phone:'',job_title:'',password:'',role:'technician'});await load()}catch(e){setError(e instanceof Error?e.message:'Falha ao cadastrar.')}finally{setBusy(false)}}
 async function changeRole(user_id:string,role:string){setBusy(true);setError('');try{const data=await call({action:'update',user_id,role});setNotice(data.message);await load()}catch(e){setError(e instanceof Error?e.message:'Falha ao alterar perfil.')}finally{setBusy(false)}}
 async function configurePin(m:Member){
  const pin=window.prompt('Defina um PIN de 6 números para '+(m.employee?.name||m.email)+':');
  if(pin===null)return;
  if(!/^\d{6}$/.test(pin)){setError('O PIN deve conter exatamente 6 números.');return;}
  const confirmation=window.prompt('Digite novamente o mesmo PIN para confirmar:');
  if(confirmation===null)return;
  if(confirmation!==pin){setError('Os PINs não conferem.');return;}
  setBusy(true);setError('');setNotice('');
  try{const data=await call({action:'set_pin',user_id:m.user_id,pin});setNotice(data.message||'PIN configurado.');}
  catch(e){setError(e instanceof Error?e.message:'Falha ao configurar PIN.');}
  finally{setBusy(false);}
 }
 async function toggle(m:Member){setBusy(true);setError('');try{const data=await call({action:'toggle',user_id:m.user_id,is_active:!m.is_active});setNotice(data.message);await load()}catch(e){setError(e instanceof Error?e.message:'Falha ao alterar acesso.')}finally{setBusy(false)}}
 return <section className="company-team">
  <div className="company-panel"><div className="company-panel-head"><div><b><Users size={18}/> Funcionários e usuários</b><small>Cadastre a equipe e controle quem pode acessar cada módulo</small>{companyCode&&<small><strong>Código da empresa para login: {companyCode}</strong></small>}</div><button className="company-secondary" onClick={()=>void load()}><RefreshCw size={15}/> Atualizar</button></div>
   {error&&<div className="company-error-banner">{error}</div>}{notice&&<div className="company-notice-banner">{notice}</div>}
   <form className="company-form" onSubmit={create}><h3><UserPlus size={17}/> Novo funcionário e acesso ao sistema</h3><div className="company-form-grid">
    <label>Nome completo<input required minLength={2} value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></label>
    <label>Nome de usuário<input required minLength={3} maxLength={30} value={form.username} onChange={e=>setForm({...form,username:e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g,'').slice(0,30)})} placeholder="Ex.: joao"/></label>
    <label>E-mail (opcional)<input type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})} placeholder="Pode deixar em branco"/></label>
    <label>Telefone<input value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})}/></label>
    <label>Cargo<input value={form.job_title} onChange={e=>setForm({...form,job_title:e.target.value})} placeholder="Ex.: Técnico de celulares"/></label>
    <label>PIN inicial (6 números)<input required minLength={6} maxLength={6} inputMode="numeric" type="password" value={form.pin} onChange={e=>setForm({...form,pin:e.target.value.replace(/[^0-9]/g,'').slice(0,6)})} placeholder="••••••"/></label>
    <label>Senha alternativa (opcional)<input minLength={8} type="password" autoComplete="new-password" value={form.password} onChange={e=>setForm({...form,password:e.target.value})} placeholder="Opcional"/></label>
    <label>Perfil de acesso<select value={form.role} onChange={e=>setForm({...form,role:e.target.value})}><option value="technician">Técnico</option><option value="attendant">Atendente</option><option value="manager">Gerente</option>{canCreateAdmin&&<option value="admin">Administrador</option>}</select></label>
   </div><button className="company-primary" disabled={busy}><UserPlus size={16}/>{busy?'Salvando...':'Cadastrar funcionário'}</button><p className="company-hint">O funcionário entrará com o código da empresa, nome de usuário e PIN de 6 números. E-mail e senha são opcionais.</p></form>
  </div>
  <div className="company-panel"><div className="company-panel-head"><div><b>Equipe cadastrada</b><small>{members.length} usuários vinculados à empresa</small></div></div>
   {loading?<p className="company-empty">Carregando equipe...</p>:members.length===0?<p className="company-empty">Nenhum usuário encontrado.</p>:<div className="company-table-wrap"><table><thead><tr><th>FUNCIONÁRIO</th><th>PERFIL</th><th>ACESSO</th><th>AÇÕES</th></tr></thead><tbody>{members.map(m=><tr key={m.user_id}><td><b>{m.employee?.name||m.email}</b><small>{m.employee?.username?('Usuário: '+m.employee.username):(m.email||'Conta antiga')}{m.employee?.job_title?' · '+m.employee.job_title:''}</small></td><td><select disabled={busy||m.role==='owner'||(m.role==='admin'&&!canCreateAdmin)} value={m.role} onChange={e=>void changeRole(m.user_id,e.target.value)}><option value="admin">Administrador</option><option value="manager">Gerente</option><option value="attendant">Atendente</option><option value="technician">Técnico</option></select></td><td><span className={m.is_active?'company-team-active':'company-team-inactive'}>{m.is_active?'Ativo':'Desativado'}</span></td><td><button className="company-secondary company-small-action" disabled={busy||m.role==='owner'} onClick={()=>void toggle(m)}>{m.is_active?<UserX size={14}/>:<ShieldCheck size={14}/>} {m.is_active?'Desativar':'Ativar'}</button><button className="company-secondary company-small-action" disabled={busy||!m.is_active} onClick={()=>void configurePin(m)}>Configurar PIN</button></td></tr>)}</tbody></table></div>}
  </div>
  <div className="company-panel"><div className="company-panel-head"><div><b>O que cada perfil pode fazer</b><small>Permissões aplicadas também no banco de dados</small></div><ShieldCheck size={20}/></div><div className="company-team-permissions">
   <p><b>Proprietário:</b> controle total, inclusive administradores e cobrança.</p><p><b>Administrador:</b> gerencia usuários, configurações e operação, sem transferir propriedade.</p><p><b>Gerente:</b> PDV, estoque, compras, financeiro e gestão operacional.</p><p><b>Atendente:</b> cadastro de clientes e abertura/atualização de OS, sem acesso ao financeiro e estoque.</p><p><b>Técnico:</b> consulta OS e atualiza diagnóstico, andamento técnico e itens de serviço.</p>
  </div></div>
 </section>;
}
