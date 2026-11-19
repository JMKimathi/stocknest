// Shared by every signed-in page. Include api.js before this file.
// Builds the sidebar, mobile menu, theme switch and notifications bell.

// ---------- Icons (simple line icons, drawn with currentColor) ----------
const ICONS = {
  logo: '<path d="M12 3 3 7.5l9 4.5 9-4.5L12 3z"/><path d="M3 12l9 4.5 9-4.5"/><path d="M3 16.5 12 21l9-4.5"/>',
  dashboard: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
  products: '<path d="M21 8 12 3 3 8l9 5 9-5z"/><path d="M3 8v8l9 5 9-5V8"/><path d="M12 13v8"/>',
  sales: '<circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/><path d="M2.5 3.5h2.3l2.5 11.6a1 1 0 0 0 1 .8h9.3a1 1 0 0 0 1-.8L20.8 7H5.7"/>',
  orders: '<path d="M2.5 6.5h11v10h-11z"/><path d="M13.5 10h4.2l3.3 3.3v3.2h-7.5"/><circle cx="6.5" cy="18" r="1.8"/><circle cx="17" cy="18" r="1.8"/>',
  reports: '<path d="M4 20V11"/><path d="M10 20V4"/><path d="M16 20v-6"/><path d="M21 20H3"/>',
  categories: '<path d="M3 11.5V4a1 1 0 0 1 1-1h7.5L21 12.5 12.5 21 3 11.5z"/><circle cx="7.5" cy="7.5" r="1.4"/>',
  suppliers: '<path d="M4 21V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v16"/><path d="M15 9h4a1 1 0 0 1 1 1v11"/><path d="M8 8h3M8 12h3M8 16h3"/><path d="M2 21h20"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20.5a6.5 6.5 0 0 1 13 0"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8"/><path d="M21.5 20.5a6.5 6.5 0 0 0-3.8-5.9"/>',
  activity: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
  profile: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  logout: '<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3"/><path d="M10 17l5-5-5-5"/><path d="M15 12H3"/>',
  moon: '<path d="M20.5 13.5A8.5 8.5 0 1 1 10.5 3.5a6.6 6.6 0 0 0 10 10z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  bell: '<path d="M18 8.5a6 6 0 0 0-12 0c0 6.5-2.5 8.5-2.5 8.5h17S18 15 18 8.5z"/><path d="M13.7 20.5a2 2 0 0 1-3.4 0"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  alert: '<path d="M12 3 2 20h20L12 3z"/><path d="M12 10v4M12 17.5v.01"/>',
  cash: '<rect x="2.5" y="6" width="19" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 9.5v.01M18 14.5v.01"/>',
  plus: '<path d="M12 5v14M5 12h14"/>'
};

function icon(name, cls = 'icon') {
  return `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ''}</svg>`;
}

// ---------- Navigation (one place for every page's sidebar) ----------
const NAV = [
  { label: 'Overview', items: [
    { page: 'dashboard', href: 'dashboard.html', text: 'Dashboard', icon: 'dashboard' },
    { page: 'reports', href: 'reports.html', text: 'Reports', icon: 'reports', admin: true }
  ] },
  { label: 'Sell & stock', items: [
    { page: 'sales', href: 'sales.html', text: 'Sales', icon: 'sales' },
    { page: 'products', href: 'products.html', text: 'Products', icon: 'products' },
    { page: 'purchase-orders', href: 'purchase-orders.html', text: 'Purchase orders', icon: 'orders' },
    { page: 'categories', href: 'categories.html', text: 'Categories', icon: 'categories' },
    { page: 'suppliers', href: 'suppliers.html', text: 'Suppliers', icon: 'suppliers' }
  ] },
  { label: 'Team', items: [
    { page: 'users', href: 'users.html', text: 'Users', icon: 'users', admin: true },
    { page: 'activity', href: 'activity.html', text: 'Activity log', icon: 'activity', admin: true },
    { page: 'profile', href: 'profile.html', text: 'My profile', icon: 'profile' }
  ] }
];

function getCurrentUser() {
  try {
    const raw = localStorage.getItem('sn_user');
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
}

function requireAuth() {
  const token = localStorage.getItem('sn_token');
  const user = getCurrentUser();
  if (!token || !user) {
    window.location.href = 'login.html';
    return null;
  }
  if (user.must_change_password && !location.pathname.endsWith('change-password.html')) {
    window.location.href = 'change-password.html';
    return null;
  }
  return user;
}

function requireAdmin() {
  const user = requireAuth();
  if (user && user.role !== 'admin') {
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
  return `<span class="avatar initials" style="width:${size}px;height:${size}px;font-size:${Math.round(size * 0.38)}px">${esc(initials)}</span>`;
}

function renderUserChip(user) {
  const chip = document.getElementById('userChip');
  if (!chip) return;
  chip.innerHTML = `<a href="profile.html" class="chip-link" title="My profile">
      ${avatarHtml(user, 30)}
      <span>${esc(user.name)} <span class="role-badge">· ${esc(user.role)}</span></span>
    </a>`;
}

function saveCurrentUser(changes) {
  const user = { ...getCurrentUser(), ...changes };
  localStorage.setItem('sn_user', JSON.stringify(user));
  renderUserChip(user);
  return user;
}

function logout() {
  clearSession();
  window.location.href = 'login.html?signedout=1';
}

// ---------- Theme ----------
function currentTheme() {
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
}

function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  try { localStorage.setItem('sn_theme', theme); } catch (_) { /* ignore */ }
  const btn = document.getElementById('themeToggle');
  if (btn) btn.innerHTML = theme === 'dark' ? `${icon('sun')}<span>Light mode</span>` : `${icon('moon')}<span>Dark mode</span>`;
  document.dispatchEvent(new CustomEvent('themechange', { detail: theme }));
}

// ---------- Shell ----------
function renderSidebar(activePage, user) {
  const sidebar = document.querySelector('.sidebar');
  if (!sidebar) return;
  const isAdmin = user.role === 'admin';

  sidebar.innerHTML = `
    <div class="brand">
      <span class="brand-mark">${icon('logo', '')}</span>
      <span>StockNest<small>Inventory &amp; sales</small></span>
    </div>
    <nav aria-label="Main">
      ${NAV.map(group => {
        const items = group.items.filter(i => !i.admin || isAdmin);
        if (!items.length) return '';
        return `<div class="nav-label">${group.label}</div>` + items.map(i => `
          <a href="${i.href}" data-page="${i.page}" class="${i.page === activePage ? 'active' : ''}"
             ${i.page === activePage ? 'aria-current="page"' : ''}>${icon(i.icon)}<span>${i.text}</span></a>`).join('');
      }).join('')}
    </nav>
    <div class="sidebar-foot">
      <button type="button" id="themeToggle"></button>
      <button type="button" id="sidebarLogout">${icon('logout')}<span>Sign out</span></button>
    </div>`;

  if (!document.querySelector('.sidebar-backdrop')) {
    const backdrop = document.createElement('div');
    backdrop.className = 'sidebar-backdrop';
    backdrop.addEventListener('click', () => document.body.classList.remove('nav-open'));
    sidebar.after(backdrop);
  }

  document.getElementById('themeToggle').addEventListener('click', () => setTheme(currentTheme() === 'dark' ? 'light' : 'dark'));
  document.getElementById('sidebarLogout').addEventListener('click', logout);
  setTheme(currentTheme());
}

function addMenuButton() {
  const header = document.querySelector('.page-header');
  if (!header || header.querySelector('.menu-btn')) return;
  const h1 = header.querySelector('h1');
  // Keep a heading's subtitle with it (e.g. the dashboard greeting + date)
  const title = h1 && h1.parentElement !== header ? h1.parentElement : h1;
  const wrap = document.createElement('div');
  wrap.className = 'title-wrap';
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'menu-btn';
  btn.setAttribute('aria-label', 'Open menu');
  btn.innerHTML = icon('menu');
  btn.addEventListener('click', () => document.body.classList.toggle('nav-open'));
  header.insertBefore(wrap, header.firstChild);
  wrap.appendChild(btn);
  if (title) wrap.appendChild(title);
}

// Call once at the top of every signed-in page's script
function initShell(activePage) {
  const user = requireAuth();
  if (!user) return null;

  document.body.classList.add(`role-${user.role}`);
  renderSidebar(activePage, user);
  addMenuButton();
  renderUserChip(user);
  initBell();

  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) logoutBtn.addEventListener('click', logout);

  return user;
}

// ---------- Notifications bell ----------
function initBell() {
  const bar = document.querySelector('.topbar-actions');
  if (!bar || document.getElementById('bellWrap')) return;
  const wrap = document.createElement('div');
  wrap.className = 'bell-wrap';
  wrap.id = 'bellWrap';
  wrap.innerHTML = `
    <button type="button" class="bell" id="bellBtn" title="Notifications" aria-label="Notifications">${icon('bell')}<span class="bell-count" id="bellCount"></span></button>
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

// ---------- Modals: Esc key and clicking the dark background close them ----------
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  document.querySelectorAll('.modal-overlay.open').forEach((el) => el.classList.remove('open'));
  document.body.classList.remove('nav-open');
});

document.addEventListener('click', (e) => {
  if (e.target.classList.contains('modal-overlay')) e.target.classList.remove('open');
});
