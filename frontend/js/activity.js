if (requireAdmin()) initShell('activity');

const ACTION_LABELS = {
  'auth.login': ['Signed in', 'neutral'],
  'auth.login_failed': ['Failed sign-in', 'low'],
  'product.create': ['Product added', 'ok'],
  'product.update': ['Product edited', 'adjustment'],
  'product.archive': ['Product archived', 'low'],
  'product.restore': ['Product restored', 'ok'],
  'product.delete': ['Product deleted', 'low'],
  'stock.in': ['Stock in', 'in'],
  'stock.out': ['Stock out', 'out'],
  'stock.adjustment': ['Stock adjusted', 'adjustment'],
  'sale.create': ['Sale', 'in'],
  'sale.void': ['Sale voided', 'low'],
  'po.create': ['PO drafted', 'neutral'],
  'po.update': ['PO edited', 'adjustment'],
  'po.order': ['PO placed', 'adjustment'],
  'po.receive': ['Stock received', 'in'],
  'po.cancel': ['PO cancelled', 'low'],
  'po.delete': ['PO deleted', 'low'],
  'category.create': ['Category added', 'ok'],
  'category.update': ['Category edited', 'adjustment'],
  'category.delete': ['Category deleted', 'low'],
  'supplier.create': ['Supplier added', 'ok'],
  'supplier.update': ['Supplier edited', 'adjustment'],
  'supplier.delete': ['Supplier deleted', 'low'],
  'user.create': ['User created', 'ok'],
  'user.update': ['User edited', 'adjustment'],
  'user.delete': ['User deleted', 'low'],
  'profile.update': ['Profile edited', 'neutral'],
  'profile.password': ['Password changed', 'neutral'],
  'profile.avatar': ['Photo changed', 'neutral']
};

let page = 1;
let pages = 1;

function showAlert(message, type = 'error') {
  const box = document.getElementById('pageAlert');
  box.textContent = message;
  box.className = `alert ${type}`;
  box.style.display = 'block';
  setTimeout(() => { box.style.display = 'none'; }, 4000);
}

function actionBadge(action) {
  const [label, cls] = ACTION_LABELS[action] || [action, 'neutral'];
  return `<span class="badge ${cls}">${esc(label)}</span>`;
}

async function loadUsersFilter() {
  try {
    const users = await api.get('/users');
    document.getElementById('userFilter').innerHTML = '<option value="">Everyone</option>' +
      users.map(u => `<option value="${u.id}">${esc(u.name)}</option>`).join('');
  } catch (_) { /* filter just stays at "Everyone" */ }
}

async function loadActivity() {
  const params = new URLSearchParams({ page, limit: 25 });
  const filters = {
    search: document.getElementById('searchInput').value.trim(),
    user_id: document.getElementById('userFilter').value,
    entity_type: document.getElementById('typeFilter').value,
    from: document.getElementById('fromDate').value,
    to: document.getElementById('toDate').value
  };
  Object.entries(filters).forEach(([k, v]) => { if (v) params.set(k, v); });

  const body = document.getElementById('activityBody');
  try {
    const data = await api.get(`/activity?${params.toString()}`);
    pages = data.pages;
    body.innerHTML = data.rows.length
      ? data.rows.map(a => `
          <tr>
            <td class="nowrap">${new Date(a.created_at).toLocaleString()}</td>
            <td>${esc(a.user_name || 'Unknown')}</td>
            <td>${actionBadge(a.action)}</td>
            <td>${esc(a.details || '—')}</td>
            <td class="muted">${esc(a.ip_address || '—')}</td>
          </tr>`).join('')
      : '<tr><td colspan="5" class="empty-state">No activity matches these filters.</td></tr>';

    document.getElementById('pagerInfo').textContent =
      `${data.total} record${data.total === 1 ? '' : 's'} · page ${data.page} of ${data.pages}`;
    document.getElementById('prevPage').disabled = page <= 1;
    document.getElementById('nextPage').disabled = page >= pages;
  } catch (err) {
    body.innerHTML = `<tr><td colspan="5" class="empty-state">${esc(err.message)}</td></tr>`;
  }
}

function reload() { page = 1; loadActivity(); }

let searchDebounce;
document.getElementById('searchInput').addEventListener('input', () => {
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(reload, 300);
});
['userFilter', 'typeFilter', 'fromDate', 'toDate'].forEach(id =>
  document.getElementById(id).addEventListener('change', reload));

document.getElementById('clearFilters').addEventListener('click', () => {
  ['searchInput', 'userFilter', 'typeFilter', 'fromDate', 'toDate']
    .forEach(id => { document.getElementById(id).value = ''; });
  reload();
});
document.getElementById('prevPage').addEventListener('click', () => { if (page > 1) { page--; loadActivity(); } });
document.getElementById('nextPage').addEventListener('click', () => { if (page < pages) { page++; loadActivity(); } });

loadUsersFilter();
loadActivity();
