// Logic for the public pages: welcome, sign in, create account, first-run
// setup, forgot password and the forced "choose a new password" page.
// Each page sets <body data-auth-page="..."> to pick its handler.

function $(id) { return document.getElementById(id); }

function showError(message) {
  const box = $('formError');
  if (!box) return;
  box.textContent = message;
  box.className = 'alert error';
  box.style.display = message ? 'block' : 'none';
}

function showInfo(message, type = 'info') {
  const box = $('formError');
  if (!box) return;
  box.textContent = message;
  box.className = `alert ${type}`;
  box.style.display = 'block';
}

function setBusy(button, busy, text) {
  if (!button) return;
  if (busy) {
    button.dataset.label = button.textContent;
    button.textContent = text;
    button.disabled = true;
  } else {
    button.textContent = button.dataset.label || button.textContent;
    button.disabled = false;
  }
}

function startSession(data) {
  localStorage.setItem('sn_token', data.token);
  localStorage.setItem('sn_user', JSON.stringify(data.user));
  window.location.href = data.user.must_change_password ? 'change-password.html' : 'dashboard.html';
}

function alreadySignedIn() {
  return localStorage.getItem('sn_token') && localStorage.getItem('sn_user');
}

// Show / hide buttons on every password box
function wirePasswordToggles() {
  document.querySelectorAll('.password-field').forEach(field => {
    const input = field.querySelector('input');
    const btn = field.querySelector('.toggle-pw');
    if (!input || !btn) return;
    btn.addEventListener('click', () => {
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      btn.textContent = show ? 'Hide' : 'Show';
    });
  });
}

// Simple strength meter: length plus variety of characters
function wireStrengthMeter(inputId) {
  const input = $(inputId);
  const bar = document.querySelector('.strength span');
  const label = document.querySelector('.strength-label');
  if (!input || !bar) return;
  input.addEventListener('input', () => {
    const v = input.value;
    let score = 0;
    if (v.length >= 8) score++;
    if (v.length >= 12) score++;
    if (/[a-z]/.test(v) && /[A-Z]/.test(v)) score++;
    if (/[0-9]/.test(v)) score++;
    if (/[^A-Za-z0-9]/.test(v)) score++;
    const levels = [
      [0, '', 'transparent'], [20, 'Too weak', 'var(--danger)'], [40, 'Weak', 'var(--danger)'],
      [60, 'Okay', 'var(--warning)'], [80, 'Good', 'var(--success)'], [100, 'Strong', 'var(--success)']
    ];
    const [width, text, color] = v ? levels[score] || levels[1] : levels[0];
    bar.style.width = `${Math.max(width, v ? 12 : 0)}%`;
    bar.style.background = color;
    label.textContent = v ? `${text}${v.length < 8 ? ' · at least 8 characters' : ''}` : '';
  });
}

function passwordProblem(password) {
  if (password.length < 8) return 'Password must be at least 8 characters.';
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) return 'Password must contain letters and numbers.';
  return null;
}

async function fetchStatus() {
  try {
    return await api.public('/auth/status');
  } catch (err) {
    showError(err.message);
    return { needsSetup: false, allowSignup: true };
  }
}

// ---------- Welcome page ----------
async function initWelcome() {
  if (alreadySignedIn()) { window.location.href = 'dashboard.html'; return; }
  const status = await fetchStatus();
  if (status.needsSetup) {
    document.querySelectorAll('[data-when="setup"]').forEach(el => { el.style.display = ''; });
    document.querySelectorAll('[data-when="ready"]').forEach(el => { el.style.display = 'none'; });
  }
  if (!status.allowSignup) document.querySelectorAll('[data-when="signup"]').forEach(el => { el.style.display = 'none'; });
}

// ---------- Sign in ----------
async function initLogin() {
  if (alreadySignedIn()) { window.location.href = 'dashboard.html'; return; }

  const params = new URLSearchParams(location.search);
  if (params.get('expired')) showInfo('Your session ended. Please sign in again.');
  if (params.get('signedout')) showInfo('You have signed out.', 'success');
  if (params.get('email')) $('email').value = params.get('email');

  const status = await fetchStatus();
  if (status.needsSetup) { window.location.href = 'setup.html'; return; }
  if (!status.allowSignup) $('signupLink').style.display = 'none';

  $('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    showError('');
    const btn = $('submitBtn');
    setBusy(btn, true, 'Signing in...');
    try {
      const data = await api.public('/auth/login', {
        email: $('email').value.trim(),
        password: $('password').value
      });
      startSession(data);
    } catch (err) {
      showError(err.message);
      setBusy(btn, false);
      $('password').select();
    }
  });
}

// ---------- Create account ----------
async function initRegister() {
  if (alreadySignedIn()) { window.location.href = 'dashboard.html'; return; }
  const status = await fetchStatus();
  if (status.needsSetup) { window.location.href = 'setup.html'; return; }
  if (!status.allowSignup) {
    $('registerForm').style.display = 'none';
    showInfo('Sign-up is turned off for this shop. Ask an admin to create your account.');
    return;
  }
  wireStrengthMeter('password');

  $('registerForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    showError('');
    const password = $('password').value;
    if (password !== $('confirmPassword').value) return showError('The two passwords do not match.');
    const problem = passwordProblem(password);
    if (problem) return showError(problem);

    const btn = $('submitBtn');
    setBusy(btn, true, 'Creating account...');
    try {
      await api.public('/auth/register', {
        name: $('name').value.trim(),
        email: $('email').value.trim(),
        phone: $('phone').value.trim(),
        password
      });
      $('registerForm').style.display = 'none';
      $('pageIntro').style.display = 'none';
      $('doneEmail').textContent = $('email').value.trim();
      $('donePanel').style.display = 'block';
      $('doneSignIn').href = `login.html?email=${encodeURIComponent($('email').value.trim())}`;
    } catch (err) {
      showError(err.message);
      setBusy(btn, false);
    }
  });
}

// ---------- First-run setup ----------
async function initSetup() {
  const status = await fetchStatus();
  if (!status.needsSetup) { window.location.href = 'login.html'; return; }
  wireStrengthMeter('password');

  $('setupForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    showError('');
    const password = $('password').value;
    if (password !== $('confirmPassword').value) return showError('The two passwords do not match.');
    const problem = passwordProblem(password);
    if (problem) return showError(problem);

    const btn = $('submitBtn');
    setBusy(btn, true, 'Setting up...');
    try {
      const data = await api.public('/auth/setup', {
        name: $('name').value.trim(),
        email: $('email').value.trim(),
        password
      });
      startSession(data);
    } catch (err) {
      showError(err.message);
      setBusy(btn, false);
    }
  });
}

// ---------- Forgot password ----------
function initForgot() {
  $('forgotForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    showError('');
    const btn = $('submitBtn');
    setBusy(btn, true, 'Sending...');
    try {
      await api.public('/auth/forgot-password', { email: $('email').value.trim() });
      $('forgotForm').style.display = 'none';
      $('pageIntro').style.display = 'none';
      $('donePanel').style.display = 'block';
    } catch (err) {
      showError(err.message);
      setBusy(btn, false);
    }
  });
}

// ---------- Forced password change ----------
function initChangePassword() {
  if (!localStorage.getItem('sn_token')) { window.location.href = 'login.html'; return; }
  const user = JSON.parse(localStorage.getItem('sn_user') || '{}');
  if (user.name) $('greeting').textContent = `Hi ${user.name.split(' ')[0]},`;
  wireStrengthMeter('newPassword');

  $('changeForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    showError('');
    const newPassword = $('newPassword').value;
    if (newPassword !== $('confirmPassword').value) return showError('The two new passwords do not match.');
    const problem = passwordProblem(newPassword);
    if (problem) return showError(problem);

    const btn = $('submitBtn');
    setBusy(btn, true, 'Saving...');
    try {
      await api.put('/profile/password', { currentPassword: $('currentPassword').value, newPassword });
      localStorage.setItem('sn_user', JSON.stringify({ ...user, must_change_password: false }));
      window.location.href = 'dashboard.html';
    } catch (err) {
      showError(err.message);
      setBusy(btn, false);
    }
  });

  $('signOutLink').addEventListener('click', (e) => {
    e.preventDefault();
    clearSession();
    window.location.href = 'login.html';
  });
}

// ---------- Start ----------
document.addEventListener('DOMContentLoaded', () => {
  wirePasswordToggles();
  const handlers = {
    welcome: initWelcome, login: initLogin, register: initRegister,
    setup: initSetup, forgot: initForgot, 'change-password': initChangePassword
  };
  const handler = handlers[document.body.dataset.authPage];
  if (handler) handler();
});
