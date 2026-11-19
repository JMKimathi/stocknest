const currentUser = initShell('dashboard');

function formatCurrency(n) {
  return `KSh ${Number(n).toLocaleString('en-KE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function typeBadge(type) {
  return `<span class="badge ${esc(type)}">${esc(type)}</span>`;
}

function shortTime(value) {
  const d = new Date(value);
  const today = new Date();
  return d.toDateString() === today.toDateString()
    ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString([], { day: 'numeric', month: 'short' });
}

// Greeting and date at the top
if (currentUser) {
  const hour = new Date().getHours();
  const part = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  document.getElementById('greeting').textContent = `${part}, ${currentUser.name.split(' ')[0]}`;
  document.getElementById('todayLine').textContent = new Date().toLocaleDateString(undefined,
    { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

// Icons inside the stat cards
document.querySelectorAll('[data-icon]').forEach(el => { el.innerHTML = icon(el.dataset.icon); });

async function loadDashboard() {
  try {
    const [summary, lowStock] = await Promise.all([
      api.get('/products/summary/dashboard'),
      api.get('/products?lowStock=true')
    ]);

    document.getElementById('statRevenueToday').textContent = formatCurrency(summary.revenueToday);
    document.getElementById('statSalesToday').textContent =
      `${summary.salesToday} sale${summary.salesToday === 1 ? '' : 's'} so far today`;
    document.getElementById('statLowStock').textContent = summary.lowStockCount;
    document.getElementById('statOutOfStock').textContent =
      summary.outOfStockCount ? `${summary.outOfStockCount} completely out of stock` : 'none out of stock';
    document.getElementById('statOutOfStock').classList.toggle('qty-low', summary.outOfStockCount > 0);
    document.getElementById('statTotalItems').textContent = summary.totalItems;
    document.getElementById('statTotalValue').textContent = `${formatCurrency(summary.totalValue)} stock value`;
    document.getElementById('statOpenOrders').textContent = summary.openOrders;
    const overdueEl = document.getElementById('statOverdue');
    overdueEl.textContent = summary.overdueOrders ? `${summary.overdueOrders} overdue` : 'none overdue';
    overdueEl.classList.toggle('qty-low', summary.overdueOrders > 0);

    const body = document.getElementById('activityBody');
    body.innerHTML = summary.recentActivity.length
      ? summary.recentActivity.map(tx => `
          <tr>
            <td>${esc(tx.product_name)}</td>
            <td>${typeBadge(tx.type)}</td>
            <td>${tx.quantity}</td>
            <td class="muted">${esc(tx.reason || '—')}</td>
            <td>${esc(tx.user_name)}</td>
            <td class="nowrap muted">${shortTime(tx.created_at)}</td>
          </tr>`).join('')
      : '<tr><td colspan="6" class="empty-state">No stock activity yet. Make a sale or record a delivery to see it here.</td></tr>';

    // Each row opens that product on the Products page
    const lowBody = document.getElementById('lowStockBody');
    lowBody.innerHTML = lowStock.length
      ? lowStock.slice(0, 10).map(p => `
          <tr class="clickable" data-sku="${esc(p.sku)}" title="Open ${esc(p.name)}">
            <td><strong>${esc(p.name)}</strong><div class="sku">${esc(p.sku)}</div></td>
            <td><span class="badge low">${p.quantity}</span></td>
            <td class="muted">${p.reorder_level}</td>
          </tr>`).join('')
      : '<tr><td colspan="3" class="empty-state">Everything is above its reorder level. 👍</td></tr>';
  } catch (err) {
    document.getElementById('activityBody').innerHTML =
      `<tr><td colspan="6" class="empty-state">${esc(err.message)}</td></tr>`;
    document.getElementById('lowStockBody').innerHTML =
      `<tr><td colspan="3" class="empty-state">${esc(err.message)}</td></tr>`;
  }
}

document.getElementById('lowStockBody').addEventListener('click', (e) => {
  const row = e.target.closest('tr[data-sku]');
  if (row) window.location.href = `products.html?search=${encodeURIComponent(row.dataset.sku)}`;
});

loadDashboard();
