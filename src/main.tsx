import React from 'react';
import ReactDOM from 'react-dom/client';
import CompanyAuthGate from './components/CompanyAuthGate';
import CustomerOrderTracking from './components/CustomerOrderTracking';
import CustomerPortal from './components/CustomerPortal';
import EpartsPublicCatalog from './components/EpartsPublicCatalog';
import EpartsSupplierPortal from './components/EpartsSupplierPortal';
import PWAInstallPrompt from './components/PWAInstallPrompt';
import PWAUpdatePrompt from './components/PWAUpdatePrompt';
import './styles.css';
import './components/CompanyAuthLogin.css';

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { updateViaCache: 'none' }).then(registration => registration.update()).catch(error => {
      console.error('Não foi possível registrar o modo instalável:', error);
    });
  });
}

const params = new URLSearchParams(window.location.search);
const trackingToken = params.get('acompanhar');
const customerPortalToken = params.get('area-cliente');
const path = window.location.pathname.replace(/\\/+$/, '') || '/';
const epartsCatalog = params.get('catalogo') === 'eparts' || path === '/eparts/catalogo';
const epartsSupplierPortal = params.get('portal') === 'fornecedor' || path === '/eparts/fornecedor';
const epartsWorkspace = path === '/eparts';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <PWAInstallPrompt />
    <PWAUpdatePrompt />
    {epartsSupplierPortal ? <EpartsSupplierPortal /> : epartsCatalog ? <EpartsPublicCatalog /> : customerPortalToken ? <CustomerPortal token={customerPortalToken} /> : trackingToken ? <CustomerOrderTracking token={trackingToken} /> : epartsWorkspace ? <CompanyAuthGate /> : <CompanyAuthGate />}
  </React.StrictMode>
);
