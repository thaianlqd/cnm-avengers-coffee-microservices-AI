import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { getAccountIdentity, shouldExpireSession } from './utils/authSession.mjs';

const nativeFetch=window.fetch.bind(window);
window.fetch=async(input,options)=>{
  const url=typeof input==='string'?input:input instanceof Request?input.url:String(input);
  const identity=getAccountIdentity();
  const response=await nativeFetch(input,options);
  if(url.startsWith('/api/')&&!url.startsWith('/api/auth/')&&identity!==getAccountIdentity()) {
    throw new DOMException('Account changed','AbortError');
  }
  if(shouldExpireSession(response,url))window.dispatchEvent(new Event('analytics-auth-expired'));
  return response;
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
