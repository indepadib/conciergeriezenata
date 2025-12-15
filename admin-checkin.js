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

function toast(msg) {
  const el = $('toast');
  if (!el) return;
  el.textContent = msg;
  el.style.display = 'block';
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { el.style.display = 'none'; }, 2200);
}

function setAuthUI() {
  const isAuthed = !!adminToken;
  $('authState').textContent = isAuthed ? 'Connecté' : 'Non connecté';
  $('btnLogout').style.display = isAuthed ? 'inline-flex' : 'none';
  $('btnOpenLogin').style.display = isAuthed ? 'none' : 'inline-flex';
}

function openLogin() {
  $('loginError').textContent = '';
  $('loginModal').classList.add('open');
  $('loginModal').setAttribute('aria-hidden', 'false');
  setTimeout(() => $('pw').focus(), 50);
}
function closeLogin() {
  $('loginModal').classList.remove('open');
  $('loginModal').setAttribute('aria-hidden', 'true');
}

function openDrawer() {
  $('drawer').classList.add('open');
  $('drawer').setAttribute('aria-hidden', 'false');
}
function closeDrawer() {
  $('drawer').classList.remove('open');
  $('drawer').setAttribute('aria-hidden', 'true');
}

async function requireAuth() {
  if (adminToken) return true;
  openLogin();
  return false;
}

async function login() {
  try {
    $('loginError').textContent = '';
    const pw = $('pw').value;
    if (!pw) return $('loginError').textContent = "Mot de passe requis.";
    const out = await api('/.netlify/functions/admin-login', { password: pw });
    adminToken = out.token;
    localStorage.setItem('cz_admin_checkin_token', adminToken);
    closeLogin();
    setAuthUI();
    toast('Connecté ✅');
    await initAuthed();
  } catch (e) {
    $('loginError').textContent = e.message || String(e);
  }
}

function logout() {
  adminToken = null;
  localStorage.removeItem('cz_admin_checkin_token');
  setAuthUI();
  openLogin();
}

async function loadProperties() {
  if (!(await requireAuth())) return;

  toast("Chargement des logements…");
  const out = await api('/.netlify/functions/admin-list-properties', { admin_token: adminToken });

  // DEBUG visible (tu pourras enlever après)
  console.log("admin-list-properties OUT =", out);

  const sel = $('property_id');
  const props = out.properties || [];

  sel.innerHTML = `<option value="">— Sélectionner un logement —</option>`;

  props.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = (p.name && String(p.name).trim()) ? p.name : p.id;
    sel.appendChild(opt);
  });

  if (!props.length) {
    toast("⚠️ Aucun logement trouvé. Vérifie la table properties.");
  } else {
    // sélectionne automatiquement le 1er logement pour éviter un “select vide”
    sel.value = props[0].id;
    toast(`✅ ${props.length} logement(s) chargés`);
  }
}

async function createCheckinLink() {
  if (!(await requireAuth())) return;

  const propertyId = $('property_id').value;
  const arrival = $('arrival').value;
  const departure = $('departure').value;

  if (!propertyId) return toast("Choisis un logement.");
  if (!arrival || !departure) return toast("Mets arrivée + départ.");
  if (departure <= arrival) return toast("Départ doit être après l’arrivée.");

  const out = await api('/.netlify/functions/admin-create-reservation', {
    admin_token: adminToken,
    property_id: propertyId,
    arrival_date: arrival,
    departure_date: departure
  });

  $('generatedLink').value = out.link || '';
  toast("Lien créé ✅");
  const selectedOpt = $('property_id').selectedOptions?.[0];
const propertyName = selectedOpt ? selectedOpt.textContent : $('property_id').value;

const items = getRecent();
items.unshift({
  link: out.link,
  property_id: $('property_id').value,
  property_name: propertyName,
  arrival_date: arrival,
  departure_date: departure,
  created_at: new Date().toISOString()
});
setRecent(items);
renderRecent();

}

async function copyLink() {
  const v = $('generatedLink').value;
  if (!v) return toast("Aucun lien à copier.");
  try {
    await navigator.clipboard.writeText(v);
    toast("Copié ✅");
  } catch {
    toast("Copie manuelle requise.");
  }
}

function statusLabel(s) {
  const map = {
    sent: 'Lien envoyé',
    in_progress: 'En cours',
    submitted: 'Complété',
    issue: 'Problème'
  };
  return map[s] || s || '—';
}

function renderArrivals(items) {
  const tbody = $('list');
  const empty = $('emptyState');

  if (!items || !items.length) {
    tbody.innerHTML = '';
    empty.style.display = 'flex';
    return;
  }
  empty.style.display = 'none';

  tbody.innerHTML = items.map(it => `
    <tr>
      <td>${it.arrival_date} → ${it.departure_date}</td>
      <td><strong>${escapeHtml(it.property_name || '—')}</strong></td>
      <td><span class="badge ${it.status || ''}">${statusLabel(it.status)}</span></td>
      <td><span class="pill">${escapeHtml(String(it.id))}</span></td>
      <td style="text-align:right">
        <button class="btn" data-open="${it.id}">Ouvrir</button>
      </td>
    </tr>
  `).join('');

  // bind open buttons
  [...tbody.querySelectorAll('button[data-open]')].forEach(btn => {
    btn.onclick = () => loadDetail(btn.getAttribute('data-open'));
  });
}

async function loadArrivals() {
  if (!(await requireAuth())) return;
  const out = await api('/.netlify/functions/admin-list-arrivals', {
    admin_token: adminToken,
    date_from: $('from').value,
    date_to: $('to').value,
  });
  renderArrivals(out.arrivals || []);
}

function renderDrawer(out) {
  // Best-effort: we don’t know exact shape; show clean summary + JSON for now
  const r = out.reservation || out.checkin_reservation || out.data?.reservation || null;
  const property = out.property || out.data?.property || null;
  const guests = out.guests || out.data?.guests || [];

  $('dTitle').textContent = property?.name ? `Dossier • ${property.name}` : 'Dossier check-in';
  $('dSub').textContent = r ? `${r.arrival_date} → ${r.departure_date}` : '—';

  const kpis = [];
  if (r?.status) kpis.push({ label: 'Statut', value: statusLabel(r.status) });
  if (r?.id) kpis.push({ label: 'Reservation ID', value: r.id });
  kpis.push({ label: 'Voyageurs', value: String(guests?.length || 0) });

  $('dKpis').innerHTML = kpis.map(k => `
    <div class="kpi">
      <div class="kpiLabel">${escapeHtml(k.label)}</div>
      <div class="kpiValue">${escapeHtml(String(k.value))}</div>
    </div>
  `).join('');

  $('dGuests').innerHTML = (guests || []).length
    ? guests.map((g, i) => `
      <div class="item">
        <strong>${escapeHtml((g.first_name || '') + ' ' + (g.last_name || '')) || `Voyageur ${i+1}`}</strong>
        <div class="sub">${escapeHtml([g.nationality, g.id_type, g.id_number].filter(Boolean).join(' • '))}</div>
      </div>
    `).join('')
    : `<div class="hint">Aucun voyageur enregistré.</div>`;

  $('detail').textContent = JSON.stringify(out, null, 2);
}

async function loadDetail(reservationId) {
  if (!(await requireAuth())) return;
  const out = await api('/.netlify/functions/admin-get-reservation', {
    admin_token: adminToken,
    reservation_id: reservationId,
  });
  renderDrawer(out);
  openDrawer();
}

function setDefaultDates() {
  const t = todayISO();
  $('from').value = t;
  $('to').value = t;
  $('arrival').value = t;
  $('departure').value = t;
}

function escapeHtml(s) {
  return String(s ?? '')
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'","&#039;");
}

async function initAuthed() {
  await loadProperties().catch(e => toast(e.message || String(e)));
  await loadArrivals().catch(e => toast(e.message || String(e)));
}

const RECENT_KEY = "cz_recent_checkin_links";

function getRecent() {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) || "[]"); }
  catch { return []; }
}

function setRecent(items) {
  localStorage.setItem(RECENT_KEY, JSON.stringify(items.slice(0, 20)));
}

function renderRecent() {
  const box = $('recentLinks');
  if (!box) return;

  const items = getRecent();
  if (!items.length) {
    box.innerHTML = `<div class="hint">Aucun lien créé récemment.</div>`;
    return;
  }

  box.innerHTML = items.map(it => `
    <div class="recentItem">
      <div class="meta">
        <strong>${escapeHtml(it.property_name || 'Logement')}</strong>
        <span>${escapeHtml(it.arrival_date)} → ${escapeHtml(it.departure_date)}</span>
      </div>
      <button class="btn" data-copy="${escapeHtml(it.link)}">Copier</button>
    </div>
  `).join('');

  [...box.querySelectorAll('button[data-copy]')].forEach(btn => {
    btn.onclick = async () => {
      await navigator.clipboard.writeText(btn.getAttribute('data-copy'));
      toast("Copié ✅");
    };
  });
}


document.addEventListener('DOMContentLoaded', async () => {
  setDefaultDates();
  setAuthUI();

  $('btnOpenLogin').onclick = openLogin;
  $('btnCancelLogin').onclick = closeLogin;
  $('btnLogin').onclick = () => login();
  $('btnLogout').onclick = logout;

  $('btnLoadProps').onclick = () => loadProperties().catch(e => toast(e.message || String(e)));
  $('btnCreateLink').onclick = () => createCheckinLink().catch(e => toast(e.message || String(e)));
  $('btnCopyLink').onclick = () => copyLink();
  $('btnLoad').onclick = () => loadArrivals().catch(e => toast(e.message || String(e)));

  $('btnCloseDrawer').onclick = closeDrawer;

  $('btnClearRecent').onclick = () => { setRecent([]); renderRecent(); toast("Historique vidé"); };
renderRecent();


  // Close modal on overlay click
  $('loginModal').addEventListener('click', (e) => {
    if (e.target === $('loginModal')) closeLogin();
  });

  // Close drawer on ESC
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeLogin();
      closeDrawer();
    }
  });

  // Auto: if no token => open modal. if token => init.
  if (!adminToken) openLogin();
  else await initAuthed();
});
