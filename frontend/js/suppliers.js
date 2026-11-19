const currentUser = initShell('suppliers');

function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

function showAlert(message, type = 'error') {
  const box = document.getElementById('pageAlert');
  box.textContent = message;
  box.className = `alert ${type}`;
  box.style.display = 'block';
  setTimeout(() => { box.style.display = 'none'; }, 4000);
}

let suppliersCache = [];

async function loadSuppliers() {
  try {
    suppliersCache = await api.get('/suppliers');
    const body = document.getElementById('tableBody');
    if (!suppliersCache.length) {
      body.innerHTML = '<tr><td colspan="5" class="empty-state">No suppliers yet.</td></tr>';
      return;
    }
    body.innerHTML = suppliersCache.map(s => `
      <tr>
        <td>${esc(s.name)}</td>
        <td>${esc(s.contact_person || '—')}</td>
        <td>${esc(s.phone || '—')}</td>
        <td>${esc(s.email || '—')}</td>
        <td class="actions">
          ${currentUser.role === 'admin' ? `
            <button class="secondary small" onclick="editItem(${s.id})">Edit</button>
            <button class="danger small" onclick="deleteItem(${s.id})">Delete</button>
          ` : '—'}
        </td>
      </tr>
    `).join('');
  } catch (err) {
    showAlert(err.message);
  }
}

document.getElementById('addBtn')?.addEventListener('click', () => {
  document.getElementById('itemForm').reset();
  document.getElementById('itemId').value = '';
  document.getElementById('modalTitle').textContent = 'Add Supplier';
  document.getElementById('formError').style.display = 'none';
  openModal('itemModal');
});

function editItem(id) {
  const s = suppliersCache.find(x => x.id === id);
  if (!s) return;
  document.getElementById('itemId').value = s.id;
  document.getElementById('itemName').value = s.name;
  document.getElementById('itemContact').value = s.contact_person || '';
  document.getElementById('itemPhone').value = s.phone || '';
  document.getElementById('itemEmail').value = s.email || '';
  document.getElementById('itemAddress').value = s.address || '';
  document.getElementById('modalTitle').textContent = 'Edit Supplier';
  document.getElementById('formError').style.display = 'none';
  openModal('itemModal');
}

document.getElementById('itemForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('itemId').value;
  const errorBox = document.getElementById('formError');
  errorBox.style.display = 'none';

  const payload = {
    name: document.getElementById('itemName').value.trim(),
    contact_person: document.getElementById('itemContact').value.trim(),
    phone: document.getElementById('itemPhone').value.trim(),
    email: document.getElementById('itemEmail').value.trim(),
    address: document.getElementById('itemAddress').value.trim()
  };

  try {
    if (id) await api.put(`/suppliers/${id}`, payload);
    else await api.post('/suppliers', payload);
    closeModal('itemModal');
    showAlert('Supplier saved successfully.', 'success');
    loadSuppliers();
  } catch (err) {
    errorBox.textContent = err.message;
    errorBox.style.display = 'block';
  }
});

async function deleteItem(id) {
  if (!confirm('Delete this supplier? Products using it will be unassigned.')) return;
  try {
    await api.del(`/suppliers/${id}`);
    showAlert('Supplier deleted.', 'success');
    loadSuppliers();
  } catch (err) {
    showAlert(err.message);
  }
}

loadSuppliers();
