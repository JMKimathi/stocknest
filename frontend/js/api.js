// Escapes text before it is put into the page with innerHTML,
// so names like <img onerror=...> show as text instead of running.
function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Central place for talking to the StockNest API.
// Change API_BASE if your backend runs somewhere other than localhost:5000.
const API_BASE = 'http://localhost:5000/api';

async function apiRequest(path, { method = 'GET', body, auth = true } = {}) {
  const headers = { 'Content-Type': 'application/json' };

  if (auth) {
    const token = localStorage.getItem('sn_token');
    if (token) headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });

  let data = null;
  try { data = await res.json(); } catch (_) { /* no body */ }

  if (res.status === 401) {
    // Token missing/expired - send back to login
    localStorage.removeItem('sn_token');
    localStorage.removeItem('sn_user');
    if (!location.pathname.endsWith('login.html')) {
      window.location.href = 'login.html';
    }
  }

  if (!res.ok) {
    const message = (data && data.message) || 'Something went wrong. Please try again.';
    throw new Error(message);
  }

  return data;
}

const api = {
  get: (path) => apiRequest(path),
  post: (path, body) => apiRequest(path, { method: 'POST', body }),
  put: (path, body) => apiRequest(path, { method: 'PUT', body }),
  del: (path) => apiRequest(path, { method: 'DELETE' })
};
