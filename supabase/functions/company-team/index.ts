import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors={ "Access-Control-Allow-Origin":"*", "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods":"POST, OPTIONS" };
const reply=(body:Record<string,unknown>,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json"}});
const roles=["owner","admin","manager","attendant","technician"];
const pinDigest=async(pin:string)=>{const salt=crypto.getRandomValues(new Uint8Array(16));const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(pin),"PBKDF2",false,["deriveBits"]);const bits=await crypto.subtle.deriveBits({name:"PBKDF2",salt,iterations:210000,hash:"SHA-256"},key,256);const hex=(b:Uint8Array)=>Array.from(b).map(x=>x.toString(16).padStart(2,"0")).join("");return hex(salt)+":"+hex(new Uint8Array(bits));};
Deno.serve(async(req)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
 if(req.method!=="POST")return reply({error:"Método não permitido."},405);
 const authorization=req.headers.get("Authorization")||"";
 if(!authorization.startsWith("Bearer "))return reply({error:"Sessão não encontrada."},401);
 const url=Deno.env.get("SUPABASE_URL"),anon=Deno.env.get("SUPABASE_ANON_KEY"),service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
 if(!url||!anon||!service)return reply({error:"Função não configurada."},500);
 const auth=createClient(url,anon,{global:{headers:{Authorization:authorization}},auth:{persistSession:false}});
 const admin=createClient(url,service,{auth:{persistSession:false}});
 const {data:{user:actor},error:authErr}=await auth.auth.getUser();
 if(authErr||!actor)return reply({error:"Sessão inválida."},401);
 let body:any;try{body=await req.json()}catch{return reply({error:"Dados inválidos."},400)}
 const companyId=String(body.company_id||"");
 if(!/^[0-9a-f-]{36}$/i.test(companyId))return reply({error:"Empresa inválida."},400);
 const {data:membership}=await admin.from("company_members").select("role,is_active").eq("company_id",companyId).eq("user_id",actor.id).maybeSingle();
 if(!membership?.is_active||!["owner","admin"].includes(membership.role))return reply({error:"Somente proprietário ou administrador pode gerenciar usuários."},403);
 const action=String(body.action||"list");
 if(action==="list"){
  const {data:company}=await admin.from("companies").select("login_code").eq("id",companyId).maybeSingle();
  const {data:members,error}=await admin.from("company_members").select("user_id,role,is_active,created_at").eq("company_id",companyId).order("created_at");
  if(error)return reply({error:error.message},500);
  const {data:employees,error:empErr}=await admin.from("employees").select("id,user_id,name,username,phone,email,job_title,is_active,branch_id").eq("company_id",companyId).order("name");
  if(empErr)return reply({error:empErr.message},500);
  const users=await Promise.all((members||[]).map(async(m)=>{
   const {data}=await admin.auth.admin.getUserById(m.user_id);
   const e=(employees||[]).find(x=>x.user_id===m.user_id);
   return {user_id:m.user_id,email:data.user?.email||e?.email||"",role:m.role,is_active:m.is_active,created_at:m.created_at,employee:e||null};
  }));
  return reply({members:users,employees:employees||[],company_code:company?.login_code||null});
 }
 if(action==="create"){
  const name=String(body.name||"").trim(),username=String(body.username||"").trim().toLowerCase(),providedEmail=String(body.email||"").trim().toLowerCase(),email=providedEmail||("staff+"+username+"."+companyId.replace(/-/g,"")+"@login.edertecospro.com.br"),password=String(body.password||""),pin=String(body.pin||""),role=String(body.role||"technician"),phone=String(body.phone||"").trim(),jobTitle=String(body.job_title||"").trim();
  if(!/^[a-z0-9._-]{3,30}$/.test(username))return reply({error:"O usuário deve ter de 3 a 30 caracteres: letras, números, ponto, hífen ou underline."},400);
  if(providedEmail&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(providedEmail))return reply({error:"Informe um e-mail válido ou deixe em branco."},400);
  const {data:duplicate}=await admin.from("employees").select("id").eq("company_id",companyId).ilike("username",username).maybeSingle();
  if(duplicate)return reply({error:"Este nome de usuário já está cadastrado nesta empresa."},409);
  if(name.length<2)return reply({error:"Informe o nome completo."},400);
  if(password.length>0&&password.length<8)return reply({error:"A senha opcional deve ter pelo menos 8 caracteres."},400);
  if(!/^\\d{6}$/.test(pin))return reply({error:"Defina um PIN inicial de exatamente 6 números."},400);
  if(!roles.includes(role)||role==="owner")return reply({error:"Perfil inválido."},400);
  if(role==="admin"&&membership.role!=="owner")return reply({error:"Somente o proprietário pode cadastrar outro administrador."},403);
  const {data:existing}=await admin.auth.admin.listUsers({page:1,perPage:1000});
  const already=existing.users.find(u=>u.email?.toLowerCase()===email);
  if(already)return reply({error:"Este e-mail já possui conta. Para evitar vincular uma conta errada, use um e-mail novo ou solicite a transferência pelo suporte."},409);
  const {data:created,error:createErr}=await admin.auth.admin.createUser({email,password:password||crypto.randomUUID()+"A9!",email_confirm:true,user_metadata:{full_name:name,company_id:companyId,username}});
  if(createErr||!created.user)return reply({error:createErr?.message||"Não foi possível criar a conta."},400);
  const {error:memberErr}=await admin.from("company_members").insert({company_id:companyId,user_id:created.user.id,role,is_active:true});
  if(memberErr){await admin.auth.admin.deleteUser(created.user.id);return reply({error:memberErr.message},500)}
  const pinHash=await pinDigest(pin);
  const {error:employeeErr}=await admin.from("employees").insert({company_id:companyId,user_id:created.user.id,name,email:providedEmail||null,username,pin_hash:pinHash,phone:phone||null,job_title:jobTitle||null,is_active:true});
  if(employeeErr){await admin.from("company_members").delete().eq("company_id",companyId).eq("user_id",created.user.id);await admin.auth.admin.deleteUser(created.user.id);return reply({error:employeeErr.message},500)}
  return reply({success:true,message:"Funcionário e usuário cadastrados com sucesso."});
 }
 const target=String(body.user_id||"");
 if(!target)return reply({error:"Usuário não informado."},400);
 const {data:targetMember}=await admin.from("company_members").select("role").eq("company_id",companyId).eq("user_id",target).maybeSingle();
 if(!targetMember)return reply({error:"Usuário não pertence a esta empresa."},404);
 if(targetMember.role==="owner")return reply({error:"O proprietário principal não pode ser alterado por esta tela."},403);
 if(action==="set_pin"){
  const pin=String(body.pin||"");if(!/^\\d{6}$/.test(pin))return reply({error:"O PIN deve conter exatamente 6 números."},400);
  const hash=await pinDigest(pin);const {error}=await admin.from("employees").update({pin_hash:hash}).eq("company_id",companyId).eq("user_id",target);
  if(error)return reply({error:error.message},500);return reply({success:true,message:"PIN configurado com segurança."});
 }
 if(action==="update"){
  const nextRole=String(body.role||"");
  if(!roles.includes(nextRole)||nextRole==="owner")return reply({error:"Perfil inválido."},400);
  if(nextRole==="admin"&&membership.role!=="owner")return reply({error:"Somente o proprietário pode conceder perfil de administrador."},403);
  const {error}=await admin.from("company_members").update({role:nextRole}).eq("company_id",companyId).eq("user_id",target);
  if(error)return reply({error:error.message},500);
  return reply({success:true,message:"Permissões atualizadas."});
 }
 if(action==="toggle"){
  if(target===actor.id)return reply({error:"Você não pode desativar seu próprio acesso."},400);
  const active=body.is_active===true;
  const {error}=await admin.from("company_members").update({is_active:active}).eq("company_id",companyId).eq("user_id",target);
  if(error)return reply({error:error.message},500);
  await admin.from("employees").update({is_active:active}).eq("company_id",companyId).eq("user_id",target);
  return reply({success:true,message:active?"Acesso reativado.":"Acesso desativado."});
 }
 return reply({error:"Ação desconhecida."},400);
});
