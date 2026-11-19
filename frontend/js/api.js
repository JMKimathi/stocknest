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

// Downloads a file (e.g. a CSV export) from an endpoint that needs the login token
async function apiDownload(path) {
  const token = localStorage.getItem('sn_token');
  const res = await fetch(`${API_BASE}${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!res.ok) {
    let message = 'Download failed';
    try { message = (await res.json()).message || message; } catch (_) { /* not JSON */ }
    throw new Error(message);
  }
  const match = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') || '');
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = match ? match[1] : 'export.csv';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

const api = {
  get: (path) => apiRequest(path),
  post: (path, body) => apiRequest(path, { method: 'POST', body }),
  put: (path, body) => apiRequest(path, { method: 'PUT', body }),
  patch: (path, body) => apiRequest(path, { method: 'PATCH', body }),
  del: (path) => apiRequest(path, { method: 'DELETE' }),
  download: apiDownload
};
