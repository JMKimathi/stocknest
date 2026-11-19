const currentUser = initShell('products');
let categories = [];
let suppliers = [];

function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

function showAlert(message, type = 'error') {
  const box = document.getElementById('pageAlert');
  box.textContent = message;
  box.className = `alert ${type}`;
  box.style.display = 'block';
  setTimeout(() => { box.style.display = 'none'; }, 4000);
}

function formatMoney(n) {
  return `KSh ${Number(n).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ---------- Load reference data (categories/suppliers) into selects ----------
async function loadReferenceData() {
  [categories, suppliers] = await Promise.all([
    api.get('/categories'),
    api.get('/suppliers')
  ]);

  const catOptions = categories.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
  const supOptions = suppliers.map(s => `<option value="${s.id}">${s.name}</option>`).join('');

  document.getElementById('productCategory').innerHTML = '<option value="">None</option>' + catOptions;
  document.getElementById('productSupplier').innerHTML = '<option value="">None</option>' + supOptions;
  document.getElementById('categoryFilter').innerHTML = '<option value="">All categories</option>' + catOptions;
}

// ---------- Render products table ----------
function renderProducts(products) {
  const body = document.getElementById('productsBody');
  if (!products.length) {
    body.innerHTML = '<tr><td colspan="8" class="empty-state">No products found.</td></tr>';
    return;
  }

  body.innerHTML = products.map(p => {
    const isLow = p.quantity <= p.reorder_level;
    const deleteBtn = currentUser.role === 'admin'
      ? `<button class="danger small" onclick="deleteProduct(${p.id})">Delete</button>`
      : '';
    return `
      <tr>
        <td class="sku">${p.sku}</td>
        <td>${p.name}</td>
        <td>${p.category_name || '—'}</td>
        <td>${p.supplier_name || '—'}</td>
        <td class="${isLow ? 'qty-low' : ''}">${p.quantity}</td>
        <td>${formatMoney(p.unit_price)}</td>
        <td><span class="badge ${isLow ? 'low' : 'ok'}">${isLow ? 'Low stock' : 'In stock'}</span></td>
        <td class="actions">
          <button class="secondary small" onclick="openStockModal(${p.id}, '${escapeQuotes(p.name)}')">Stock</button>
          <button class="secondary small" onclick="openHistoryModal(${p.id}, '${escapeQuotes(p.name)}')">History</button>
          <button class="secondary small" onclick="editProduct(${p.id})">Edit</button>
          ${deleteBtn}
        </td>
      </tr>
    `;
  }).join('');
}

function escapeQuotes(str) {
  return String(str).replace(/'/g, "\\'");
}

// ---------- Fetch products with current filters ----------
async function loadProducts() {
  const search = document.getElementById('searchInput').value.trim();
  const category_id = document.getElementById('categoryFilter').value;
  const lowStock = document.getElementById('lowStockFilter').value;

  const params = new URLSearchParams();
  if (search) params.set('search', search);
  if (category_id) params.set('category_id', category_id);
  if (lowStock) params.set('lowStock', lowStock);

  try {
    const products = await api.get(`/products?${params.toString()}`);
    renderProducts(products);
  } catch (err) {
    showAlert(err.message);
  }
}

let searchDebounce;
document.getElementById('searchInput').addEventListener('input', () => {
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(loadProducts, 300);
});
document.getElementById('categoryFilter').addEventListener('change', loadProducts);
document.getElementById('lowStockFilter').addEventListener('change', loadProducts);

// ---------- Add / Edit product ----------
document.getElementById('addProductBtn').addEventListener('click', () => {
  document.getElementById('productForm').reset();
  document.getElementById('productId').value = '';
  document.getElementById('productModalTitle').textContent = 'Add Product';
  document.getElementById('productFormError').style.display = 'none';
  document.getElementById('productQuantity').disabled = false;
  openModal('productModal');
});

async function editProduct(id) {
  try {
    const p = await api.get(`/products/${id}`);
    document.getElementById('productModalTitle').textContent = 'Edit Product';
    document.getElementById('productId').value = p.id;
    document.getElementById('productName').value = p.name;
    document.getElementById('productSku').value = p.sku;
    document.getElementById('productDescription').value = p.description || '';
    document.getElementById('productCategory').value = p.category_id || '';
    document.getElementById('productSupplier').value = p.supplier_id || '';
    document.getElementById('productQuantity').value = p.quantity;
    document.getElementById('productQuantity').disabled = true; // edit stock via Stock modal instead
    document.getElementById('productReorderLevel').value = p.reorder_level;
    document.getElementById('productUnitPrice').value = p.unit_price;
    document.getElementById('productFormError').style.display = 'none';
    openModal('productModal');
  } catch (err) {
    showAlert(err.message);
  }
}

document.getElementById('productForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('productId').value;
  const errorBox = document.getElementById('productFormError');
  errorBox.style.display = 'none';

  const payload = {
    name: document.getElementById('productName').value.trim(),
    sku: document.getElementById('productSku').value.trim(),
    description: document.getElementById('productDescription').value.trim(),
    category_id: document.getElementById('productCategory').value || null,
    supplier_id: document.getElementById('productSupplier').value || null,
    reorder_level: Number(document.getElementById('productReorderLevel').value),
    unit_price: Number(document.getElementById('productUnitPrice').value)
  };

  try {
    if (id) {
      await api.put(`/products/${id}`, payload);
      showAlert('Product updated successfully.', 'success');
    } else {
      payload.quantity = Number(document.getElementById('productQuantity').value);
      await api.post('/products', payload);
      showAlert('Product created successfully.', 'success');
    }
    closeModal('productModal');
    loadProducts();
  } catch (err) {
    errorBox.textContent = err.message;
    errorBox.style.display = 'block';
  }
});

async function deleteProduct(id) {
  if (!confirm('Delete this product permanently? This cannot be undone.')) return;
  try {
    await api.del(`/products/${id}`);
    showAlert('Product deleted.', 'success');
    loadProducts();
  } catch (err) {
    showAlert(err.message);
  }
}

// ---------- Stock adjustment ----------
function openStockModal(id, name) {
  document.getElementById('stockProductId').value = id;
  document.getElementById('stockProductName').textContent = name;
  document.getElementById('stockForm').reset();
  document.getElementById('stockFormError').style.display = 'none';
  openModal('stockModal');
}

document.getElementById('stockForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('stockProductId').value;
  const errorBox = document.getElementById('stockFormError');
  errorBox.style.display = 'none';

  const payload = {
    type: document.getElementById('stockType').value,
    quantity: Number(document.getElementById('stockQuantity').value),
    reason: document.getElementById('stockReason').value.trim()
  };

  try {
    await api.post(`/products/${id}/stock`, payload);
    closeModal('stockModal');
    showAlert('Stock updated successfully.', 'success');
    loadProducts();
  } catch (err) {
    errorBox.textContent = err.message;
    errorBox.style.display = 'block';
  }
});

// ---------- History ----------
async function openHistoryModal(id, name) {
  document.getElementById('historyProductName').textContent = name;
  const body = document.getElementById('historyBody');
  body.innerHTML = '<tr><td colspan="5" class="empty-state">Loading...</td></tr>';
  openModal('historyModal');

  try {
    const history = await api.get(`/products/${id}/history`);
    if (!history.length) {
      body.innerHTML = '<tr><td colspan="5" class="empty-state">No transactions yet.</td></tr>';
      return;
    }
    body.innerHTML = history.map(tx => `
      <tr>
        <td><span class="badge ${tx.type}">${tx.type}</span></td>
        <td>${tx.quantity}</td>
        <td>${tx.reason || '—'}</td>
        <td>${tx.user_name}</td>
        <td>${new Date(tx.created_at).toLocaleString()}</td>
      </tr>
    `).join('');
  } catch (err) {
    body.innerHTML = `<tr><td colspan="5" class="empty-state">${err.message}</td></tr>`;
  }
}

// ---------- Init ----------
(async function init() {
  try {
    await loadReferenceData();
    await loadProducts();
  } catch (err) {
    showAlert(err.message);
  }
})();
