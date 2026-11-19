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

// The backend serves these pages itself, so the API is on the same address.
const API_BASE = '/api';

const PUBLIC_PAGES = ['index.html', 'login.html', 'register.html', 'setup.html', 'forgot-password.html'];
function onPublicPage() {
  const page = location.pathname.split('/').pop() || 'index.html';
  return PUBLIC_PAGES.includes(page);
}

function clearSession() {
  localStorage.removeItem('sn_token');
  localStorage.removeItem('sn_user');
}

async function apiRequest(path, { method = 'GET', body, auth = true } = {}) {
  const headers = { 'Content-Type': 'application/json' };

  if (auth) {
    const token = localStorage.getItem('sn_token');
    if (token) headers['Authorization'] = `Bearer ${token}`;
  }

  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined
    });
  } catch (err) {
    throw new Error('Cannot reach the StockNest server. Is it running?');
  }

  let data = null;
  try { data = await res.json(); } catch (_) { /* no body */ }

  // Signed out or session expired: back to sign-in with a friendly note
  if (res.status === 401 && auth && !onPublicPage()) {
    clearSession();
    window.location.href = 'login.html?expired=1';
  }

  // The account must pick a new password before doing anything else
  if (res.status === 403 && data && data.code === 'PASSWORD_CHANGE_REQUIRED'
      && !location.pathname.endsWith('change-password.html')) {
    window.location.href = 'change-password.html';
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
  download: apiDownload,
  public: (path, body) => apiRequest(path, { method: body ? 'POST' : 'GET', body, auth: false })
};
