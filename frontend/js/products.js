const currentUser = initShell('products');
let categories = [];
let suppliers = [];
let productsCache = [];
let pendingImage; // undefined = unchanged, null = remove, data URL = new picture
let importRows = [];

function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

function showAlert(message, type = 'error') {
  const box = document.getElementById('pageAlert');
  box.textContent = message;
  box.className = `alert ${type}`;
  box.style.display = 'block';
  setTimeout(() => { box.style.display = 'none'; }, 5000);
}

function formatMoney(n) {
  return `KSh ${Number(n).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function imageUrl(p) {
  return `/api/products/${p.id}/image?v=${p.image_version}`;
}

function thumb(p) {
  return p.has_image
    ? `<img class="product-thumb" src="${imageUrl(p)}" alt="" loading="lazy">`
    : `<span class="product-thumb placeholder">${esc(p.name.charAt(0).toUpperCase())}</span>`;
}

// ---------- Reference data ----------
async function loadReferenceData() {
  [categories, suppliers] = await Promise.all([api.get('/categories'), api.get('/suppliers')]);
  const catOptions = categories.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
  const supOptions = suppliers.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('');
  document.getElementById('productCategory').innerHTML = '<option value="">None</option>' + catOptions;
  document.getElementById('productSupplier').innerHTML = '<option value="">None</option>' + supOptions;
  document.getElementById('categoryFilter').innerHTML = '<option value="">All categories</option>' + catOptions;
}

// ---------- Table ----------
function renderProducts(products) {
  productsCache = products;
  const body = document.getElementById('productsBody');
  if (!products.length) {
    body.innerHTML = '<tr><td colspan="9" class="empty-state">No products found.</td></tr>';
    return;
  }
  const isAdmin = currentUser.role === 'admin';

  body.innerHTML = products.map(p => {
    const isLow = p.quantity <= p.reorder_level;
    const status = p.is_archived
      ? '<span class="badge neutral">Archived</span>'
      : p.quantity === 0 ? '<span class="badge low">Out of stock</span>'
      : `<span class="badge ${isLow ? 'low' : 'ok'}">${isLow ? 'Low stock' : 'In stock'}</span>`;

    const actions = p.is_archived
      ? `<button class="secondary small" onclick="openHistoryModal(${p.id})">History</button>
         ${isAdmin ? `<button class="small" onclick="restoreProduct(${p.id})">Restore</button>` : ''}`
      : `<button class="secondary small" onclick="openStockModal(${p.id})">Stock</button>
         <button class="secondary small" onclick="openHistoryModal(${p.id})">History</button>
         <button class="secondary small" onclick="editProduct(${p.id})">Edit</button>
         ${isAdmin ? `<button class="danger small" onclick="deleteProduct(${p.id})">Archive</button>` : ''}`;

    return `
      <tr class="${p.is_archived ? 'archived-row' : ''}">
        <td>${thumb(p)}</td>
        <td class="sku">${esc(p.sku)}${p.barcode ? `<div class="muted small-text">${esc(p.barcode)}</div>` : ''}</td>
        <td>${esc(p.name)}</td>
        <td>${esc(p.category_name || '—')}</td>
        <td>${esc(p.supplier_name || '—')}</td>
        <td class="${isLow && !p.is_archived ? 'qty-low' : ''}">${p.quantity}</td>
        <td>${formatMoney(p.unit_price)}</td>
        <td>${status}</td>
        <td class="actions">${actions}</td>
      </tr>`;
  }).join('');
}

function productName(id) {
  const p = productsCache.find(x => x.id === id);
  return p ? p.name : '';
}

async function loadProducts() {
  const params = new URLSearchParams();
  const search = document.getElementById('searchInput').value.trim();
  const category_id = document.getElementById('categoryFilter').value;
  const lowStock = document.getElementById('lowStockFilter').value;
  const archived = document.getElementById('archivedFilter').value;
  if (search) params.set('search', search);
  if (category_id) params.set('category_id', category_id);
  if (lowStock) params.set('lowStock', lowStock);
  if (archived) params.set('archived', archived);

  try {
    renderProducts(await api.get(`/products?${params.toString()}`));
  } catch (err) {
    showAlert(err.message);
  }
}

let searchDebounce;
document.getElementById('searchInput').addEventListener('input', () => {
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(loadProducts, 300);
});
['categoryFilter', 'lowStockFilter', 'archivedFilter'].forEach(id =>
  document.getElementById(id).addEventListener('change', loadProducts));

// ---------- Picture ----------
function resizeImage(file, maxSize = 480) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read the file'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('That file is not a valid image'));
      img.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#fff'; // transparent PNGs get a white background
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function showPreview(src) {
  document.getElementById('imagePreview').innerHTML = src ? `<img src="${esc(src)}" alt="">` : '<span>No picture</span>';
  document.getElementById('removeImageBtn').style.display = src ? 'inline-block' : 'none';
}

document.getElementById('productImageInput').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  if (file.size > 15 * 1024 * 1024) return showAlert('Please choose a picture under 15 MB.');
  try {
    pendingImage = await resizeImage(file);
    showPreview(pendingImage);
  } catch (err) {
    showAlert(err.message);
  }
});
document.getElementById('removeImageBtn').addEventListener('click', () => {
  pendingImage = null;
  showPreview(null);
});

// ---------- Add / edit ----------
function updateMarginHint() {
  const cost = Number(document.getElementById('productCostPrice').value) || 0;
  const price = Number(document.getElementById('productUnitPrice').value) || 0;
  const hint = document.getElementById('marginHint');
  if (cost > 0 && price > 0) {
    const profit = price - cost;
    hint.textContent = `Profit per unit: ${formatMoney(profit)} (${((profit / price) * 100).toFixed(1)}% margin)`;
    hint.classList.toggle('qty-low', profit < 0);
  } else {
    hint.textContent = '';
  }
}
document.getElementById('productCostPrice').addEventListener('input', updateMarginHint);
document.getElementById('productUnitPrice').addEventListener('input', updateMarginHint);

function resetProductForm(title) {
  document.getElementById('productForm').reset();
  document.getElementById('productId').value = '';
  document.getElementById('productModalTitle').textContent = title;
  document.getElementById('productFormError').style.display = 'none';
  pendingImage = undefined;
  showPreview(null);
}

document.getElementById('addProductBtn').addEventListener('click', () => {
  resetProductForm('Add product');
  document.getElementById('productQuantity').disabled = false;
  updateMarginHint();
  openModal('productModal');
});

async function editProduct(id) {
  try {
    const p = await api.get(`/products/${id}`);
    resetProductForm(`Edit ${p.name}`);
    document.getElementById('productId').value = p.id;
    document.getElementById('productName').value = p.name;
    document.getElementById('productSku').value = p.sku;
    document.getElementById('productBarcode').value = p.barcode || '';
    document.getElementById('productDescription').value = p.description || '';
    document.getElementById('productCategory').value = p.category_id || '';
    document.getElementById('productSupplier').value = p.supplier_id || '';
    document.getElementById('productQuantity').value = p.quantity;
    document.getElementById('productQuantity').disabled = true; // stock changes go through the Stock button
    document.getElementById('productReorderLevel').value = p.reorder_level;
    document.getElementById('productCostPrice').value = p.cost_price;
    document.getElementById('productUnitPrice').value = p.unit_price;
    showPreview(p.has_image ? imageUrl(p) : null);
    updateMarginHint();
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
    barcode: document.getElementById('productBarcode').value.trim(),
    description: document.getElementById('productDescription').value.trim(),
    category_id: document.getElementById('productCategory').value || null,
    supplier_id: document.getElementById('productSupplier').value || null,
    reorder_level: Number(document.getElementById('productReorderLevel').value),
    cost_price: Number(document.getElementById('productCostPrice').value),
    unit_price: Number(document.getElementById('productUnitPrice').value)
  };
  if (pendingImage !== undefined) payload.image = pendingImage;

  try {
    if (id) {
      await api.put(`/products/${id}`, payload);
      showAlert('Product updated.', 'success');
    } else {
      payload.quantity = Number(document.getElementById('productQuantity').value);
      await api.post('/products', payload);
      showAlert('Product created.', 'success');
    }
    closeModal('productModal');
    loadProducts();
  } catch (err) {
    errorBox.textContent = err.message;
    errorBox.style.display = 'block';
  }
});

// Stop a barcode scanner's Enter key from submitting the form early
document.getElementById('productBarcode').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') e.preventDefault();
});

async function deleteProduct(id) {
  if (!confirm('Archive this product? It will be hidden but its stock history is kept. (A product with no history is deleted.)')) return;
  try {
    const res = await api.del(`/products/${id}`);
    showAlert(res.message, 'success');
    loadProducts();
  } catch (err) {
    showAlert(err.message);
  }
}

async function restoreProduct(id) {
  try {
    await api.patch(`/products/${id}/restore`);
    showAlert('Product restored.', 'success');
    loadProducts();
  } catch (err) {
    showAlert(err.message);
  }
}

// ---------- Stock ----------
function openStockModal(id) {
  document.getElementById('stockProductId').value = id;
  document.getElementById('stockProductName').textContent = productName(id);
  document.getElementById('stockForm').reset();
  document.getElementById('stockFormError').style.display = 'none';
  openModal('stockModal');
}

document.getElementById('stockForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('stockProductId').value;
  const errorBox = document.getElementById('stockFormError');
  errorBox.style.display = 'none';

  try {
    await api.post(`/products/${id}/stock`, {
      type: document.getElementById('stockType').value,
      quantity: Number(document.getElementById('stockQuantity').value),
      reason: document.getElementById('stockReason').value.trim()
    });
    closeModal('stockModal');
    showAlert('Stock updated.', 'success');
    loadProducts();
    refreshNotificationCount();
  } catch (err) {
    errorBox.textContent = err.message;
    errorBox.style.display = 'block';
  }
});

// ---------- History ----------
async function openHistoryModal(id) {
  document.getElementById('historyProductName').textContent = productName(id);
  const body = document.getElementById('historyBody');
  body.innerHTML = '<tr><td colspan="5" class="empty-state">Loading...</td></tr>';
  openModal('historyModal');

  try {
    const history = await api.get(`/products/${id}/history`);
    body.innerHTML = history.length
      ? history.map(tx => `
          <tr>
            <td><span class="badge ${esc(tx.type)}">${esc(tx.type)}</span></td>
            <td>${tx.quantity}</td>
            <td>${esc(tx.reason || '—')}</td>
            <td>${esc(tx.user_name)}</td>
            <td>${new Date(tx.created_at).toLocaleString()}</td>
          </tr>`).join('')
      : '<tr><td colspan="5" class="empty-state">No transactions yet.</td></tr>';
  } catch (err) {
    body.innerHTML = `<tr><td colspan="5" class="empty-state">${esc(err.message)}</td></tr>`;
  }
}

// ---------- CSV import ----------
const IMPORT_COLUMNS = ['sku', 'name', 'barcode', 'description', 'category', 'supplier',
  'quantity', 'reorder_level', 'unit_price', 'cost_price'];

// Small CSV reader: handles quoted cells, commas/new lines inside quotes and "" escapes
function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', inQuotes = false;
  text = text.replace(/^﻿/, '');
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') inQuotes = false;
      else cell += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(c => c.trim() !== ''));
}

document.getElementById('importBtn').addEventListener('click', () => {
  importRows = [];
  document.getElementById('importFile').value = '';
  document.getElementById('importPreview').innerHTML = '';
  document.getElementById('importResult').innerHTML = '';
  document.getElementById('importError').style.display = 'none';
  document.getElementById('runImportBtn').disabled = true;
  openModal('importModal');
});

document.getElementById('templateLink').addEventListener('click', (e) => {
  e.preventDefault();
  const sample = [
    IMPORT_COLUMNS.join(','),
    'GRO-RICE-2KG,Pishori Rice 2kg,6161100000011,Long grain rice,Groceries,Savanna Wholesale,40,10,390,320',
    'BEV-JUICE-1L,Mango Juice 1L,,,Beverages,Coastal Fresh Ltd,24,6,210,165'
  ].join('\r\n');
  const url = URL.createObjectURL(new Blob(['﻿' + sample], { type: 'text/csv' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'stocknest-products-template.csv';
  a.click();
  URL.revokeObjectURL(url);
});

document.getElementById('importFile').addEventListener('change', async (e) => {
  const errorBox = document.getElementById('importError');
  errorBox.style.display = 'none';
  document.getElementById('importResult').innerHTML = '';
  const file = e.target.files[0];
  if (!file) return;

  const rows = parseCsv(await file.text());
  if (rows.length < 2) {
    errorBox.textContent = 'The file needs a header row and at least one product.';
    errorBox.style.display = 'block';
    return;
  }
  const header = rows[0].map(h => h.trim().toLowerCase().replace(/\s+/g, '_'));
  if (!header.includes('sku') || !header.includes('name')) {
    errorBox.textContent = 'The first row must contain at least "sku" and "name" column headings.';
    errorBox.style.display = 'block';
    return;
  }

  importRows = rows.slice(1).map(r => {
    const obj = {};
    header.forEach((h, i) => { if (IMPORT_COLUMNS.includes(h)) obj[h] = (r[i] || '').trim(); });
    return obj;
  });

  const shown = importRows.slice(0, 5);
  document.getElementById('importPreview').innerHTML = `
    <p><strong>${importRows.length}</strong> product row${importRows.length === 1 ? '' : 's'} found. First ${shown.length}:</p>
    <div class="table-wrap"><table>
      <thead><tr><th>SKU</th><th>Name</th><th>Category</th><th>Qty</th><th>Price</th><th>Cost</th></tr></thead>
      <tbody>${shown.map(r => `
        <tr><td>${esc(r.sku)}</td><td>${esc(r.name)}</td><td>${esc(r.category || '—')}</td>
        <td>${esc(r.quantity || '0')}</td><td>${esc(r.unit_price || '0')}</td><td>${esc(r.cost_price || '0')}</td></tr>`).join('')}
      </tbody>
    </table></div>`;
  document.getElementById('runImportBtn').disabled = false;
});

document.getElementById('runImportBtn').addEventListener('click', async () => {
  const btn = document.getElementById('runImportBtn');
  btn.disabled = true;
  btn.textContent = 'Importing...';
  try {
    const r = await api.post('/products/import', {
      rows: importRows,
      update_existing: document.getElementById('importUpdate').checked
    });
    document.getElementById('importPreview').innerHTML = '';
    document.getElementById('importResult').innerHTML = `
      <div class="alert success" style="display:block">
        ${r.created} created · ${r.updated} updated · ${r.skipped} skipped (SKU already exists) · ${r.errors.length} failed
      </div>
      ${r.errors.length ? `<ul class="import-errors">${r.errors.slice(0, 50).map(er =>
        `<li>Line ${er.line}: ${esc(er.message)}</li>`).join('')}</ul>` : ''}`;
    importRows = [];
    await loadReferenceData();
    loadProducts();
  } catch (err) {
    const box = document.getElementById('importError');
    box.textContent = err.message;
    box.style.display = 'block';
    btn.disabled = false;
  } finally {
    btn.textContent = 'Import';
  }
});

// ---------- Init ----------
(async function init() {
  // Links such as products.html?lowStock=true (from notifications) pre-set the filter
  const params = new URLSearchParams(location.search);
  if (params.get('lowStock') === 'true') document.getElementById('lowStockFilter').value = 'true';
  if (params.get('search')) document.getElementById('searchInput').value = params.get('search');
  try {
    await loadReferenceData();
  } catch (err) {
    showAlert(err.message);
  }
  loadProducts();
})();
