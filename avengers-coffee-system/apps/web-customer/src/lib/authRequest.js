import axios from 'axios';

function normalizeBaseUrl(value) {
  return String(value || '').trim().replace(/\/+$/, '');
}

function splitConfiguredUrls(value) {
  return String(value || '')
    .split(/[\n,;]+/)
    .map((item) => normalizeBaseUrl(item))
    .filter(Boolean);
}

function uniqueUrls(urls) {
  return [...new Set(urls)];
}

export function getAuthBaseUrls() {
  const configuredUrls = splitConfiguredUrls(import.meta.env.VITE_AUTH_URLS);
  const apiUrl = normalizeBaseUrl(import.meta.env.VITE_API_URL || 'http://localhost:3000');
  const fallbackUrls = [
    apiUrl,
    'http://localhost:3001',
    'http://localhost:3000',
  ];

  return uniqueUrls([
    ...configuredUrls,
    ...fallbackUrls,
  ].filter(Boolean));
}

function shouldFallback(error) {
  const status = error?.response?.status;

  if (!error?.response) {
    return true;
  }

  return [404, 405, 500, 502, 503, 504].includes(status);
}

export async function postAuthRequest(endpoint, payload, config = {}) {
  const baseUrls = getAuthBaseUrls();
  let lastError = null;

  for (const baseURL of baseUrls) {
    try {
      const client = axios.create({ baseURL });
      const response = await client.post(endpoint, payload, config);
      return response.data;
    } catch (error) {
      lastError = error;
      if (!shouldFallback(error)) {
        throw error;
      }
    }
  }

  throw lastError || new Error(`Khong the goi auth endpoint ${endpoint}`);
}