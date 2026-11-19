const currentUser = requireAdmin();
initShell('users');

function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

function showAlert(message, type = 'error') {
  const box = document.getElementById('pageAlert');
  box.textContent = message;
  box.className = `alert ${type}`;
  box.style.display = 'block';
  setTimeout(() => { box.style.display = 'none'; }, 4000);
}

let usersCache = [];
let userFilter = '';

async function loadUsers() {
  try {
    usersCache = await api.get('/users');
    const pending = usersCache.filter(u => !u.is_approved).length;
    document.getElementById('pendingCount').textContent = pending ? `(${pending})` : '';

    const shown = usersCache.filter(u =>
      userFilter === 'pending' ? !u.is_approved
        : userFilter === 'disabled' ? (u.is_approved && !u.is_active)
        : true);
    const body = document.getElementById('tableBody');
    body.innerHTML = shown.length ? shown.map(u => {
      const status = !u.is_approved ? '<span class="badge pending">Waiting for approval</span>'
        : u.is_active ? '<span class="badge ok">Active</span>' : '<span class="badge low">Disabled</span>';
      const self = u.id === currentUser.id;
      const actions = !u.is_approved
        ? `<button class="small" onclick="approveUser(${u.id})">Approve</button>
           <button class="secondary danger small" onclick="rejectUser(${u.id})">Reject</button>`
        : `<button class="secondary small" onclick="editItem(${u.id})">Edit</button>
           ${self ? '' : `<button class="secondary small" onclick="resetPassword(${u.id})">Reset password</button>
           <button class="secondary danger small" onclick="deleteItem(${u.id})">Delete</button>`}`;
      return `
      <tr>
        <td><div class="name-cell">${avatarHtml(u, 32)}<div>${esc(u.name)}${self ? ' <span class="muted small-text">(you)</span>' : ''}
          ${u.must_change_password && u.is_approved ? '<div class="muted small-text">Must choose a new password</div>' : ''}</div></div></td>
        <td>${esc(u.email)}${u.phone ? `<div class="muted small-text">${esc(u.phone)}</div>` : ''}</td>
        <td><span class="badge ${u.role === 'admin' ? 'info' : 'neutral'}">${esc(u.role)}</span></td>
        <td>${status}</td>
        <td class="muted nowrap">${u.last_login_at ? new Date(u.last_login_at).toLocaleString() : 'Never'}</td>
        <td class="actions">${actions}</td>
      </tr>`;
    }).join('') : '<tr><td colspan="6" class="empty-state">No users here.</td></tr>';
  } catch (err) {
    showAlert(err.message);
  }
}

document.getElementById('addBtn').addEventListener('click', () => {
  document.getElementById('itemForm').reset();
  document.getElementById('itemId').value = '';
  document.getElementById('modalTitle').textContent = 'Add User';
  document.getElementById('formError').style.display = 'none';
  document.getElementById('passwordField').style.display = 'block';
  document.getElementById('itemPassword').required = true;
  document.getElementById('statusLabel').style.display = 'none';
  document.getElementById('itemStatus').style.display = 'none';
  openModal('itemModal');
});

function editItem(id) {
  const u = usersCache.find(x => x.id === id);
  if (!u) return;
  document.getElementById('itemId').value = u.id;
  document.getElementById('itemName').value = u.name;
  document.getElementById('itemEmail').value = u.email;
  document.getElementById('itemEmail').disabled = true; // email not editable after creation
  document.getElementById('itemRole').value = u.role;
  document.getElementById('itemStatus').value = u.is_active ? '1' : '0';
  document.getElementById('modalTitle').textContent = 'Edit User';
  document.getElementById('formError').style.display = 'none';
  document.getElementById('passwordField').style.display = 'none';
  document.getElementById('itemPassword').required = false;
  document.getElementById('statusLabel').style.display = 'block';
  document.getElementById('itemStatus').style.display = 'block';
  openModal('itemModal');
}

document.getElementById('itemForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('itemId').value;
  const errorBox = document.getElementById('formError');
  errorBox.style.display = 'none';

  try {
    if (id) {
      await api.put(`/users/${id}`, {
        name: document.getElementById('itemName').value.trim(),
        role: document.getElementById('itemRole').value,
        is_active: Number(document.getElementById('itemStatus').value)
      });
    } else {
      const password = document.getElementById('itemPassword').value;
      if (password.length < 8 || !/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
        errorBox.textContent = 'Password must be at least 8 characters, with letters and numbers.';
        errorBox.style.display = 'block';
        return;
      }
      await api.post('/users', {
        name: document.getElementById('itemName').value.trim(),
        email: document.getElementById('itemEmail').value.trim(),
        password,
        role: document.getElementById('itemRole').value
      });
    }
    document.getElementById('itemEmail').disabled = false;
    closeModal('itemModal');
    showAlert('User saved successfully.', 'success');
    loadUsers();
  } catch (err) {
    errorBox.textContent = err.message;
    errorBox.style.display = 'block';
  }
});

async function deleteItem(id) {
  if (!confirm('Delete this user account permanently? Users with stock history can only be disabled.')) return;
  try {
    await api.del(`/users/${id}`);
    showAlert('User deleted.', 'success');
    loadUsers();
  } catch (err) {
    showAlert(err.message);
  }
}

// ---------- Sign-up requests and password resets ----------
document.querySelectorAll('#userPills .pill').forEach(pill => {
  pill.addEventListener('click', () => {
    document.querySelectorAll('#userPills .pill').forEach(p => p.classList.toggle('active', p === pill));
    userFilter = pill.dataset.filter;
    loadUsers();
  });
});

async function approveUser(id) {
  try {
    const res = await api.post(`/users/${id}/approve`);
    showAlert(res.message, 'success');
    loadUsers();
  } catch (err) {
    showAlert(err.message);
  }
}

async function rejectUser(id) {
  const u = usersCache.find(x => x.id === id);
  if (!confirm(`Reject the account request from ${u ? u.name : 'this person'}? It will be deleted.`)) return;
  try {
    await api.del(`/users/${id}`);
    showAlert('Request rejected.', 'success');
    loadUsers();
  } catch (err) {
    showAlert(err.message);
  }
}

async function resetPassword(id) {
  const u = usersCache.find(x => x.id === id);
  if (!confirm(`Reset the password of ${u ? u.name : 'this user'}? Their current password will stop working.`)) return;
  try {
    const res = await api.post(`/users/${id}/reset-password`);
    document.getElementById('resetName').textContent = res.name;
    document.getElementById('resetEmail').textContent = res.email;
    document.getElementById('resetPassword').textContent = res.temporaryPassword;
    openModal('resetModal');
    loadUsers();
  } catch (err) {
    showAlert(err.message);
  }
}

document.getElementById('copyResetBtn').addEventListener('click', async () => {
  const btn = document.getElementById('copyResetBtn');
  try {
    await navigator.clipboard.writeText(document.getElementById('resetPassword').textContent);
    btn.textContent = 'Copied!';
  } catch (_) {
    btn.textContent = 'Select and copy it';
  }
  setTimeout(() => { btn.textContent = 'Copy'; }, 2000);
});

loadUsers();
