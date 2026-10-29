// ============================================================
// public/js/admin.js
// Admin panel FE logic.
// Önkoşul: login.js localStorage'a { token, user: { role: 'admin' } } yazmış olmalı.
// ============================================================

const API = {
  headers() {
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${localStorage.getItem('token') || ''}`,
    };
  },
};

function currentUser() {
  try { return JSON.parse(localStorage.getItem('user') || 'null'); }
  catch { return null; }
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}

// ============================================================
// 🚪 Guard — admin değilse login'e at
// ============================================================
(function guard() {
  const u = currentUser();
  if (!u || u.role !== 'admin') {
    alert('Bu sayfa yalnızca admin içindir');
    location.href = '/login.html';
  } else {
    const who = document.getElementById('whoami');
    if (who) who.textContent = `${u.username || u.email || 'admin'} (${u.role})`;
  }
})();

// ============================================================
// FETCH helpers
// ============================================================
async function apiGet(path) {
  const res = await fetch(path, { headers: API.headers() });
  if (res.status === 401 || res.status === 403) {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    location.href = '/login.html';
    throw new Error('Yetkisiz');
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

async function apiPost(path, body) {
  const res = await fetch(path, {
    method: 'POST',
    headers: API.headers(),
    body: JSON.stringify(body || {}),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

// ============================================================
// STATS
// ============================================================
async function loadStats() {
  const el = document.getElementById('stats');
  try {
    const stats = await apiGet('/admin/dashboard');
    el.textContent = JSON.stringify(stats, null, 2);
  } catch (e) {
    el.textContent = 'Hata: ' + e.message;
  }
}

// ============================================================
// USERS
// ============================================================
async function loadUsers(search = '') {
  const qs = new URLSearchParams();
  if (search) qs.set('search', search);
  qs.set('limit', '100');

  const tbody = document.querySelector('#users-table tbody');
  tbody.innerHTML = '<tr><td colspan="10">Yükleniyor...</td></tr>';

  try {
    const { users } = await apiGet('/admin/users?' + qs.toString());
    tbody.innerHTML = '';

    if (!users.length) {
      tbody.innerHTML = '<tr><td colspan="10">Kayıt yok</td></tr>';
      return;
    }

    for (const u of users) {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${u.id}</td>
        <td>${escapeHtml(u.username || '')}</td>
        <td>${escapeHtml(u.email || '')}</td>
        <td>${u.role === 'admin'
          ? '<span class="badge badge-admin">admin</span>'
          : escapeHtml(u.role || 'user')}</td>
        <td>${u.credits ?? 0}</td>
        <td>${u.live_cards_count ?? 0}</td>
        <td>${u.enrollments_count ?? 0}</td>
        <td>${u.transactions_count ?? 0}</td>
        <td>${u.is_active
          ? '<span class="badge badge-active">aktif</span>'
          : '<span class="badge badge-inactive">pasif</span>'}</td>
        <td><button data-id="${u.id}">Detay</button></td>
      `;
      tr.querySelector('button').addEventListener('click', () => openUserDetail(u.id));
      tbody.appendChild(tr);
    }
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="10">Hata: ${escapeHtml(e.message)}</td></tr>`;
  }
}

async function openUserDetail(userId) {
  try {
    // Audit — admin görüntülemesini logla (opsiyonel)
    apiPost('/admin/audit-view', {
      targetUserId: userId,
      resource: 'user_detail',
      resourceId: String(userId),
    }).catch(() => {});

    const data = await apiGet(`/admin/users/${userId}`);

    document.getElementById('detail-name').textContent =
      `${data.user.username} (${data.user.email || '-'}) — role: ${data.user.role}`;
    document.getElementById('detail-live-cards').textContent =
      JSON.stringify(data.liveCards, null, 2);
    document.getElementById('detail-txns').textContent =
      JSON.stringify(data.transactions, null, 2);
    document.getElementById('user-detail').style.display = '';
  } catch (e) {
    alert('Detay yüklenemedi: ' + e.message);
  }
}

// ============================================================
// LOGOUT
// ============================================================
document.getElementById('logout')?.addEventListener('click', () => {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  location.href = '/login.html';
});

// ============================================================
// INIT
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  loadStats();
  loadUsers();

  let timer;
  document.getElementById('user-search')?.addEventListener('input', (e) => {
    clearTimeout(timer);
    timer = setTimeout(() => loadUsers(e.target.value.trim()), 300);
  });
});