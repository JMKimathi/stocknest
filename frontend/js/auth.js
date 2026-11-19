// Shared across every protected page. Include api.js before this file.

function getCurrentUser() {
  const raw = localStorage.getItem('sn_user');
  return raw ? JSON.parse(raw) : null;
}

function requireAuth() {
  const token = localStorage.getItem('sn_token');
  const user = getCurrentUser();
  if (!token || !user) {
    window.location.href = 'login.html';
    return null;
  }
  return user;
}

function requireAdmin() {
  const user = requireAuth();
  if (user && user.role !== 'admin') {
    alert('This page is available to admins only.');
    window.location.href = 'dashboard.html';
    return null;
  }
  return user;
}

// Small round photo, or the person's initials when there is no photo
function avatarHtml(user, size = 32) {
  if (user && user.avatar) {
    return `<img class="avatar" src="${esc(user.avatar)}" alt="" style="width:${size}px;height:${size}px">`;
  }
  const initials = String((user && user.name) || '?')
    .split(' ').filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('');
  return `<span class="avatar initials" style="width:${size}px;height:${size}px;font-size:${Math.round(size * 0.4)}px">${esc(initials)}</span>`;
}

function renderUserChip(user) {
  const chip = document.getElementById('userChip');
  if (!chip) return;
  chip.innerHTML = `<a href="profile.html" class="chip-link" title="My profile">
      ${avatarHtml(user, 28)}
      <span>${esc(user.name)} <span class="role-badge">(${esc(user.role)})</span></span>
    </a>`;
}

function saveCurrentUser(changes) {
  const user = { ...getCurrentUser(), ...changes };
  localStorage.setItem('sn_user', JSON.stringify(user));
  renderUserChip(user);
  return user;
}

function logout() {
  localStorage.removeItem('sn_token');
  localStorage.removeItem('sn_user');
  window.location.href = 'login.html';
}

// Fills the top-right user chip and reveals admin-only sidebar links.
function initShell(activePage) {
  const user = requireAuth();
  if (!user) return null;

  document.body.classList.add(`role-${user.role}`);

  renderUserChip(user);
  initBell();

  const navLink = document.querySelector(`.sidebar nav a[data-page="${activePage}"]`);
  if (navLink) navLink.classList.add('active');

  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) logoutBtn.addEventListener('click', logout);

  return user;
}

// ---------- Notifications bell ----------
const BELL_ICON = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M12 22a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 12 22Zm7-6V11a7 7 0 0 0-5.5-6.84V3.5a1.5 1.5 0 0 0-3 0v.66A7 7 0 0 0 5 11v5l-2 2v1h18v-1l-2-2Z"/></svg>';

function initBell() {
  const bar = document.querySelector('.topbar-actions');
  if (!bar || document.getElementById('bellWrap')) return;
  const wrap = document.createElement('div');
  wrap.className = 'bell-wrap';
  wrap.id = 'bellWrap';
  wrap.innerHTML = `
    <button type="button" class="bell" id="bellBtn" title="Notifications">${BELL_ICON}<span class="bell-count" id="bellCount"></span></button>
    <div class="bell-panel" id="bellPanel">
      <div class="bell-head">
        <strong>Notifications</strong>
        <button type="button" class="link-btn" id="bellReadAll">Mark all read</button>
      </div>
      <div class="bell-list" id="bellList"><div class="bell-empty">Loading...</div></div>
      <div class="bell-foot"><button type="button" class="link-btn" id="bellClear">Clear read notifications</button></div>
    </div>`;
  bar.prepend(wrap);

  document.getElementById('bellBtn').addEventListener('click', (e) => {
    e.stopPropagation();
    const panel = document.getElementById('bellPanel');
    panel.classList.toggle('open');
    if (panel.classList.contains('open')) loadNotifications();
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#bellWrap')) document.getElementById('bellPanel').classList.remove('open');
  });
  document.getElementById('bellReadAll').addEventListener('click', async () => {
    await api.post('/notifications/read-all');
    loadNotifications();
  });
  document.getElementById('bellClear').addEventListener('click', async () => {
    await api.del('/notifications/read');
    loadNotifications();
  });
  document.getElementById('bellList').addEventListener('click', async (e) => {
    const item = e.target.closest('.bell-item');
    if (!item) return;
    if (item.dataset.unread === '1') {
      try { await api.patch(`/notifications/${item.dataset.id}/read`); } catch (_) { /* ignore */ }
    }
    if (item.dataset.link) window.location.href = item.dataset.link;
    else loadNotifications();
  });

  refreshNotificationCount();
  setInterval(refreshNotificationCount, 60 * 1000);
}

function setBellCount(n) {
  const el = document.getElementById('bellCount');
  if (!el) return;
  el.textContent = n > 99 ? '99+' : n;
  el.style.display = n > 0 ? 'flex' : 'none';
}

async function refreshNotificationCount() {
  if (!document.getElementById('bellCount')) return;
  try {
    const { unread } = await api.get('/notifications/count');
    setBellCount(unread);
  } catch (_) { /* server unreachable - try again next minute */ }
}

function timeAgo(value) {
  const secs = Math.max(0, (Date.now() - new Date(value).getTime()) / 1000);
  if (secs < 60) return 'just now';
  if (secs < 3600) return `${Math.floor(secs / 60)} min ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)} h ago`;
  if (secs < 7 * 86400) return `${Math.floor(secs / 86400)} d ago`;
  return new Date(value).toLocaleDateString();
}

async function loadNotifications() {
  const list = document.getElementById('bellList');
  try {
    const { rows, unread } = await api.get('/notifications?limit=15');
    setBellCount(unread);
    list.innerHTML = rows.length
      ? rows.map(n => `
          <div class="bell-item ${n.is_read ? '' : 'unread'}" data-id="${n.id}" data-unread="${n.is_read ? 0 : 1}" data-link="${esc(n.link || '')}">
            <span class="bell-dot ${esc(n.type)}"></span>
            <div>
              <div class="bell-title">${esc(n.title)}</div>
              ${n.message ? `<div class="bell-msg">${esc(n.message)}</div>` : ''}
              <div class="bell-time">${timeAgo(n.created_at)}</div>
            </div>
          </div>`).join('')
      : '<div class="bell-empty">You are all caught up.</div>';
  } catch (err) {
    list.innerHTML = `<div class="bell-empty">${esc(err.message)}</div>`;
  }
}

async function handleLogin(event) {
  event.preventDefault();
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  const errorBox = document.getElementById('loginError');
  const btn = document.getElementById('loginBtn');
  errorBox.style.display = 'none';
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Signing in...';
  }

  try {
    const data = await apiRequest('/auth/login', { method: 'POST', body: { email, password }, auth: false });
    localStorage.setItem('sn_token', data.token);
    localStorage.setItem('sn_user', JSON.stringify(data.user));
    window.location.href = 'dashboard.html';
  } catch (err) {
    errorBox.textContent = err.message;
    errorBox.style.display = 'block';
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Sign In';
    }
  }
}

if (location.pathname.endsWith('login.html') && localStorage.getItem('sn_token') && getCurrentUser()) {
  window.location.href = 'dashboard.html';
}

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  document.querySelectorAll('.modal-overlay.open').forEach((el) => el.classList.remove('open'));
});

document.addEventListener('click', (e) => {
  if (e.target.classList.contains('modal-overlay')) {
    e.target.classList.remove('open');
  }
});
