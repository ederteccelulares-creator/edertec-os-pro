import { useCallback,useEffect,useState } from 'react';
import { UserPlus,Users,ShieldCheck,UserX,RefreshCw } from 'lucide-react';
import { supabase } from '../lib/supabase';
type Member={user_id:string;email:string;role:string;is_active:boolean;created_at:string;employee?:{name:string;phone:string|null;job_title:string|null}|null};
const labels:Record<string,string>={owner:'Proprietário',admin:'Administrador',manager:'Gerente',attendant:'Atendente',technician:'Técnico'};
export default function CompanyTeamPanel({companyId,actorRole}:{companyId:string;actorRole:string}){
 const [members,setMembers]=useState<Member[]>([]),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [form,setForm]=useState({name:'',email:'',phone:'',job_title:'',password:'',role:'technician'});
 const canCreateAdmin=actorRole==='owner';
 const call=useCallback(async(payload:Record<string,unknown>)=>{if(!supabase)throw new Error('Banco não configurado.');const {data,error}=await supabase.functions.invoke('company-team',{body:{company_id:companyId,...payload}});if(error)throw error;if(data?.error)throw new Error(data.error);return data;},[companyId]);
 const load=useCallback(async()=>{setLoading(true);setError('');try{const data=await call({action:'list'});setMembers(data.members||[])}catch(e){setError(e instanceof Error?e.message:'Falha ao carregar funcionários.')}finally{setLoading(false)}},[call]);
 useEffect(()=>{void load()},[load]);
 async function create(e:React.FormEvent){e.preventDefault();setBusy(true);setError('');setNotice('');try{const data=await call({action:'create',...form});setNotice(data.message);setForm({name:'',email:'',phone:'',job_title:'',password:'',role:'technician'});await load()}catch(e){setError(e instanceof Error?e.message:'Falha ao cadastrar.')}finally{setBusy(false)}}
 async function changeRole(user_id:string,role:string){setBusy(true);setError('');try{const data=await call({action:'update',user_id,role});setNotice(data.message);await load()}catch(e){setError(e instanceof Error?e.message:'Falha ao alterar perfil.')}finally{setBusy(false)}}
 async function toggle(m:Member){setBusy(true);setError('');try{const data=await call({action:'toggle',user_id:m.user_id,is_active:!m.is_active});setNotice(data.message);await load()}catch(e){setError(e instanceof Error?e.message:'Falha ao alterar acesso.')}finally{setBusy(false)}}
 return <section className="company-team">
  <div className="company-panel"><div className="company-panel-head"><div><b><Users size={18}/> Funcionários e usuários</b><small>Cadastre a equipe e controle quem pode acessar cada módulo</small></div><button className="company-secondary" onClick={()=>void load()}><RefreshCw size={15}/> Atualizar</button></div>
   {error&&<div className="company-error-banner">{error}</div>}{notice&&<div className="company-notice-banner">{notice}</div>}
   <form className="company-form" onSubmit={create}><h3><UserPlus size={17}/> Novo funcionário e acesso ao sistema</h3><div className="company-form-grid">
    <label>Nome completo<input required minLength={2} value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></label>
    <label>E-mail de acesso<input required type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})}/></label>
    <label>Telefone<input value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})}/></label>
    <label>Cargo<input value={form.job_title} onChange={e=>setForm({...form,job_title:e.target.value})} placeholder="Ex.: Técnico de celulares"/></label>
    <label>Senha inicial<input required minLength={8} type="password" autoComplete="new-password" value={form.password} onChange={e=>setForm({...form,password:e.target.value})}/></label>
    <label>Perfil de acesso<select value={form.role} onChange={e=>setForm({...form,role:e.target.value})}><option value="technician">Técnico</option><option value="attendant">Atendente</option><option value="manager">Gerente</option>{canCreateAdmin&&<option value="admin">Administrador</option>}</select></label>
   </div><button className="company-primary" disabled={busy}><UserPlus size={16}/>{busy?'Salvando...':'Cadastrar funcionário'}</button><p className="company-hint">A conta será criada com este e-mail e senha. Compartilhe a senha inicial de forma segura com o funcionário.</p></form>
  </div>
  <div className="company-panel"><div className="company-panel-head"><div><b>Equipe cadastrada</b><small>{members.length} usuários vinculados à empresa</small></div></div>
   {loading?<p className="company-empty">Carregando equipe...</p>:members.length===0?<p className="company-empty">Nenhum usuário encontrado.</p>:<div className="company-table-wrap"><table><thead><tr><th>FUNCIONÁRIO</th><th>PERFIL</th><th>ACESSO</th><th>AÇÕES</th></tr></thead><tbody>{members.map(m=><tr key={m.user_id}><td><b>{m.employee?.name||m.email}</b><small>{m.email}{m.employee?.job_title?' · '+m.employee.job_title:''}</small></td><td><select disabled={busy||m.role==='owner'||(m.role==='admin'&&!canCreateAdmin)} value={m.role} onChange={e=>void changeRole(m.user_id,e.target.value)}><option value="admin">Administrador</option><option value="manager">Gerente</option><option value="attendant">Atendente</option><option value="technician">Técnico</option></select></td><td><span className={m.is_active?'company-team-active':'company-team-inactive'}>{m.is_active?'Ativo':'Desativado'}</span></td><td><button className="company-secondary company-small-action" disabled={busy||m.role==='owner'} onClick={()=>void toggle(m)}>{m.is_active?<UserX size={14}/>:<ShieldCheck size={14}/>} {m.is_active?'Desativar':'Ativar'}</button></td></tr>)}</tbody></table></div>}
  </div>
  <div className="company-panel"><div className="company-panel-head"><div><b>O que cada perfil pode fazer</b><small>Permissões aplicadas também no banco de dados</small></div><ShieldCheck size={20}/></div><div className="company-team-permissions">
   <p><b>Proprietário:</b> controle total, inclusive administradores e cobrança.</p><p><b>Administrador:</b> gerencia usuários, configurações e operação, sem transferir propriedade.</p><p><b>Gerente:</b> PDV, estoque, compras, financeiro e gestão operacional.</p><p><b>Atendente:</b> cadastro de clientes e abertura/atualização de OS, sem acesso ao financeiro e estoque.</p><p><b>Técnico:</b> consulta OS e atualiza diagnóstico, andamento técnico e itens de serviço.</p>
  </div></div>
 </section>;
}
