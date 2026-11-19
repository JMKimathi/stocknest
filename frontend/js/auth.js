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

  const chip = document.getElementById('userChip');
  if (chip) {
    chip.innerHTML = `${user.name} <span class="role-badge">(${user.role})</span>`;
  }

  const navLink = document.querySelector(`.sidebar nav a[data-page="${activePage}"]`);
  if (navLink) navLink.classList.add('active');

  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) logoutBtn.addEventListener('click', logout);

  return user;
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
