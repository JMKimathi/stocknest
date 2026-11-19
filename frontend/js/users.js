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

async function loadUsers() {
  try {
    usersCache = await api.get('/users');
    const body = document.getElementById('tableBody');
    body.innerHTML = usersCache.map(u => `
      <tr>
        <td>${u.name}</td>
        <td>${u.email}</td>
        <td><span class="badge ${u.role === 'admin' ? 'ok' : 'neutral'}">${u.role}</span></td>
        <td><span class="badge ${u.is_active ? 'ok' : 'low'}">${u.is_active ? 'Active' : 'Disabled'}</span></td>
        <td class="actions">
          <button class="secondary small" onclick="editItem(${u.id})">Edit</button>
          ${u.id !== currentUser.id ? `<button class="danger small" onclick="deleteItem(${u.id})">Delete</button>` : ''}
        </td>
      </tr>
    `).join('');
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
      if (password.length < 6) {
        errorBox.textContent = 'Password must be at least 6 characters.';
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
  if (!confirm('Delete this user account permanently?')) return;
  try {
    await api.del(`/users/${id}`);
    showAlert('User deleted.', 'success');
    loadUsers();
  } catch (err) {
    showAlert(err.message);
  }
}

loadUsers();
