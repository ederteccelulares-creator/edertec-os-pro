import {useEffect,useState} from 'react';
import {RefreshCw,X} from 'lucide-react';

export default function PWAUpdatePrompt(){
 const [available,setAvailable]=useState(false);
 const [dismissed,setDismissed]=useState(false);
 useEffect(()=>{
  if(!('serviceWorker' in navigator))return;
  let hadController=Boolean(navigator.serviceWorker.controller);
  let mounted=true;
  const onControllerChange=()=>{
   if(hadController&&mounted)setAvailable(true);
   hadController=true;
  };
  navigator.serviceWorker.addEventListener('controllerchange',onControllerChange);
  const checkForUpdate=async()=>{
   try{
    const registration=await navigator.serviceWorker.getRegistration();
    if(registration)await registration.update();
   }catch(error){console.warn('Não foi possível verificar atualizações:',error)}
  };
  const onVisible=()=>{if(document.visibilityState==='visible')void checkForUpdate()};
  window.addEventListener('focus',onVisible);
  document.addEventListener('visibilitychange',onVisible);
  void checkForUpdate();
  return()=>{
   mounted=false;
   navigator.serviceWorker.removeEventListener('controllerchange',onControllerChange);
   window.removeEventListener('focus',onVisible);
   document.removeEventListener('visibilitychange',onVisible);
  };
 },[]);
 if(!available||dismissed)return null;
 return <aside className="pwa-update-prompt" role="status" aria-live="polite">
  <div><b>Nova versão disponível</b><span>Atualize para carregar as melhorias do Edertec OS Pro.</span></div>
  <button type="button" onClick={()=>window.location.reload()}><RefreshCw size={16}/> Atualizar agora</button>
  <button type="button" className="pwa-update-dismiss" aria-label="Fechar aviso" onClick={()=>setDismissed(true)}><X size={16}/></button>
 </aside>;
}
