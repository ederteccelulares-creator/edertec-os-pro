import React from 'react';
import ReactDOM from 'react-dom/client';
import CompanyAuthGate from './components/CompanyAuthGate';
import CustomerOrderTracking from './components/CustomerOrderTracking';
import CustomerPortal from './components/CustomerPortal';
import './styles.css';

const params = new URLSearchParams(window.location.search);
const trackingToken = params.get('acompanhar');
const customerPortalToken = params.get('area-cliente');

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {customerPortalToken ? <CustomerPortal token={customerPortalToken} /> : trackingToken ? <CustomerOrderTracking token={trackingToken} /> : <CompanyAuthGate />}
  </React.StrictMode>
);
