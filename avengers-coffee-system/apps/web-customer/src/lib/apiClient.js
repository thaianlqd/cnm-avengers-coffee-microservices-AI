import axios from 'axios';
import { customerSessionExpired, clearCustomerActivity } from './idleSession';
import { isGuestSessionId } from './guestSession';
import { createPublicReadCache } from './publicReadCache';

export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL || `http://${window.location.hostname}:3000`,
  timeout: 60000,
});

let storage;
try { storage=window.sessionStorage; } catch { /* Private mode can disable storage. */ }
const publicReads=createPublicReadCache({storage});
const get=apiClient.get.bind(apiClient);
apiClient.get=(url,config={})=>publicReads.get(url,config,()=>get(url,config));
export const clearPublicReadCache=()=>publicReads.clear();

apiClient.interceptors.request.use((config) => {
  if (isGuestSessionId(config.guestSessionId)) {
    config.headers = config.headers || {};
    delete config.headers.Authorization;
    config.headers['X-Guest-Session-Id'] = config.guestSessionId;
    return config;
  }
  const token = window.localStorage.getItem('token');
  if (token && customerSessionExpired()) {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    clearCustomerActivity();
    window.dispatchEvent(new CustomEvent('auth:expired'));
    return Promise.reject(new axios.CanceledError('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.'));
  }
  if (token) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Auto-logout khi token hết hạn (401)
apiClient.interceptors.response.use(
  (response) => { if (!['get','head','options'].includes(response.config?.method) && /^\/(menu|users\/branches|branch-reviews)(\/|$)/.test(response.config?.url || '')) publicReads.clear(); return response; },
  (error) => {
    if (error?.response?.status === 401 && !isGuestSessionId(error?.config?.guestSessionId)) {
      // Xóa token + user đã lưu
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      // Dispatch event để App.jsx reset user state
      window.dispatchEvent(new CustomEvent('auth:expired'));
    }
    return Promise.reject(error);
  }
);
