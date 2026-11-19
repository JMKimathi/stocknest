requireAuth();

const METHOD_LABELS = { cash: 'Cash', mpesa: 'M-Pesa', card: 'Card', bank: 'Bank transfer' };
const amt = (n) => Number(n).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

async function loadReceipt() {
  const box = document.getElementById('receipt');
  const id = new URLSearchParams(location.search).get('id');
  if (!id) { box.innerHTML = '<p class="center">No receipt selected.</p>'; return; }

  try {
    const s = await api.get(`/sales/${encodeURIComponent(id)}`);
    document.title = `Receipt ${s.receipt_no}`;
    const itemCount = s.items.reduce((n, i) => n + i.quantity, 0);

    box.innerHTML = `
      <div class="center">
        <h1>${esc(s.shop.name)}</h1>
        ${s.shop.address ? `<div class="muted">${esc(s.shop.address)}</div>` : ''}
        ${s.shop.phone ? `<div class="muted">Tel: ${esc(s.shop.phone)}</div>` : ''}
      </div>
      <hr>
      <table>
        <tr><td>Receipt</td><td class="r">${esc(s.receipt_no)}</td></tr>
        <tr><td>Date</td><td class="r">${new Date(s.created_at).toLocaleString()}</td></tr>
        <tr><td>Served by</td><td class="r">${esc(s.cashier_name || '—')}</td></tr>
        ${s.customer_name ? `<tr><td>Customer</td><td class="r">${esc(s.customer_name)}</td></tr>` : ''}
        ${s.customer_phone ? `<tr><td>Phone</td><td class="r">${esc(s.customer_phone)}</td></tr>` : ''}
      </table>
      ${s.status === 'voided' ? `<div class="void-stamp">VOIDED<div style="font-size:11px;font-weight:normal">${esc(s.void_reason || '')}</div></div>` : ''}
      <hr>
      <table>
        ${s.items.map(i => `
          <tr><td colspan="2" class="item-name">${esc(i.product_name)}</td></tr>
          <tr><td class="muted">${i.quantity} x ${amt(i.unit_price)}</td><td class="r">${amt(i.line_total)}</td></tr>
        `).join('')}
      </table>
      <hr>
      <table>
        <tr><td>Items</td><td class="r">${itemCount}</td></tr>
        <tr><td>Subtotal</td><td class="r">${amt(s.subtotal)}</td></tr>
        ${Number(s.discount) > 0 ? `<tr><td>Discount</td><td class="r">-${amt(s.discount)}</td></tr>` : ''}
        <tr class="total"><td>TOTAL (KSh)</td><td class="r">${amt(s.total)}</td></tr>
        <tr><td>Paid by</td><td class="r">${esc(METHOD_LABELS[s.payment_method] || s.payment_method)}</td></tr>
        ${s.payment_ref ? `<tr><td>Ref</td><td class="r">${esc(s.payment_ref)}</td></tr>` : ''}
        ${s.payment_method === 'cash' ? `
          <tr><td>Cash received</td><td class="r">${amt(s.amount_paid)}</td></tr>
          <tr><td>Change</td><td class="r">${amt(s.change_due)}</td></tr>` : ''}
      </table>
      <hr>
      <div class="center">Thank you for shopping with us!<br><span class="muted">Keep this receipt for any returns.</span></div>
    `;
  } catch (err) {
    box.innerHTML = `<p class="center">${esc(err.message)}</p>`;
  }
}

loadReceipt();
