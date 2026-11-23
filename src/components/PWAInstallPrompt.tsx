import { useEffect, useState } from 'react';
import { Download, X, Share } from 'lucide-react';

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };

export default function PWAInstallPrompt() {
  const [installEvent, setInstallEvent] = useState<InstallEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [ios, setIos] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  useEffect(() => {
    const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
    setIos(isIos);
    if (standalone) return;
    const dismissed = sessionStorage.getItem('edertec-install-dismissed');
    if (dismissed) return;
    const handler = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as InstallEvent);
      setVisible(true);
    };
    window.addEventListener('beforeinstallprompt', handler);
    if (isIos) setVisible(true);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  if (!visible) return null;
  const close = () => {
    setVisible(false);
    sessionStorage.setItem('edertec-install-dismissed', '1');
  };
  const install = async () => {
    if (!installEvent) { setHelpOpen(true); return; }
    await installEvent.prompt();
    const choice = await installEvent.userChoice;
    if (choice.outcome === 'accepted') setVisible(false);
    setInstallEvent(null);
  };

  return <aside className="pwa-install-card" role="dialog" aria-label="Instalar Edertec OS Pro">
    <div className="pwa-install-icon"><Download size={21}/></div>
    <div className="pwa-install-copy"><b>Instale o Edertec OS Pro</b><span>Adicione à tela inicial ou à área de trabalho para acessar como aplicativo.</span>
      {helpOpen && <small>{ios ? 'No Safari, toque em Compartilhar e depois em “Adicionar à Tela de Início”.' : 'No navegador, abra o menu ⋮ e escolha “Instalar aplicativo” ou “Adicionar à tela inicial”.'}</small>}
    </div>
    <button className="pwa-install-action" onClick={() => void install()}>{ios ? <Share size={17}/> : <Download size={17}/>}<span>{ios ? 'Como instalar' : 'Instalar'}</span></button>
    <button className="pwa-install-close" onClick={close} aria-label="Fechar"><X size={17}/></button>
  </aside>;
}
