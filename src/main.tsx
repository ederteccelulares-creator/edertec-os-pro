import React from 'react';
import ReactDOM from 'react-dom/client';
import CompanyAuthGate from './components/CompanyAuthGate';
import CustomerOrderTracking from './components/CustomerOrderTracking';
import './styles.css';

const trackingToken = new URLSearchParams(window.location.search).get('acompanhar');

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {trackingToken ? <CustomerOrderTracking token={trackingToken} /> : <CompanyAuthGate />}
  </React.StrictMode>
);
