const currentUser = initShell('purchase-orders');

let suppliers = [];
let products = [];
let currentStatus = '';
let page = 1;
let pages = 1;
let viewing = null; // the order open in the view modal

const STATUS_INFO = {
  draft: ['Draft', 'neutral'],
  ordered: ['Ordered', 'adjustment'],
  partially_received: ['Part received', 'adjustment'],
  received: ['Received', 'ok'],
  cancelled: ['Cancelled', 'low']
};

function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

function showAlert(message, type = 'error') {
  const box = document.getElementById('pageAlert');
  box.textContent = message;
  box.className = `alert ${type}`;
  box.style.display = 'block';
  setTimeout(() => { box.style.display = 'none'; }, 4000);
}

function money(n) {
  return `KSh ${Number(n).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function statusBadge(status) {
  const [label, cls] = STATUS_INFO[status] || [status, 'neutral'];
  return `<span class="badge ${cls}">${esc(label)}</span>`;
}
function dateOnly(v) { return v ? new Date(v).toLocaleDateString() : '—'; }

// ---------- Reference data ----------
async function loadReferenceData() {
  [suppliers, products] = await Promise.all([api.get('/suppliers'), api.get('/products')]);
  const opts = suppliers.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('');
  document.getElementById('poSupplier').innerHTML = '<option value="">Choose a supplier...</option>' + opts;
  document.getElementById('supplierFilter').innerHTML = '<option value="">All suppliers</option>' + opts;
}

// ---------- List ----------
async function loadOrders() {
  const params = new URLSearchParams({ page });
  if (currentStatus) params.set('status', currentStatus);
  const search = document.getElementById('searchInput').value.trim();
  const supplier = document.getElementById('supplierFilter').value;
  if (search) params.set('search', search);
  if (supplier) params.set('supplier_id', supplier);

  const body = document.getElementById('poBody');
  try {
    const data = await api.get(`/purchase-orders?${params.toString()}`);
    pages = data.pages;

    document.querySelectorAll('#statusPills .pill').forEach(p => {
      const span = p.querySelector('span');
      if (span) span.textContent = data.counts[p.dataset.status] ? `(${data.counts[p.dataset.status]})` : '';
    });

    body.innerHTML = data.rows.length
      ? data.rows.map(po => `
          <tr>
            <td class="sku">${esc(po.po_number)}</td>
            <td>${esc(po.supplier_name || '—')}</td>
            <td class="nowrap">${dateOnly(po.created_at)}</td>
            <td class="nowrap">${dateOnly(po.expected_date)}</td>
            <td>${po.units_received} / ${po.units_ordered}</td>
            <td>${money(po.total_cost)}</td>
            <td>${statusBadge(po.status)}</td>
            <td class="actions"><button class="secondary small" onclick="viewOrder(${po.id})">Open</button></td>
          </tr>`).join('')
      : '<tr><td colspan="8" class="empty-state">No purchase orders here yet.</td></tr>';

    document.getElementById('pagerInfo').textContent = `${data.total} order${data.total === 1 ? '' : 's'} · page ${data.page} of ${data.pages}`;
    document.getElementById('prevPage').disabled = page <= 1;
    document.getElementById('nextPage').disabled = page >= pages;
  } catch (err) {
    body.innerHTML = `<tr><td colspan="8" class="empty-state">${esc(err.message)}</td></tr>`;
  }
}

document.querySelectorAll('#statusPills .pill').forEach(pill => {
  pill.addEventListener('click', () => {
    document.querySelectorAll('#statusPills .pill').forEach(p => p.classList.toggle('active', p === pill));
    currentStatus = pill.dataset.status;
    page = 1;
    loadOrders();
  });
});
let searchDebounce;
document.getElementById('searchInput').addEventListener('input', () => {
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(() => { page = 1; loadOrders(); }, 300);
});
document.getElementById('supplierFilter').addEventListener('change', () => { page = 1; loadOrders(); });
document.getElementById('prevPage').addEventListener('click', () => { if (page > 1) { page--; loadOrders(); } });
document.getElementById('nextPage').addEventListener('click', () => { if (page < pages) { page++; loadOrders(); } });

// ---------- Create / edit form ----------
function productOptions(selectedId) {
  return '<option value="">Choose a product...</option>' + products.map(p =>
    `<option value="${p.id}" ${p.id === selectedId ? 'selected' : ''}>${esc(p.name)} (${esc(p.sku)}) · ${p.quantity} in stock</option>`
  ).join('');
}

function addLine(line = {}) {
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td><select class="line-product" required>${productOptions(line.product_id)}</select></td>
    <td><input type="number" class="line-qty" min="1" step="1" value="${line.quantity_ordered || 1}" required></td>
    <td><input type="number" class="line-cost" min="0" step="0.01" value="${line.unit_cost ?? ''}" required></td>
    <td class="line-total">KSh 0.00</td>
    <td><button type="button" class="danger small line-remove" title="Remove">✕</button></td>`;
  document.getElementById('poLines').appendChild(tr);

  tr.querySelector('.line-product').addEventListener('change', (e) => {
    // Suggest the last known cost price for the chosen product
    const p = products.find(x => x.id === Number(e.target.value));
    const costInput = tr.querySelector('.line-cost');
    if (p && !costInput.value && Number(p.cost_price) > 0) costInput.value = p.cost_price;
    updateFormTotal();
  });
  tr.querySelector('.line-qty').addEventListener('input', updateFormTotal);
  tr.querySelector('.line-cost').addEventListener('input', updateFormTotal);
  tr.querySelector('.line-remove').addEventListener('click', () => { tr.remove(); updateFormTotal(); });
  updateFormTotal();
}

function readLines() {
  return [...document.querySelectorAll('#poLines tr')].map(tr => ({
    product_id: Number(tr.querySelector('.line-product').value),
    quantity: Number(tr.querySelector('.line-qty').value),
    unit_cost: Number(tr.querySelector('.line-cost').value)
  }));
}

function updateFormTotal() {
  let total = 0;
  document.querySelectorAll('#poLines tr').forEach(tr => {
    const line = (Number(tr.querySelector('.line-qty').value) || 0) * (Number(tr.querySelector('.line-cost').value) || 0);
    tr.querySelector('.line-total').textContent = money(line);
    total += line;
  });
  document.getElementById('poTotal').textContent = money(total);
}

function openForm(po = null) {
  document.getElementById('poForm').reset();
  document.getElementById('poLines').innerHTML = '';
  document.getElementById('poFormError').style.display = 'none';
  document.getElementById('poId').value = po ? po.id : '';
  document.getElementById('poModalTitle').textContent = po ? `Edit ${po.po_number}` : 'New purchase order';
  document.getElementById('placeBtn').style.display = po ? 'none' : 'inline-block';
  if (po) {
    document.getElementById('poSupplier').value = po.supplier_id || '';
    document.getElementById('poExpected').value = po.expected_date ? po.expected_date.slice(0, 10) : '';
    document.getElementById('poNotes').value = po.notes || '';
    po.items.forEach(addLine);
  } else {
    addLine();
  }
  openModal('poModal');
}

document.getElementById('newPoBtn').addEventListener('click', () => openForm());
document.getElementById('addLineBtn').addEventListener('click', () => addLine());

document.getElementById('poForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('poId').value;
  const errorBox = document.getElementById('poFormError');
  errorBox.style.display = 'none';
  const place = e.submitter && e.submitter.dataset.place === '1';

  const payload = {
    supplier_id: Number(document.getElementById('poSupplier').value) || null,
    expected_date: document.getElementById('poExpected').value || null,
    notes: document.getElementById('poNotes').value,
    items: readLines(),
    place_order: place
  };

  try {
    if (id) {
      await api.put(`/purchase-orders/${id}`, payload);
      showAlert('Draft updated.', 'success');
    } else {
      const res = await api.post('/purchase-orders', payload);
      showAlert(`${res.po_number} ${place ? 'placed' : 'saved as draft'}.`, 'success');
    }
    closeModal('poModal');
    closeModal('viewModal');
    loadOrders();
  } catch (err) {
    errorBox.textContent = err.message;
    errorBox.style.display = 'block';
  }
});

// ---------- View / receive ----------
async function viewOrder(id) {
  try {
    viewing = await api.get(`/purchase-orders/${id}`);
  } catch (err) {
    return showAlert(err.message);
  }
  const po = viewing;
  const receiving = ['ordered', 'partially_received'].includes(po.status);
  const isAdmin = currentUser.role === 'admin';

  document.getElementById('viewTitle').textContent = po.po_number;
  document.getElementById('viewStatus').innerHTML = statusBadge(po.status);
  document.getElementById('viewError').style.display = 'none';
  document.getElementById('viewMeta').innerHTML = `
    <div><span class="muted">Supplier</span>${esc(po.supplier_name || '—')}</div>
    <div><span class="muted">Created</span>${dateOnly(po.created_at)} by ${esc(po.created_by_name || '—')}</div>
    <div><span class="muted">Expected</span>${dateOnly(po.expected_date)}</div>
    <div><span class="muted">Received</span>${dateOnly(po.received_at)}</div>
    ${po.notes ? `<div class="full"><span class="muted">Notes</span>${esc(po.notes)}</div>` : ''}`;

  document.getElementById('receiveHead').style.display = receiving ? '' : 'none';
  document.getElementById('viewLines').innerHTML = po.items.map(i => {
    const remaining = i.quantity_ordered - i.quantity_received;
    return `
      <tr>
        <td>${esc(i.product_name)}<div class="muted small-text">${esc(i.sku || '')}</div></td>
        <td>${i.quantity_ordered}</td>
        <td class="${remaining > 0 && i.quantity_received > 0 ? 'qty-low' : ''}">${i.quantity_received}</td>
        <td>${money(i.unit_cost)}</td>
        <td>${money(i.line_total)}</td>
        ${receiving ? `<td><input type="number" class="receive-qty" data-item="${i.id}" min="0" max="${remaining}" value="${remaining}" ${remaining === 0 ? 'disabled' : ''}></td>` : ''}
      </tr>`;
  }).join('');
  document.getElementById('viewTotal').textContent = money(po.total_cost);

  const actions = [`<button class="secondary" onclick="closeModal('viewModal')">Close</button>`,
    `<a class="button-like secondary" href="po-print.html?id=${po.id}" target="_blank">Print / PDF</a>`];
  if (po.status === 'draft') {
    actions.push('<button class="danger" onclick="deleteDraft()">Delete draft</button>');
    actions.push('<button class="secondary" onclick="openForm(viewing)">Edit</button>');
    actions.push('<button onclick="placeOrder()">Place order</button>');
  }
  if (receiving) {
    if (isAdmin) actions.push('<button class="danger" onclick="cancelOrder()">Cancel order</button>');
    actions.push('<button onclick="receiveItems()">Receive stock</button>');
  }
  document.getElementById('viewActions').innerHTML = actions.join('');
  openModal('viewModal');
}

function viewError(message) {
  const box = document.getElementById('viewError');
  box.textContent = message;
  box.style.display = 'block';
}

async function afterAction(message) {
  showAlert(message, 'success');
  closeModal('viewModal');
  products = await api.get('/products'); // stock levels may have changed
  loadOrders();
}

async function placeOrder() {
  try {
    const res = await api.post(`/purchase-orders/${viewing.id}/order`);
    afterAction(res.message);
  } catch (err) { viewError(err.message); }
}

async function receiveItems() {
  const items = [...document.querySelectorAll('.receive-qty')]
    .map(input => ({ item_id: Number(input.dataset.item), quantity: Number(input.value) || 0 }))
    .filter(i => i.quantity > 0);
  if (!items.length) return viewError('Enter the quantity that arrived for at least one product.');
  try {
    const res = await api.post(`/purchase-orders/${viewing.id}/receive`, { items });
    afterAction(res.message);
  } catch (err) { viewError(err.message); }
}

async function cancelOrder() {
  const reason = prompt(`Why is ${viewing.po_number} being cancelled? Stock already received stays in stock.`);
  if (reason === null) return;
  try {
    const res = await api.post(`/purchase-orders/${viewing.id}/cancel`, { reason });
    afterAction(res.message);
  } catch (err) { viewError(err.message); }
}

async function deleteDraft() {
  if (!confirm(`Delete draft ${viewing.po_number}?`)) return;
  try {
    const res = await api.del(`/purchase-orders/${viewing.id}`);
    afterAction(res.message);
  } catch (err) { viewError(err.message); }
}

// ---------- Init ----------
(async function init() {
  try {
    await loadReferenceData();
  } catch (err) {
    showAlert(err.message);
  }
  loadOrders();
})();
