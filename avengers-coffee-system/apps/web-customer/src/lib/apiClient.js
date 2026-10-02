import axios from 'axios';
import { isGuestSessionId } from './guestSession';

export const apiClient = axios.create({
  baseURL: `http://${window.location.hostname}:3000`,
  timeout: 60000,
});

apiClient.interceptors.request.use((config) => {
  if (isGuestSessionId(config.guestSessionId)) {
    config.headers = config.headers || {};
    delete config.headers.Authorization;
    config.headers['X-Guest-Session-Id'] = config.guestSessionId;
    return config;
  }
  const token = window.localStorage.getItem('token');
  if (token) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Auto-logout khi token hết hạn (401)
apiClient.interceptors.response.use(
  (response) => response,
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
