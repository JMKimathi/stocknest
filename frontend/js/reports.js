if (requireAdmin()) initShell('reports');

const COLORS = ['#2c3e50', '#16a085', '#e67e22', '#8e44ad', '#2980b9', '#c0392b', '#27ae60', '#d35400', '#7f8c8d', '#f1c40f'];
const METHOD_LABELS = { cash: 'Cash', mpesa: 'M-Pesa', card: 'Card', bank: 'Bank' };
const charts = {};

function showAlert(message, type = 'error') {
  const box = document.getElementById('pageAlert');
  box.textContent = message;
  box.className = `alert ${type}`;
  box.style.display = 'block';
  setTimeout(() => { box.style.display = 'none'; }, 4000);
}

function money(n, decimals = 2) {
  return `KSh ${Number(n).toLocaleString('en-KE', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
}
function iso(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ---------- Date range ----------
function applyPreset(preset) {
  const today = new Date();
  let from = new Date(today);
  if (preset === '7') from.setDate(today.getDate() - 6);
  else if (preset === '30') from.setDate(today.getDate() - 29);
  else if (preset === 'month') from = new Date(today.getFullYear(), today.getMonth(), 1);
  else if (preset === 'year') from = new Date(today.getFullYear(), 0, 1);
  document.getElementById('fromDate').value = iso(from);
  document.getElementById('toDate').value = iso(today);
}

document.querySelectorAll('#presets .pill').forEach(pill => {
  pill.addEventListener('click', () => {
    document.querySelectorAll('#presets .pill').forEach(p => p.classList.toggle('active', p === pill));
    applyPreset(pill.dataset.preset);
    loadReport();
  });
});
['fromDate', 'toDate'].forEach(id => document.getElementById(id).addEventListener('change', () => {
  document.querySelectorAll('#presets .pill').forEach(p => p.classList.remove('active'));
  loadReport();
}));

function rangeParams() {
  return new URLSearchParams({
    from: document.getElementById('fromDate').value,
    to: document.getElementById('toDate').value
  }).toString();
}

// ---------- Charts ----------
function drawChart(id, config) {
  if (typeof Chart === 'undefined') return; // chart library missing - tables still work
  if (charts[id]) charts[id].destroy();
  charts[id] = new Chart(document.getElementById(id), config);
}

function emptyNote(id, isEmpty) {
  const box = document.getElementById(id).parentElement;
  box.classList.toggle('is-empty', isEmpty);
}

function renderCharts(data) {
  const labelFor = (p) => data.range.monthly
    ? new Date(`${p}-01T00:00:00`).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
    : new Date(`${p}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

  drawChart('revenueChart', {
    type: 'line',
    data: {
      labels: data.series.map(s => labelFor(s.period)),
      datasets: [{
        label: 'Revenue (KSh)', data: data.series.map(s => s.revenue),
        borderColor: COLORS[1], backgroundColor: 'rgba(22,160,133,.12)', fill: true, tension: .3, pointRadius: 2
      }, {
        label: 'Number of sales', data: data.series.map(s => s.sales), yAxisID: 'y1',
        borderColor: COLORS[2], borderDash: [4, 4], pointRadius: 0, tension: .3
      }]
    },
    options: {
      maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
      scales: {
        y: { beginAtZero: true, ticks: { callback: v => Number(v).toLocaleString() } },
        y1: { beginAtZero: true, position: 'right', grid: { drawOnChartArea: false }, ticks: { precision: 0 } }
      }
    }
  });

  emptyNote('topChart', !data.topProducts.length);
  drawChart('topChart', {
    type: 'bar',
    data: {
      labels: data.topProducts.map(p => p.name.length > 22 ? p.name.slice(0, 21) + '…' : p.name),
      datasets: [{ label: 'Revenue (KSh)', data: data.topProducts.map(p => Number(p.revenue)), backgroundColor: COLORS[0] }]
    },
    options: {
      indexAxis: 'y', maintainAspectRatio: false, plugins: { legend: { display: false },
        tooltip: { callbacks: { afterLabel: (ctx) => `${data.topProducts[ctx.dataIndex].units} units` } } },
      scales: { x: { beginAtZero: true, ticks: { callback: v => Number(v).toLocaleString() } } }
    }
  });

  const doughnut = (id, rows, labelFn) => {
    emptyNote(id, !rows.length);
    drawChart(id, {
      type: 'doughnut',
      data: {
        labels: rows.map(labelFn),
        datasets: [{ data: rows.map(r => Number(r.revenue)), backgroundColor: COLORS, borderWidth: 1 }]
      },
      options: {
        maintainAspectRatio: false, cutout: '60%',
        plugins: {
          legend: { position: 'right' },
          tooltip: { callbacks: { label: (ctx) => `${ctx.label}: ${money(ctx.parsed, 0)}` } }
        }
      }
    });
  };
  doughnut('categoryChart', data.byCategory, r => r.name);
  doughnut('paymentChart', data.payments, r => METHOD_LABELS[r.method] || r.method);
}

// ---------- Tables & KPIs ----------
function renderSummary(s) {
  document.getElementById('kRevenue').textContent = money(s.revenue, 0);
  document.getElementById('kSales').textContent = `${s.salesCount} sale${s.salesCount === 1 ? '' : 's'} · ${money(s.discounts, 0)} discounts`;
  const profitEl = document.getElementById('kProfit');
  profitEl.textContent = money(s.grossProfit, 0);
  profitEl.classList.toggle('qty-low', s.grossProfit < 0);
  document.getElementById('kMargin').textContent = `${s.margin.toFixed(1)}% margin`;
  document.getElementById('kAvg').textContent = money(s.avgSale, 0);
  document.getElementById('kUnits').textContent = `${s.unitsSold} units sold`;
  document.getElementById('kPurchases').textContent = money(s.purchasesTotal, 0);
  document.getElementById('kPoCount').textContent = `${s.purchaseOrders} purchase order${s.purchaseOrders === 1 ? '' : 's'}`;
}

function renderTables(data) {
  document.getElementById('slowBody').innerHTML = data.slowMovers.length
    ? data.slowMovers.map(p => `
        <tr>
          <td>${esc(p.name)}<div class="muted small-text">${esc(p.sku)}</div></td>
          <td>${p.quantity}</td>
          <td>${money(p.value, 0)}</td>
          <td class="nowrap">${p.lastSold ? new Date(p.lastSold).toLocaleDateString() : '<span class="muted">Never</span>'}</td>
        </tr>`).join('')
    : '<tr><td colspan="4" class="empty-state">Every product in stock sold at least once. 🎉</td></tr>';

  let totals = { products: 0, units: 0, cost: 0, retail: 0 };
  const rows = data.valuation.map(v => {
    totals.products += Number(v.products);
    totals.units += Number(v.units);
    totals.cost += Number(v.costValue);
    totals.retail += Number(v.retailValue);
    return `
      <tr>
        <td>${esc(v.name)}</td><td>${v.products}</td><td>${Number(v.units).toLocaleString()}</td>
        <td>${money(v.costValue, 0)}</td><td>${money(v.retailValue, 0)}</td>
        <td>${money(v.retailValue - v.costValue, 0)}</td>
      </tr>`;
  });
  rows.push(`
    <tr class="total-row">
      <td>Total</td><td>${totals.products}</td><td>${totals.units.toLocaleString()}</td>
      <td>${money(totals.cost, 0)}</td><td>${money(totals.retail, 0)}</td><td>${money(totals.retail - totals.cost, 0)}</td>
    </tr>`);
  document.getElementById('valuationBody').innerHTML = rows.join('');
}

async function loadReport() {
  try {
    const data = await api.get(`/reports/overview?${rangeParams()}`);
    renderSummary(data.summary);
    renderCharts(data);
    renderTables(data);
  } catch (err) {
    showAlert(err.message);
  }
}

// ---------- CSV export ----------
document.querySelectorAll('[data-export]').forEach(btn => {
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    try {
      await api.download(`/reports/export/${btn.dataset.export}?${rangeParams()}`);
    } catch (err) {
      showAlert(err.message);
    } finally {
      btn.disabled = false;
    }
  });
});

if (typeof Chart === 'undefined') {
  showAlert('Charts could not load. Run "npm install" in the backend folder, then restart the server.');
}
applyPreset('30');
loadReport();
