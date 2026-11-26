import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const reply=(body:Record<string,unknown>,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json"}});
const verifyPin=async(pin:string,stored:string)=>{const [saltHex,hashHex]=stored.split(":");if(!saltHex||!hashHex)return false;const fromHex=(v:string)=>new Uint8Array(v.match(/.{1,2}/g)?.map(x=>parseInt(x,16))||[]);const salt=fromHex(saltHex),expected=fromHex(hashHex);const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(pin),"PBKDF2",false,["deriveBits"]);const bits=new Uint8Array(await crypto.subtle.deriveBits({name:"PBKDF2",salt,iterations:210000,hash:"SHA-256"},key,256));return bits.length===expected.length&&bits.every((v,i)=>v===expected[i]);};
Deno.serve(async(req)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
 if(req.method!=="POST")return reply({error:"Método não permitido."},405);
 const url=Deno.env.get("SUPABASE_URL"),service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
 if(!url||!service)return reply({error:"Função não configurada."},500);
 let body:any;try{body=await req.json()}catch{return reply({error:"Dados inválidos."},400)}
 const companyCode=String(body.company_code||"").trim().toUpperCase(),username=String(body.username||"").trim().toLowerCase(),pin=String(body.pin||"");
 if(!/^[A-Z0-9]{6,10}$/.test(companyCode)||!/^[a-z0-9._-]{3,30}$/.test(username)||!/^\d{6}$/.test(pin)){console.log("company-login stage=input_validation");return reply({error:"Informe o código da empresa, usuário e PIN de 6 números."},400);}
 const admin=createClient(url,service,{auth:{persistSession:false}});
 const {data:company,error:companyErr}=await admin.from("companies").select("id,status").eq("login_code",companyCode).maybeSingle();
 if(companyErr||!company||company.status!=="active"){console.log("company-login stage=company_lookup",JSON.stringify({dbError:!!companyErr,found:!!company,status:company?.status||null}));return reply({error:"Empresa não encontrada ou inativa."},401);}
 const cutoff=new Date(Date.now()-15*60*1000).toISOString();
 const {count}=await admin.from("employee_login_attempts").select("id",{count:"exact",head:true}).eq("company_id",company.id).ilike("username",username).gte("attempted_at",cutoff);
 if((count||0)>=10){console.log("company-login stage=rate_limit");return reply({error:"Muitas tentativas. Aguarde 15 minutos e tente novamente."},429);}
 await admin.from("employee_login_attempts").insert({company_id:company.id,username});
 const {data:employee,error:employeeErr}=await admin.from("employees").select("user_id,pin_hash,is_active").eq("company_id",company.id).ilike("username",username).maybeSingle();
 if(employeeErr||!employee||!employee.is_active||!employee.pin_hash){console.log("company-login stage=employee_lookup",JSON.stringify({dbError:!!employeeErr,found:!!employee,active:employee?.is_active??null,hasPin:!!employee?.pin_hash}));return reply({error:"Usuário ou PIN inválido."},401);}
 const {data:member}=await admin.from("company_members").select("is_active").eq("company_id",company.id).eq("user_id",employee.user_id).maybeSingle();
 if(!member?.is_active){console.log("company-login stage=membership",JSON.stringify({active:member?.is_active??null}));return reply({error:"Acesso deste funcionário está desativado."},403);}
 if(!await verifyPin(pin,employee.pin_hash)){console.log("company-login stage=pin_verification");return reply({error:"Usuário ou PIN inválido."},401);} console.log("company-login stage=pin_verified");
 await admin.from("employee_login_attempts").delete().eq("company_id",company.id).ilike("username",username);
 const {data:userData,error:userErr}=await admin.auth.admin.getUserById(employee.user_id);
 if(userErr||!userData.user?.email)return reply({error:"Conta de acesso não encontrada. Contate o administrador."},401);
 const {data:link,error:linkErr}=await admin.auth.admin.generateLink({type:"magiclink",email:userData.user.email});
 if(linkErr||!link.properties?.hashed_token)return reply({error:"Não foi possível iniciar a sessão. Tente novamente."},500);
 return reply({token_hash:link.properties.hashed_token,type:"magiclink"});
});