const currentUser = initShell('sales');

let products = [];
let cart = []; // [{ id, name, sku, price, stock, qty }]
let historyPage = 1;
let historyPages = 1;

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
const round2 = (n) => Math.round(n * 100) / 100;

const METHOD_LABELS = { cash: 'Cash', mpesa: 'M-Pesa', card: 'Card', bank: 'Bank' };

// ---------- Tabs ----------
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t === tab));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.id === tab.dataset.tab));
    if (tab.dataset.tab === 'historyTab') loadHistory();
  });
});

// ---------- Product search ----------
async function loadProducts() {
  try {
    products = await api.get('/products');
  } catch (err) {
    showAlert(err.message);
  }
}

const searchInput = document.getElementById('productSearch');
const resultsBox = document.getElementById('searchResults');

function findMatches(term) {
  const t = term.toLowerCase();
  return products
    .filter(p => p.name.toLowerCase().includes(t) || p.sku.toLowerCase().includes(t) || (p.barcode || '').toLowerCase().includes(t))
    .slice(0, 8);
}

function renderResults() {
  const term = searchInput.value.trim();
  if (!term) { resultsBox.innerHTML = ''; resultsBox.style.display = 'none'; return; }
  const matches = findMatches(term);
  resultsBox.style.display = 'block';
  resultsBox.innerHTML = matches.length
    ? matches.map(p => `
        <button type="button" class="result" data-id="${p.id}" ${p.quantity <= 0 ? 'disabled' : ''}>
          <span><strong>${esc(p.name)}</strong> <span class="muted">${esc(p.sku)}</span></span>
          <span>${money(p.unit_price)} · <span class="${p.quantity <= p.reorder_level ? 'qty-low' : ''}">${p.quantity} left</span></span>
        </button>`).join('')
    : '<div class="result empty">No matching products</div>';
}

searchInput.addEventListener('input', renderResults);
searchInput.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  const term = searchInput.value.trim().toLowerCase();
  if (!term) return;
  // An exact SKU match wins (barcode scanners type the SKU then press Enter)
  const exact = products.find(p => p.sku.toLowerCase() === term || (p.barcode || '').toLowerCase() === term);
  const pick = exact || findMatches(term).find(p => p.quantity > 0);
  if (pick) addToCart(pick.id);
});
resultsBox.addEventListener('click', (e) => {
  const btn = e.target.closest('.result[data-id]');
  if (btn) addToCart(Number(btn.dataset.id));
});
document.addEventListener('click', (e) => {
  if (!e.target.closest('.product-search')) resultsBox.style.display = 'none';
});

// ---------- Cart ----------
function addToCart(productId) {
  const p = products.find(x => x.id === productId);
  if (!p) return;
  const line = cart.find(l => l.id === p.id);
  const inCart = line ? line.qty : 0;
  if (inCart + 1 > p.quantity) return showAlert(`Only ${p.quantity} of "${p.name}" in stock.`);

  if (line) line.qty += 1;
  else cart.push({ id: p.id, name: p.name, sku: p.sku, price: Number(p.unit_price), stock: p.quantity, qty: 1 });

  searchInput.value = '';
  renderResults();
  searchInput.focus();
  renderCart();
}

function setQty(id, value) {
  const line = cart.find(l => l.id === id);
  if (!line) return;
  let qty = parseInt(value, 10);
  if (!qty || qty < 1) qty = 1;
  if (qty > line.stock) {
    qty = line.stock;
    showAlert(`Only ${line.stock} of "${line.name}" in stock.`);
  }
  line.qty = qty;
  renderCart();
}

function removeLine(id) {
  cart = cart.filter(l => l.id !== id);
  renderCart();
}

function totals() {
  const subtotal = round2(cart.reduce((s, l) => s + l.price * l.qty, 0));
  let discount = round2(Number(document.getElementById('discountInput').value) || 0);
  discount = Math.min(Math.max(discount, 0), subtotal);
  return { subtotal, discount, total: round2(subtotal - discount) };
}

function renderCart() {
  const body = document.getElementById('cartBody');
  body.innerHTML = cart.length
    ? cart.map(l => `
        <tr>
          <td>${esc(l.name)}<div class="muted small-text">${esc(l.sku)}</div></td>
          <td>${money(l.price)}</td>
          <td><input type="number" class="qty-input" min="1" max="${l.stock}" value="${l.qty}" onchange="setQty(${l.id}, this.value)"></td>
          <td>${money(l.price * l.qty)}</td>
          <td><button class="danger small" onclick="removeLine(${l.id})" title="Remove">✕</button></td>
        </tr>`).join('')
    : '<tr><td colspan="5" class="empty-state">The cart is empty.</td></tr>';
  updateTotals();
}

function updateTotals() {
  const { subtotal, total } = totals();
  document.getElementById('subtotalText').textContent = money(subtotal);
  document.getElementById('totalText').textContent = money(total);
  const paid = Number(document.getElementById('amountPaid').value) || 0;
  const change = paid - total;
  const changeEl = document.getElementById('changeText');
  changeEl.textContent = money(Math.max(change, 0));
  changeEl.classList.toggle('qty-low', paid > 0 && change < 0);
}

document.getElementById('discountInput').addEventListener('input', updateTotals);
document.getElementById('amountPaid').addEventListener('input', updateTotals);

document.getElementById('paymentMethod').addEventListener('change', (e) => {
  const method = e.target.value;
  document.getElementById('cashFields').style.display = method === 'cash' ? 'block' : 'none';
  document.getElementById('refField').style.display = method === 'cash' ? 'none' : 'block';
  document.getElementById('refLabel').textContent =
    method === 'mpesa' ? 'M-Pesa transaction code' : method === 'card' ? 'Card approval code' : 'Bank reference';
});

function resetCheckout() {
  cart = [];
  ['amountPaid', 'paymentRef', 'customerName', 'customerPhone'].forEach(id => { document.getElementById(id).value = ''; });
  document.getElementById('discountInput').value = 0;
  document.getElementById('checkoutError').style.display = 'none';
  renderCart();
}

document.getElementById('clearCartBtn').addEventListener('click', () => {
  if (cart.length && !confirm('Clear all items from the cart?')) return;
  resetCheckout();
});

document.getElementById('completeSaleBtn').addEventListener('click', async () => {
  const errorBox = document.getElementById('checkoutError');
  errorBox.style.display = 'none';
  const fail = (msg) => { errorBox.textContent = msg; errorBox.style.display = 'block'; };

  if (!cart.length) return fail('Add at least one product.');
  const { discount, total } = totals();
  const method = document.getElementById('paymentMethod').value;
  const amountPaid = document.getElementById('amountPaid').value;

  if (method === 'cash' && amountPaid !== '' && Number(amountPaid) < total) {
    return fail('Amount received is less than the total.');
  }

  const btn = document.getElementById('completeSaleBtn');
  btn.disabled = true;
  btn.textContent = 'Saving...';
  try {
    const sale = await api.post('/sales', {
      items: cart.map(l => ({ product_id: l.id, quantity: l.qty })),
      discount,
      payment_method: method,
      payment_ref: document.getElementById('paymentRef').value,
      amount_paid: method === 'cash' && amountPaid !== '' ? Number(amountPaid) : total,
      customer_name: document.getElementById('customerName').value,
      customer_phone: document.getElementById('customerPhone').value
    });
    resetCheckout();
    await loadProducts(); // refresh stock levels
    refreshNotificationCount();
    showAlert(`Sale ${sale.receipt_no} saved.${sale.change_due > 0 ? ' Change: ' + money(sale.change_due) : ''}`, 'success');
    window.open(`receipt.html?id=${sale.id}`, '_blank');
  } catch (err) {
    fail(err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Complete sale';
  }
});

// ---------- History ----------
async function loadHistory() {
  const params = new URLSearchParams({ page: historyPage });
  const filters = {
    search: document.getElementById('historySearch').value.trim(),
    from: document.getElementById('historyFrom').value,
    to: document.getElementById('historyTo').value,
    payment_method: document.getElementById('historyMethod').value,
    status: document.getElementById('historyStatus').value
  };
  Object.entries(filters).forEach(([k, v]) => { if (v) params.set(k, v); });

  const body = document.getElementById('historyBody');
  try {
    const data = await api.get(`/sales?${params.toString()}`);
    historyPages = data.pages;

    document.getElementById('sumRevenue').textContent = money(data.summary.revenue);
    document.getElementById('sumCount').textContent = data.summary.count;
    document.getElementById('sumDiscounts').textContent = money(data.summary.discounts);
    document.getElementById('sumVoided').textContent = data.summary.voided;

    body.innerHTML = data.rows.length
      ? data.rows.map(s => `
          <tr class="${s.status === 'voided' ? 'archived-row' : ''}">
            <td class="sku">${esc(s.receipt_no)}</td>
            <td class="nowrap">${new Date(s.created_at).toLocaleString()}</td>
            <td>${esc(s.cashier_name || '—')}</td>
            <td>${esc(s.customer_name || 'Walk-in')}</td>
            <td>${s.item_count}</td>
            <td>${esc(METHOD_LABELS[s.payment_method] || s.payment_method)}</td>
            <td>${money(s.total)}</td>
            <td><span class="badge ${s.status === 'voided' ? 'low' : 'ok'}" title="${esc(s.void_reason || '')}">${esc(s.status)}</span></td>
            <td class="actions">
              <a class="button-like secondary small" href="receipt.html?id=${s.id}" target="_blank">Receipt</a>
              ${currentUser.role === 'admin' && s.status === 'completed'
                ? `<button class="danger small" onclick="openVoid(${s.id})">Void</button>` : ''}
            </td>
          </tr>`).join('')
      : '<tr><td colspan="9" class="empty-state">No sales match these filters.</td></tr>';

    historyRows = data.rows;
    document.getElementById('historyInfo').textContent = `page ${data.page} of ${data.pages}`;
    document.getElementById('historyPrev').disabled = historyPage <= 1;
    document.getElementById('historyNext').disabled = historyPage >= historyPages;
  } catch (err) {
    body.innerHTML = `<tr><td colspan="9" class="empty-state">${esc(err.message)}</td></tr>`;
  }
}

let historyRows = [];
function reloadHistory() { historyPage = 1; loadHistory(); }
let historyDebounce;
document.getElementById('historySearch').addEventListener('input', () => {
  clearTimeout(historyDebounce);
  historyDebounce = setTimeout(reloadHistory, 300);
});
['historyFrom', 'historyTo', 'historyMethod', 'historyStatus'].forEach(id =>
  document.getElementById(id).addEventListener('change', reloadHistory));
document.getElementById('historyPrev').addEventListener('click', () => { if (historyPage > 1) { historyPage--; loadHistory(); } });
document.getElementById('historyNext').addEventListener('click', () => { if (historyPage < historyPages) { historyPage++; loadHistory(); } });

// ---------- Void ----------
function openVoid(id) {
  const sale = historyRows.find(s => s.id === id);
  document.getElementById('voidSaleId').value = id;
  document.getElementById('voidReceiptNo').textContent = sale ? sale.receipt_no : '';
  document.getElementById('voidForm').reset();
  document.getElementById('voidError').style.display = 'none';
  openModal('voidModal');
}

document.getElementById('voidForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('voidSaleId').value;
  const errorBox = document.getElementById('voidError');
  try {
    const res = await api.post(`/sales/${id}/void`, { reason: document.getElementById('voidReason').value.trim() });
    closeModal('voidModal');
    showAlert(res.message, 'success');
    loadHistory();
    loadProducts();
  } catch (err) {
    errorBox.textContent = err.message;
    errorBox.style.display = 'block';
  }
});

loadProducts();
searchInput.focus();
