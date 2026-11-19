initShell('dashboard');

function formatCurrency(n) {
  return `KSh ${Number(n).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function typeBadge(type) {
  return `<span class="badge ${type}">${type}</span>`;
}

async function loadDashboard() {
  try {
    const [summary, lowStock] = await Promise.all([
      api.get('/products/summary/dashboard'),
      api.get('/products?lowStock=true')
    ]);

    document.getElementById('statTotalItems').textContent = summary.totalItems;
    document.getElementById('statTotalValue').textContent = formatCurrency(summary.totalValue);
    document.getElementById('statLowStock').textContent = summary.lowStockCount;

    const body = document.getElementById('activityBody');
    if (!summary.recentActivity.length) {
      body.innerHTML = '<tr><td colspan="6" class="empty-state">No stock activity yet.</td></tr>';
    } else {
      body.innerHTML = summary.recentActivity.map(tx => `
        <tr>
          <td>${esc(tx.product_name)}</td>
          <td>${typeBadge(tx.type)}</td>
          <td>${tx.quantity}</td>
          <td>${esc(tx.reason || '—')}</td>
          <td>${esc(tx.user_name)}</td>
          <td>${new Date(tx.created_at).toLocaleString()}</td>
        </tr>
      `).join('');
    }

    const lowBody = document.getElementById('lowStockBody');
    if (!lowStock.length) {
      lowBody.innerHTML = '<tr><td colspan="3" class="empty-state">Everything is above reorder level.</td></tr>';
    } else {
      lowBody.innerHTML = lowStock.map(p => `
        <tr>
          <td>${esc(p.name)}</td>
          <td class="qty-low">${p.quantity}</td>
          <td>${p.reorder_level}</td>
        </tr>
      `).join('');
    }
  } catch (err) {
    document.getElementById('activityBody').innerHTML =
      `<tr><td colspan="6" class="empty-state">${esc(err.message)}</td></tr>`;
    document.getElementById('lowStockBody').innerHTML =
      `<tr><td colspan="3" class="empty-state">${esc(err.message)}</td></tr>`;
  }
}

loadDashboard();
