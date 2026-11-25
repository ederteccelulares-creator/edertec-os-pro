import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const cors = { "Access-Control-Allow-Origin":"*", "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods":"POST, OPTIONS" };
const reply=(body:Record<string,unknown>,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json"}});
const esc=(s:string)=>s.replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]||c));
Deno.serve(async req=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
 if(req.method!=="POST")return reply({error:"Método não permitido."},405);
 const authHeader=req.headers.get("Authorization")||"";
 if(!authHeader.startsWith("Bearer "))return reply({error:"Sessão não encontrada."},401);
 const url=Deno.env.get("SUPABASE_URL"),anon=Deno.env.get("SUPABASE_ANON_KEY"),service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),resend=Deno.env.get("RESEND_API_KEY"),from=Deno.env.get("RESEND_FROM_EMAIL");
 if(!url||!anon||!service||!resend||!from)return reply({error:"Configure RESEND_API_KEY e RESEND_FROM_EMAIL nos secrets do Supabase."},503);
 const auth=createClient(url,anon,{global:{headers:{Authorization:authHeader}},auth:{persistSession:false,autoRefreshToken:false}});
 const admin=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:{user},error:authError}=await auth.auth.getUser();
 if(authError||!user?.email||!user.email_confirmed_at)return reply({error:"Confirme seu e-mail antes de solicitar a mensagem."},401);
 let body:any;try{body=await req.json()}catch{return reply({error:"Solicitação inválida."},400)}
 const companyId=String(body.company_id||"");
 if(!/^[0-9a-f-]{36}$/i.test(companyId))return reply({error:"Empresa inválida."},400);
 const {data:member}=await admin.from("company_members").select("role,is_active").eq("company_id",companyId).eq("user_id",user.id).maybeSingle();
 if(!member?.is_active||member.role!=="owner")return reply({error:"Somente o proprietário ativo pode receber os dados iniciais."},403);
 const {data:company,error:companyError}=await admin.from("companies").select("name,login_code").eq("id",companyId).single();
 if(companyError||!company)return reply({error:"Empresa não encontrada."},404);
 const {data:employee}=await admin.from("employees").select("name,username").eq("company_id",companyId).eq("user_id",user.id).maybeSingle();
 const {data:reservation,error:reserveError}=await admin.from("company_welcome_emails").insert({company_id:companyId,user_id:user.id,recipient_email:user.email,status:"sending"}).select("id").single();
 if(reserveError){if(reserveError.code==="23505")return reply({success:true,already_sent:true});return reply({error:"Não foi possível reservar o envio."},500);}
 const appUrl=(Deno.env.get("APP_SITE_URL")||"https://edertecospro.com.br").replace(/\/$/,"");
 const name=esc(company.name||"Sua assistência"),owner=esc(employee?.name||String(user.user_metadata?.full_name||"Olá")),username=esc(employee?.username||user.email.split("@")[0]),code=esc(company.login_code||"");
 const html='<!doctype html><html lang="pt-BR"><body style="margin:0;background:#0b0f16;color:#e8edf5;font-family:Arial,sans-serif;padding:32px 16px"><div style="max-width:600px;margin:auto;background:#121923;border:1px solid #293444;border-radius:18px;padding:32px"><div style="font-size:22px;font-weight:800">EDERTEC <span style="color:#ef4444">OS PRO</span></div><h1>Bem-vindo ao Edertec OS Pro!</h1><p>Olá, '+owner+'! A assistência <strong>'+name+'</strong> foi cadastrada e seu e-mail confirmado.</p><div style="background:#0b111a;border:1px solid #293444;border-radius:12px;padding:20px"><strong>Seus dados de acesso</strong><p>Empresa: <b>'+name+'</b></p><p>Código da empresa: <b>'+code+'</b></p><p>Usuário: <b>'+username+'</b></p><p>E-mail: <b>'+esc(user.email)+'</b></p></div><p>Entre com seu e-mail e a senha que você criou no cadastro. Funcionários usam o código da empresa, usuário e PIN.</p><p style="text-align:center;margin:30px"><a href="'+appUrl+'" style="background:#ef4444;color:white;text-decoration:none;font-weight:bold;padding:14px 24px;border-radius:10px">ACESSAR O EDERTEC OS PRO</a></p><p style="font-size:13px;color:#9aa7b8">Por segurança, nunca enviamos sua senha por e-mail.</p></div></body></html>';
 const mail=await fetch("https://api.resend.com/emails",{method:"POST",headers:{Authorization:"Bearer "+resend,"Content-Type":"application/json"},body:JSON.stringify({from,to:[user.email],subject:"Bem-vindo ao Edertec OS Pro — "+company.name,html})});
 const result=await mail.json().catch(()=>({}));
 if(!mail.ok){await admin.from("company_welcome_emails").delete().eq("id",reservation.id);return reply({error:"Cadastro concluído, mas o provedor não enviou o e-mail.",details:result?.message||"Falha no Resend."},502);}
 await admin.from("company_welcome_emails").update({status:"sent",provider_message_id:result?.id||null,sent_at:new Date().toISOString()}).eq("id",reservation.id);
 return reply({success:true,message:"E-mail de boas-vindas enviado."});
});
