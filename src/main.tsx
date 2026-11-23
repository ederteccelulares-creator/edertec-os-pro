import React from 'react';
import ReactDOM from 'react-dom/client';
import CompanyAuthGate from './components/CompanyAuthGate';
import CustomerOrderTracking from './components/CustomerOrderTracking';
import CustomerPortal from './components/CustomerPortal';
import PWAInstallPrompt from './components/PWAInstallPrompt';
import './styles.css';

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(error => {
      console.error('Não foi possível registrar o modo instalável:', error);
    });
  });
}

const params = new URLSearchParams(window.location.search);
const trackingToken = params.get('acompanhar');
const customerPortalToken = params.get('area-cliente');

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <PWAInstallPrompt />
    {customerPortalToken ? <CustomerPortal token={customerPortalToken} /> : trackingToken ? <CustomerOrderTracking token={trackingToken} /> : <CompanyAuthGate />}
  </React.StrictMode>
);
