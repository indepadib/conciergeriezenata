const $ = (id) => document.getElementById(id);

let adminToken = localStorage.getItem('cz_admin_checkin_token') || null;

async function api(path, body) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  const txt = await res.text();
  let json = null;
  try { json = JSON.parse(txt); } catch {}
  if (!res.ok) throw new Error((json && json.error) ? json.error : (txt || `Erreur ${res.status}`));
  return json ?? {};
}

function todayISO() {
  const d = new Date();
  const z = (n) => String(n).padStart(2,'0');
  return `${d.getFullYear()}-${z(d.getMonth()+1)}-${z(d.getDate())}`;
}

function setDefaultDates() {
  const t = todayISO();
  $('from').value = t;
  $('to').value = t;
}

function renderList(items) {
  const box = $('list');
  box.innerHTML = '';
  items.forEach(it => {
    const el = document.createElement('div');
    el.className = 'item';
    el.innerHTML = `<strong>${it.property_name}</strong>
      <div class="muted">${it.arrival_date} → ${it.departure_date} • ${it.status}</div>
      <div class="muted">ID: ${it.id}</div>`;
    el.onclick = () => loadDetail(it.id);
    box.appendChild(el);
  });
}

async function login() {
  const pw = $('pw').value;
  const out = await api('/.netlify/functions/admin-login', { password: pw });
  adminToken = out.token;
  localStorage.setItem('cz_admin_checkin_token', adminToken);
  alert('OK');
}

function logout() {
  adminToken = null;
  localStorage.removeItem('cz_admin_checkin_token');
  alert('Déconnecté');
}

async function loadArrivals() {
  if (!adminToken) return alert('Connecte-toi d’abord.');
  const out = await api('/.netlify/functions/admin-list-arrivals', {
    admin_token: adminToken,
    date_from: $('from').value,
    date_to: $('to').value,
  });
  renderList(out.arrivals || []);
}

async function loadDetail(reservationId) {
  if (!adminToken) return alert('Connecte-toi d’abord.');
  const out = await api('/.netlify/functions/admin-get-reservation', {
    admin_token: adminToken,
    reservation_id: reservationId,
  });
  $('detail').innerHTML = `<pre>${JSON.stringify(out, null, 2)}</pre>`;
}

document.addEventListener('DOMContentLoaded', () => {
  setDefaultDates();
  $('btnLogin').onclick = () => login().catch(e=>alert(e.message));
  $('btnLogout').onclick = () => logout();
  $('btnLoad').onclick = () => loadArrivals().catch(e=>alert(e.message));
});
