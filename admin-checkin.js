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

function baseUrl() {
  return window.location.origin;
}

async function loadProperties() {
  if (!adminToken) return alert('Connecte-toi d’abord.');
  const out = await api('/.netlify/functions/admin-list-properties', {
    admin_token: adminToken
  });

  const sel = $('property_id');
  sel.innerHTML = '<option value="">— Sélectionner —</option>';
  (out.properties || []).forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = p.name || p.id;
    sel.appendChild(opt);
  });

  if (!(out.properties || []).length) alert("Aucun logement trouvé dans properties.");
}

async function createCheckinLink() {
  if (!adminToken) return alert('Connecte-toi d’abord.');

  const propertyId = $('property_id').value;
  const arrival = $('arrival').value;
  const departure = $('departure').value;

  if (!propertyId) return alert("Choisis un logement.");
  if (!arrival || !departure) return alert("Mets arrivée + départ.");
  if (departure <= arrival) return alert("La date de départ doit être après l’arrivée.");

  const out = await api('/.netlify/functions/admin-create-reservation', {
    admin_token: adminToken,
    property_id: propertyId,
    arrival_date: arrival,
    departure_date: departure
  });

  $('generatedLink').value = out.link;
  alert("Lien créé ✅");
}

function copyLink() {
  const v = $('generatedLink').value;
  if (!v) return alert("Aucun lien à copier.");
  navigator.clipboard.writeText(v).then(
    () => alert("Copié ✅"),
    () => alert("Impossible de copier. Copie manuelle.")
  );
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
