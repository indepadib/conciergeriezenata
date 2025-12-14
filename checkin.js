/* Check-in digital – Conciergerie Zenata (MVP)
   Front 100% statique : tout passe par Netlify Functions.
*/

const $ = (id) => document.getElementById(id);

const SCREENS = {
  loading: $('screen-loading'),
  error: $('screen-error'),
  consent: $('screen-consent'),
  guest: $('screen-guest'),
  group: $('screen-group'),
  couple: $('screen-couple'),
  sign: $('screen-sign'),
  done: $('screen-done'),
};

const STEPS = [
  { key: 'consent', label: 'Infos' },
  { key: 'guest', label: 'Voyageur 1' },
  { key: 'group', label: 'Voyageurs' },
  { key: 'couple', label: 'Couple' },
  { key: 'sign', label: 'Signature' },
  { key: 'done', label: 'Accès' },
];

let state = {
  token: null,
  session: null,
  reservation: null,
  property: null,
  guests: [],
  currentGuestIndex: 0,
  requireMarriage: false,
  isMoroccanCouple: false,
  signaturePngDataUrl: null,
};

function tokenFromUrl() {
  // support /checkin/<token> (via redirect) ou ?t=<token>
  const path = location.pathname || '';
  const m = path.match(/\/checkin\/([^\/\?]+)$/);
  if (m && m[1]) return decodeURIComponent(m[1]);
  const t = new URLSearchParams(location.search).get('t');
  return t ? t.trim() : null;
}

function showScreen(name) {
  Object.values(SCREENS).forEach(el => el.classList.add('cz-hide'));
  SCREENS[name].classList.remove('cz-hide');
  renderSteps(name);
}

function renderSteps(activeKey) {
  const wrap = $('steps');
  wrap.innerHTML = '';
  STEPS.forEach(s => {
    const el = document.createElement('div');
    el.className = 'cz-step' + (s.key === activeKey ? ' on' : '');
    el.textContent = s.label;
    wrap.appendChild(el);
  });
}

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

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    if (!file) return resolve(null);
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error('Impossible de lire le fichier'));
    r.readAsDataURL(file);
  });
}

/* ------- Signature canvas ------- */
function initSignature() {
  const canvas = $('sig');
  const ctx = canvas.getContext('2d');

  function resize() {
    // retina-safe
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(rect.width * dpr);
    canvas.height = Math.floor(rect.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
  }
  resize();
  window.addEventListener('resize', resize);

  let drawing = false;
  let last = null;

  function pos(e) {
    const rect = canvas.getBoundingClientRect();
    const t = (e.touches && e.touches[0]) ? e.touches[0] : e;
    return { x: t.clientX - rect.left, y: t.clientY - rect.top };
  }

  function down(e) { drawing = true; last = pos(e); e.preventDefault(); }
  function move(e) {
    if (!drawing) return;
    const p = pos(e);
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last = p;
    e.preventDefault();
  }
  function up() { drawing = false; last = null; }

  canvas.addEventListener('mousedown', down);
  canvas.addEventListener('mousemove', move);
  window.addEventListener('mouseup', up);

  canvas.addEventListener('touchstart', down, { passive:false });
  canvas.addEventListener('touchmove', move, { passive:false });
  window.addEventListener('touchend', up);

  $('btnClearSig').onclick = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  return () => {
    // export signature
    const png = canvas.toDataURL('image/png');
    return png;
  };
}

function validateGuestForm() {
  const required = [
    ['g_last','Nom'],
    ['g_first','Prénom'],
    ['g_sex','Sexe'],
    ['g_nationality','Nationalité'],
    ['g_dob','Date de naissance'],
    ['g_res_country','Pays de résidence'],
    ['g_id_type','Type de pièce'],
    ['g_id_number','Numéro de pièce'],
  ];
  const missing = required.filter(([id]) => !$(id).value || !String($(id).value).trim());
  if (missing.length) throw new Error(`Champs manquants: ${missing.map(x=>x[1]).join(', ')}`);
}

function renderGuestList() {
  const box = $('guestList');
  box.innerHTML = '';
  state.guests.forEach((g, i) => {
    const el = document.createElement('div');
    el.className = 'cz-item';
    el.innerHTML = `<strong>${g.first_name} ${g.last_name}</strong><div class="cz-muted">${g.nationality} • ${g.id_type} ${g.id_number}</div>`;
    el.onclick = () => {
      state.currentGuestIndex = i;
      loadGuestToForm(i);
      showScreen('guest');
    };
    box.appendChild(el);
  });
}

function loadGuestToForm(i) {
  const g = state.guests[i] || {};
  $('guestIndexLabel').textContent = `${i+1}/${state.guests.length}`;
  $('g_last').value = g.last_name || '';
  $('g_first').value = g.first_name || '';
  $('g_sex').value = g.sex || '';
  $('g_nationality').value = g.nationality || '';
  $('g_dob').value = g.dob || '';
  $('g_res_country').value = g.res_country || '';
  $('g_res_city').value = g.res_city || '';
  $('g_address').value = g.address || '';
  $('g_id_type').value = g.id_type || '';
  $('g_id_number').value = g.id_number || '';
  $('doc_front').value = '';
  $('doc_back').value = '';
}

function readGuestFromForm() {
  return {
    last_name: $('g_last').value.trim(),
    first_name: $('g_first').value.trim(),
    sex: $('g_sex').value,
    nationality: $('g_nationality').value.trim(),
    dob: $('g_dob').value,
    res_country: $('g_res_country').value.trim(),
    res_city: $('g_res_city').value.trim(),
    address: $('g_address').value.trim(),
    id_type: $('g_id_type').value,
    id_number: $('g_id_number').value.trim(),
  };
}

async function init() {
  showScreen('loading');

  state.token = tokenFromUrl();
  if (!state.token) {
    $('errorText').textContent = "Lien incomplet. Vérifiez le lien de check-in.";
    return showScreen('error');
  }

  try {
    const init = await api('/.netlify/functions/checkin-init', { token: state.token });
    state.session = init.session;
    state.reservation = init.reservation;
    state.property = init.property;
    state.requireMarriage = !!(init.property && init.property.require_marriage_cert_for_moroccan_couples);

    $('propertyName').value = state.property?.name || '';
    $('stayDates').value = `${state.reservation.arrival_date} → ${state.reservation.departure_date}`;

    // init guests
    state.guests = init.guests?.length ? init.guests : [{
      is_group_lead: true
    }];
    state.currentGuestIndex = 0;

    showScreen('consent');
  } catch (e) {
    $('errorText').textContent = e.message || String(e);
    showScreen('error');
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  const exportSig = initSignature();

  $('btnStart').onclick = () => {
    if (!$('consent').checked) return alert("Veuillez accepter avant de continuer.");
    loadGuestToForm(0);
    showScreen('guest');
  };

  $('btnPrevGuest').onclick = () => {
    if (state.currentGuestIndex === 0) return showScreen('consent');
    showScreen('group');
  };

  $('btnSaveGuest').onclick = async () => {
    try {
      validateGuestForm();
      const guest = readGuestFromForm();

      const front = await fileToDataUrl($('doc_front').files[0]);
      const back = await fileToDataUrl($('doc_back').files[0]);

      state.guests[state.currentGuestIndex] = {
        ...state.guests[state.currentGuestIndex],
        ...guest
      };

      await api('/.netlify/functions/checkin-save', {
        session: state.session,
        token: state.token,
        reservation_id: state.reservation.id,
        guest_index: state.currentGuestIndex,
        guest: state.guests[state.currentGuestIndex],
        documents: { id_front: front, id_back: back },
      });

      renderGuestList();
      showScreen('group');
    } catch (e) {
      alert(e.message || String(e));
    }
  };

  $('btnAddGuest').onclick = () => {
    state.guests.push({});
    state.currentGuestIndex = state.guests.length - 1;
    loadGuestToForm(state.currentGuestIndex);
    showScreen('guest');
  };

  $('btnToCouple').onclick = () => {
    if (!state.guests.length) return alert("Ajoutez au moins un voyageur.");
    showScreen('couple');

    // marriage UI
    $('isMoroccanCouple').checked = !!state.isMoroccanCouple;
    const box = $('marriageBox');
    const hint = $('marriageHint');
    hint.textContent = state.requireMarriage ? "(requis pour ce logement)" : "(optionnel)";
    box.classList.toggle('cz-hide', !$('isMoroccanCouple').checked);
  };

  $('isMoroccanCouple').onchange = () => {
    state.isMoroccanCouple = $('isMoroccanCouple').checked;
    $('marriageBox').classList.toggle('cz-hide', !state.isMoroccanCouple);
  };

  $('btnBackToGroup').onclick = () => showScreen('group');

  $('btnToSign').onclick = () => {
    // Si requis : on ne bloque pas ici côté front (UX),
    // la function checkin-submit fera la validation serveur.
    showScreen('sign');
  };

  $('btnSubmit').onclick = async () => {
    try {
      const marriage = state.isMoroccanCouple ? await fileToDataUrl($('doc_marriage').files[0]) : null;
      state.signaturePngDataUrl = exportSig();

      const out = await api('/.netlify/functions/checkin-submit', {
        session: state.session,
        token: state.token,
        reservation_id: state.reservation.id,
        guests: state.guests,
        is_moroccan_couple: !!state.isMoroccanCouple,
        documents: { marriage_certificate: marriage },
        signature_png: state.signaturePngDataUrl,
      });

      // show instructions
      $('instructions').innerHTML = out.instructions_html || "<p>Instructions indisponibles pour le moment.</p>";
      showScreen('done');
    } catch (e) {
      alert(e.message || String(e));
    }
  };

  await init();
});
