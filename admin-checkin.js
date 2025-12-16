/* Admin Check-in – Conciergerie Zenata
   UI premium + modal login + arrivals table + drawer detail + signed docs + police fiche (print/PDF)
*/

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

  if (!res.ok) {
    const msg = (json && json.error) ? json.error : (txt || `Erreur ${res.status}`);
    throw new Error(msg);
  }
  return json ?? {};
}

function escapeHtml(s) {
  return String(s ?? '')
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'","&#039;");
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

function statusLabel(s) {
  const map = {
    sent: 'Lien envoyé',
    in_progress: 'En cours',
    submitted: 'Complété',
    issue: 'Problème'
  };
  return map[s] || s || '—';
}

/* ---------- Modal / Drawer ---------- */

function setAuthUI() {
  const isAuthed = !!adminToken;
  if ($('authState')) $('authState').textContent = isAuthed ? 'Connecté' : 'Non connecté';
  if ($('btnLogout')) $('btnLogout').style.display = isAuthed ? 'inline-flex' : 'none';
  if ($('btnOpenLogin')) $('btnOpenLogin').style.display = isAuthed ? 'none' : 'inline-flex';
}

function openLogin() {
  if (!$('loginModal')) return;
  if ($('loginError')) $('loginError').textContent = '';
  $('loginModal').classList.add('open');
  $('loginModal').setAttribute('aria-hidden', 'false');
  setTimeout(() => $('pw')?.focus(), 50);
}
function closeLogin() {
  if (!$('loginModal')) return;
  $('loginModal').classList.remove('open');
  $('loginModal').setAttribute('aria-hidden', 'true');
}

function openDrawer() {
  if (!$('drawer')) return;
  $('drawer').classList.add('open');
  $('drawer').setAttribute('aria-hidden', 'false');
}
function closeDrawer() {
  if (!$('drawer')) return;
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
    if ($('loginError')) $('loginError').textContent = '';
    const pw = $('pw')?.value || '';
    if (!pw) {
      if ($('loginError')) $('loginError').textContent = "Mot de passe requis.";
      return;
    }

    const out = await api('/.netlify/functions/admin-login', { password: pw });
    adminToken = out.token;
    localStorage.setItem('cz_admin_checkin_token', adminToken);

    closeLogin();
    setAuthUI();
    toast('Connecté ✅');

    await initAuthed();
  } catch (e) {
    if ($('loginError')) $('loginError').textContent = e.message || String(e);
  }
}

function logout() {
  adminToken = null;
  localStorage.removeItem('cz_admin_checkin_token');
  setAuthUI();
  toast('Déconnecté');
  openLogin();
}

/* ---------- Recent links (localStorage) ---------- */

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
      try {
        await navigator.clipboard.writeText(btn.getAttribute('data-copy'));
        toast("Copié ✅");
      } catch {
        toast("Copie manuelle requise.");
      }
    };
  });
}

/* ---------- Properties / Create link ---------- */

async function loadProperties() {
  if (!(await requireAuth())) return;

  toast("Chargement des logements…");
  const out = await api('/.netlify/functions/admin-list-properties', { admin_token: adminToken });

  const sel = $('property_id');
  if (!sel) return;

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
    sel.value = props[0].id;
    toast(`✅ ${props.length} logement(s) chargés`);
  }
}

async function createCheckinLink() {
  if (!(await requireAuth())) return;

  const propertyId = $('property_id')?.value;
  const arrival = $('arrival')?.value;
  const departure = $('departure')?.value;

  if (!propertyId) return toast("Choisis un logement.");
  if (!arrival || !departure) return toast("Mets arrivée + départ.");
  if (departure <= arrival) return toast("Départ doit être après l’arrivée.");

  const out = await api('/.netlify/functions/admin-create-reservation', {
    admin_token: adminToken,
    property_id: propertyId,
    arrival_date: arrival,
    departure_date: departure
  });

  if ($('generatedLink')) $('generatedLink').value = out.link || '';
  toast("Lien créé ✅");

  // Save to recent
  const selectedOpt = $('property_id')?.selectedOptions?.[0];
  const propertyName = selectedOpt ? selectedOpt.textContent : propertyId;

  const items = getRecent();
  items.unshift({
    link: out.link,
    property_id: propertyId,
    property_name: propertyName,
    arrival_date: arrival,
    departure_date: departure,
    created_at: new Date().toISOString()
  });
  setRecent(items);
  renderRecent();
}

async function copyLink() {
  const v = $('generatedLink')?.value;
  if (!v) return toast("Aucun lien à copier.");
  try {
    await navigator.clipboard.writeText(v);
    toast("Copié ✅");
  } catch {
    toast("Copie manuelle requise.");
  }
}

/* ---------- Arrivals table ---------- */

function renderArrivals(items) {
  const tbody = $('list');
  const empty = $('emptyState');
  if (!tbody) return;

  if (!items || !items.length) {
    tbody.innerHTML = '';
    if (empty) empty.style.display = 'flex';
    return;
  }
  if (empty) empty.style.display = 'none';

  tbody.innerHTML = items.map(it => `
    <tr>
      <td>${escapeHtml(it.arrival_date)} → ${escapeHtml(it.departure_date)}</td>
      <td><strong>${escapeHtml(it.property_name || '—')}</strong></td>
      <td><span class="badge ${escapeHtml(it.status || '')}">${escapeHtml(statusLabel(it.status))}</span></td>
      <td><span class="pill">${escapeHtml(String(it.id))}</span></td>
      <td style="text-align:right">
        <button class="btn" data-open="${escapeHtml(String(it.id))}">Ouvrir</button>
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
    date_from: $('from')?.value,
    date_to: $('to')?.value,
  });

  renderArrivals(out.arrivals || []);
}

/* ---------- Drawer detail ---------- */

async function loadDetail(reservationId) {
  if (!(await requireAuth())) return;

  try {
    const out = await api('/.netlify/functions/admin-get-reservation', {
      admin_token: adminToken,
      reservation_id: reservationId,
    });

    renderDrawer(out, reservationId);
    openDrawer();
  } catch (e) {
    console.error(e);
    toast(e.message || String(e));
  }
}

function renderDrawer(out, reservationId) {
  const r = out.reservation || null;
  const guests = out.guests || [];
  const signed = out.signed_urls || {};
  const resDocs = signed.reservation || {};
  const guestDocs = signed.guests || {};

  if ($('dTitle')) $('dTitle').textContent = `Dossier check-in`;
  if ($('dSub')) $('dSub').textContent = r ? `${r.arrival_date} → ${r.departure_date}` : '—';

  const kpis = [];
  if (r?.status) kpis.push({ label: 'Statut', value: statusLabel(r.status) });
  if (r?.id) kpis.push({ label: 'Reservation ID', value: r.id });
  kpis.push({ label: 'Voyageurs', value: String(guests.length) });

  if ($('dKpis')) {
    $('dKpis').innerHTML = kpis.map(k => `
      <div class="kpi">
        <div class="kpiLabel">${escapeHtml(k.label)}</div>
        <div class="kpiValue">${escapeHtml(String(k.value))}</div>
      </div>
    `).join('');
  }

   const actionsBox = document.getElementById('dActions');
      if (actionsBox) {
        actionsBox.innerHTML = `
          <button class="btn" id="btnPoliceAll">🧾 Dossier police (tous)</button>
        `;
        document.getElementById('btnPoliceAll').onclick = async () => {
          const win = window.open('', '_blank');
          if (!win) return toast("Pop-up bloquée.");
          const html = await fetch('/.netlify/functions/admin-police-fiche', {
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body: JSON.stringify({ admin_token: adminToken, reservation_id: reservationId })
          }).then(r => r.text());
          win.document.open(); win.document.write(html); win.document.close();
        };
      }

   
  // ===== Guests with docs + police fiche button =====
  if ($('dGuests')) {
    $('dGuests').innerHTML = guests.length ? guests.map((g, i) => {
      const gd = guestDocs[g.id] || {};
      const docBtns = [
        gd.id_front ? docBtn('ID • Face 1', gd.id_front) : '',
        gd.id_back ? docBtn('ID • Face 2', gd.id_back) : '',
      ].filter(Boolean).join(' ');

      return `
        <div class="item">
          <strong>${escapeHtml((g.first_name || '') + ' ' + (g.last_name || '')) || `Voyageur ${i+1}`}</strong>
          <div class="sub">${escapeHtml([g.nationality, g.id_type, g.id_number].filter(Boolean).join(' • '))}</div>

          <div style="margin-top:8px; display:flex; gap:8px; flex-wrap:wrap">
            ${docBtns}
            <button class="btn" data-fiche="${escapeHtml(String(g.id))}">🧾 Fiche police</button>
          </div>
        </div>
      `;
    }).join('') : `<div class="hint">Aucun voyageur enregistré.</div>`;
  }

  // ===== Reservation docs area + raw json =====
  const resButtons = [
    resDocs.marriage_certificate ? docBtn('Acte de mariage', resDocs.marriage_certificate) : '',
    resDocs.signature_png ? docBtn('Signature (PNG)', resDocs.signature_png) : '',
  ].filter(Boolean).join(' ');

  if ($('detail')) {
    $('detail').innerHTML = `
      <div class="section">
        <div class="sectionTitle">Documents réservation</div>
        ${resButtons ? `<div class="list">${resButtons}</div>` : `<div class="hint">Aucun document réservation.</div>`}
      </div>

      <div class="section" style="margin-top:14px">
        <div class="sectionTitle">Données brutes</div>
        <pre class="pre">${escapeHtml(JSON.stringify(out, null, 2))}</pre>
      </div>
    `;
  }

  // bind police fiche buttons
  document.querySelectorAll('[data-fiche]').forEach(btn => {
    btn.onclick = async () => {
      const guestId = btn.getAttribute('data-fiche');
      try {
        const win = window.open('', '_blank');
        if (!win) return toast("Pop-up bloquée par le navigateur.");

        const html = await fetch('/.netlify/functions/admin-police-fiche', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            admin_token: adminToken,
            reservation_id: reservationId,
            guest_id: guestId
          })
        }).then(r => r.text());

        win.document.open();
        win.document.write(html);
        win.document.close();
      } catch (e) {
        console.error(e);
        toast(e.message || String(e));
      }
    };
  });

  function docBtn(label, url) {
    return `<a class="btn" href="${url}" target="_blank" rel="noopener"
      style="display:inline-flex;align-items:center;gap:8px;text-decoration:none">${escapeHtml(label)} ↗</a>`;
  }
}

/* ---------- Init ---------- */

function setDefaultDates() {
  const t = todayISO();
  if ($('from')) $('from').value = t;
  if ($('to')) $('to').value = t;
  if ($('arrival')) $('arrival').value = t;
  if ($('departure')) $('departure').value = t;
}

async function initAuthed() {
  await loadProperties().catch(e => toast(e.message || String(e)));
  await loadArrivals().catch(e => toast(e.message || String(e)));
}

document.addEventListener('DOMContentLoaded', async () => {
  setDefaultDates();
  setAuthUI();
  renderRecent();

  // Buttons
  $('btnOpenLogin')?.addEventListener('click', openLogin);
  $('btnCancelLogin')?.addEventListener('click', closeLogin);
  $('btnLogin')?.addEventListener('click', login);
  $('btnLogout')?.addEventListener('click', logout);

  $('btnLoadProps')?.addEventListener('click', () => loadProperties().catch(e => toast(e.message || String(e))));
  $('btnCreateLink')?.addEventListener('click', () => createCheckinLink().catch(e => toast(e.message || String(e))));
  $('btnCopyLink')?.addEventListener('click', copyLink);
  $('btnLoad')?.addEventListener('click', () => loadArrivals().catch(e => toast(e.message || String(e))));

  $('btnCloseDrawer')?.addEventListener('click', closeDrawer);

  $('btnClearRecent')?.addEventListener('click', () => {
    setRecent([]);
    renderRecent();
    toast("Historique vidé");
  });

  // Close modal on overlay click
  $('loginModal')?.addEventListener('click', (e) => {
    if (e.target === $('loginModal')) closeLogin();
  });

  // ESC closes modal/drawer
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeLogin();
      closeDrawer();
    }
  });

  // Auto init
  if (!adminToken) openLogin();
  else await initAuthed();
});

