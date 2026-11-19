initShell('profile');

function showAlert(message, type = 'error') {
  const box = document.getElementById('pageAlert');
  box.textContent = message;
  box.className = `alert ${type}`;
  box.style.display = 'block';
  setTimeout(() => { box.style.display = 'none'; }, 4000);
}

function showFormError(id, message) {
  const box = document.getElementById(id);
  box.textContent = message;
  box.style.display = message ? 'block' : 'none';
}

function formatDate(value) {
  return value ? new Date(value).toLocaleString() : 'Never';
}

let profile = null;

function renderProfile() {
  document.getElementById('profileAvatar').innerHTML = avatarHtml(profile, 96);
  document.getElementById('profileName').textContent = profile.name;
  document.getElementById('profileEmail').textContent = profile.email;
  document.getElementById('profileRole').textContent = profile.role;
  document.getElementById('removeAvatarBtn').style.display = profile.avatar ? 'inline-block' : 'none';

  document.getElementById('metaCreated').textContent = new Date(profile.created_at).toLocaleDateString();
  document.getElementById('metaLastLogin').textContent = formatDate(profile.last_login_at);
  document.getElementById('metaMovements').textContent = profile.stats.totalMovements;
  document.getElementById('metaInOut').textContent = `${profile.stats.stockIns} / ${profile.stats.stockOuts}`;

  document.getElementById('nameInput').value = profile.name;
  document.getElementById('emailInput').value = profile.email;
  document.getElementById('phoneInput').value = profile.phone || '';

  const body = document.getElementById('recentBody');
  body.innerHTML = profile.recent.length
    ? profile.recent.map(tx => `
        <tr>
          <td>${esc(tx.product_name)}</td>
          <td><span class="badge ${esc(tx.type)}">${esc(tx.type)}</span></td>
          <td>${tx.quantity}</td>
          <td>${esc(tx.reason || '—')}</td>
          <td>${formatDate(tx.created_at)}</td>
        </tr>`).join('')
    : '<tr><td colspan="5" class="empty-state">You have not recorded any stock movements yet.</td></tr>';
}

async function loadProfile() {
  try {
    profile = await api.get('/profile');
    renderProfile();
    saveCurrentUser({ name: profile.name, email: profile.email, avatar: profile.avatar });
  } catch (err) {
    showAlert(err.message);
  }
}

// ---------- Personal details ----------
document.getElementById('detailsForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  showFormError('detailsError', '');
  try {
    const res = await api.put('/profile', {
      name: document.getElementById('nameInput').value.trim(),
      email: document.getElementById('emailInput').value.trim(),
      phone: document.getElementById('phoneInput').value.trim()
    });
    Object.assign(profile, res.user);
    saveCurrentUser({ name: res.user.name, email: res.user.email });
    renderProfile();
    showAlert('Your details have been saved.', 'success');
  } catch (err) {
    showFormError('detailsError', err.message);
  }
});

// ---------- Password ----------
document.getElementById('passwordForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  showFormError('passwordError', '');
  const currentPassword = document.getElementById('currentPassword').value;
  const newPassword = document.getElementById('newPassword').value;
  const confirmPassword = document.getElementById('confirmPassword').value;

  if (newPassword !== confirmPassword) {
    return showFormError('passwordError', 'The new passwords do not match.');
  }
  try {
    await api.put('/profile/password', { currentPassword, newPassword });
    e.target.reset();
    showAlert('Password changed successfully.', 'success');
  } catch (err) {
    showFormError('passwordError', err.message);
  }
});

// ---------- Photo ----------
// The picture is shrunk to 256x256 in the browser before upload,
// so even a large phone photo ends up only a few KB.
function resizeImage(file, size = 256) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read the file'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('That file is not a valid image'));
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const side = Math.min(img.width, img.height); // centre square crop
        canvas.getContext('2d').drawImage(
          img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, size, size
        );
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

document.getElementById('avatarInput').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  if (file.size > 10 * 1024 * 1024) return showAlert('Please choose an image under 10 MB.');
  try {
    const avatar = await resizeImage(file);
    await api.put('/profile/avatar', { avatar });
    profile.avatar = avatar;
    saveCurrentUser({ avatar });
    renderProfile();
    showAlert('Photo updated.', 'success');
  } catch (err) {
    showAlert(err.message);
  }
});

document.getElementById('removeAvatarBtn').addEventListener('click', async () => {
  if (!confirm('Remove your profile photo?')) return;
  try {
    await api.put('/profile/avatar', { avatar: null });
    profile.avatar = null;
    saveCurrentUser({ avatar: null });
    renderProfile();
    showAlert('Photo removed.', 'success');
  } catch (err) {
    showAlert(err.message);
  }
});

loadProfile();
