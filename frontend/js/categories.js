const currentUser = initShell('categories');

function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

function showAlert(message, type = 'error') {
  const box = document.getElementById('pageAlert');
  box.textContent = message;
  box.className = `alert ${type}`;
  box.style.display = 'block';
  setTimeout(() => { box.style.display = 'none'; }, 4000);
}

let categoriesCache = [];

async function loadCategories() {
  try {
    const categories = await api.get('/categories');
    categoriesCache = categories;
    const body = document.getElementById('tableBody');
    if (!categories.length) {
      body.innerHTML = '<tr><td colspan="3" class="empty-state">No categories yet.</td></tr>';
      return;
    }
    body.innerHTML = categories.map(c => `
      <tr>
        <td>${esc(c.name)}</td>
        <td>${esc(c.description || '—')}</td>
        <td class="actions">
          ${currentUser.role === 'admin' ? `
            <button class="secondary small" onclick="editItem(${c.id})">Edit</button>
            <button class="danger small" onclick="deleteItem(${c.id})">Delete</button>
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
  document.getElementById('modalTitle').textContent = 'Add Category';
  document.getElementById('formError').style.display = 'none';
  openModal('itemModal');
});

function editItem(id) {
  const c = categoriesCache.find(x => x.id === id);
  if (!c) return;
  document.getElementById('itemId').value = c.id;
  document.getElementById('itemName').value = c.name;
  document.getElementById('itemDescription').value = c.description || '';
  document.getElementById('modalTitle').textContent = 'Edit Category';
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
    description: document.getElementById('itemDescription').value.trim()
  };

  try {
    if (id) await api.put(`/categories/${id}`, payload);
    else await api.post('/categories', payload);
    closeModal('itemModal');
    showAlert('Category saved successfully.', 'success');
    loadCategories();
  } catch (err) {
    errorBox.textContent = err.message;
    errorBox.style.display = 'block';
  }
});

async function deleteItem(id) {
  if (!confirm('Delete this category? Products using it will be unassigned.')) return;
  try {
    await api.del(`/categories/${id}`);
    showAlert('Category deleted.', 'success');
    loadCategories();
  } catch (err) {
    showAlert(err.message);
  }
}

loadCategories();
