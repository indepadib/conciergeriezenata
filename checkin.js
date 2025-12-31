/* Check-in digital – Conciergerie Zenata
   Front 100% statique : tout passe par Netlify Functions.
*/

const $ = (id) => document.getElementById(id);

function must(id) {
  const el = $(id);
  if (!el) throw new Error(`ID manquant dans checkin.html: #${id}`);
  return el;
}

function safeText(el, txt) {
  if (el) el.textContent = txt ?? '';
}

/* ---------------- Screens & Steps ---------------- */

let SCREENS = {};
const STEPS = [
  { key: 'consent',  label: 'Infos' },
  { key: 'guest',    label: 'Voyageur' },
  { key: 'group',    label: 'Voyageurs' },
  { key: 'couple',   label: 'Couple' },
  { key: 'contract', label: 'Contrat' },
  { key: 'sign',     label: 'Signature' },
  { key: 'done',     label: 'Accès' },
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
  acceptedContract: false,
};

/* ---------------- Helpers ---------------- */

function tokenFromUrl() {
  // support /checkin/<token> or ?t=<token>
  const path = location.pathname || '';
  const m = path.match(/\/checkin\/([^\/\?]+)$/);
  if (m && m[1]) return decodeURIComponent(m[1]);
  const t = new URLSearchParams(location.search).get('t');
  return t ? t.trim() : null;
}

function getReservationId() {
  // Robust across formats
  return (
    state.reservation?.id ||
    state.reservation?.reservation_id ||
    state.reservation?.reservationId ||
    state.reservation_id ||
    null
  );
}

function showScreen(name) {
  Object.values(SCREENS).filter(Boolean).forEach(el => el.classList.add('cz-hide'));
  const target = SCREENS[name];
  if (!target) {
    console.error("Screen not found:", name, SCREENS);
    return;
  }
  target.classList.remove('cz-hide');
  renderSteps(name);

  // Progress UI if present
  const map = window.__czProgress || {};
  const meta = map[name];
  if (meta) {
    const total = 7;
    const pct = Math.round((meta.i / total) * 100);
    const fill = $('progressFill');
    const title = $('progressTitle');
    const step = $('progressStep');
    if (fill) fill.style.width = pct + '%';
    if (title) title.textContent = meta.t;
    if (step) step.textContent = `${meta.i}/${total}`;
  }
}

function renderSteps(activeKey) {
  const wrap = $('steps');
  if (!wrap) return;
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

// Compress images to avoid Netlify "Internal Error" (payload too big)
async function imageFileToJpegDataUrl(file, { maxDim = 1600, quality = 0.78 } = {}) {
  if (!file) return null;

  if (file.type === 'application/pdf') {
    // PDF: keep as-is (but size limited elsewhere)
    return await fileToDataUrl(file);
  }
  if (!file.type.startsWith('image/')) {
    return await fileToDataUrl(file);
  }

  const img = new Image();
  img.src = URL.createObjectURL(file);
  await img.decode();

  let w = img.width, h = img.height;
  const scale = Math.min(1, maxDim / Math.max(w, h));
  w = Math.round(w * scale);
  h = Math.round(h * scale);

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, w, h);

  return canvas.toDataURL('image/jpeg', quality);
}

/* ---------------- Optional: lightweight ID validation ---------------- */

async function loadImageToCanvas(file) {
  if (!file?.type?.startsWith('image/')) return null;

  const img = new Image();
  img.src = URL.createObjectURL(file);
  await img.decode();

  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;

  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);

  return { canvas, ctx, width: img.width, height: img.height };
}

function analyzeBrightnessContrast(ctx, w, h) {
  const data = ctx.getImageData(0, 0, w, h).data;
  let sum = 0, sumSq = 0, n = w * h;

  for (let i = 0; i < data.length; i += 4) {
    const v = (data[i] + data[i+1] + data[i+2]) / 3;
    sum += v;
    sumSq += v * v;
  }
  const mean = sum / n;
  const variance = (sumSq / n) - (mean * mean);
  return { mean, variance };
}

function checkGeometry(w, h) {
  const ratio = w / h;
  if (w < 900) return "Image trop petite (photo trop éloignée).";
  if (ratio < 1.2 || ratio > 2.0) return "Cadrage incorrect. Merci de photographier la carte à l’horizontale.";
  return null;
}

async function validateIdDocument(file) {
  if (!file) throw new Error("La pièce d’identité est obligatoire.");
  if (!file.type.startsWith('image/') && file.type !== 'application/pdf') {
    throw new Error("Format non autorisé.");
  }

  // Size guardrails (avoid Netlify internal error)
  const MAX_PDF_MB = 2;
  const MAX_IMG_MB = 8;

  if (file.type === 'application/pdf' && file.size > MAX_PDF_MB * 1024 * 1024) {
    throw new Error(`PDF trop lourd (max ${MAX_PDF_MB}MB). Merci de prendre une photo.`);
  }
  if (file.type.startsWith('image/') && file.size > MAX_IMG_MB * 1024 * 1024) {
    throw new Error(`Image trop lourde (max ${MAX_IMG_MB}MB). Merci de reprendre la photo.`);
  }

  // PDF: server/manual check
  if (file.type === 'application/pdf') return { status: "ok", note: "PDF reçu (vérification manuelle)." };

  const img = await loadImageToCanvas(file);
  const geoError = checkGeometry(img.width, img.height);
  if (geoError) throw new Error(geoError);

  const { mean, variance } = analyzeBrightnessContrast(img.ctx, img.width, img.height);
  if (mean < 60) throw new Error("Image trop sombre. Merci de reprendre la photo.");
  if (mean > 220) throw new Error("Image trop claire / surexposée.");
  if (variance < 500) throw new Error("Image floue ou peu lisible.");

  return { status: "ok", note: "Document conforme." };
}

/* ---------------- Signature ---------------- */

function createSignaturePad(canvasId = 'sig') {
  const canvas = must(canvasId);
  const ctx = canvas.getContext('2d');

  let drawing = false;
  let last = null;

  function resize() {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }

  function getPos(e) {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function down(e) {
    drawing = true;
    last = getPos(e);
    canvas.setPointerCapture?.(e.pointerId);
    e.preventDefault();
  }

  function move(e) {
    if (!drawing) return;
    const p = getPos(e);
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last = p;
    e.preventDefault();
  }

  function up(e) {
    drawing = false;
    last = null;
    e.preventDefault();
  }

  canvas.addEventListener('pointerdown', down);
  canvas.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  window.addEventListener('resize', resize);

  function clear() {
    ctx.setTransform(1,0,0,1,0,0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function exportPng() {
    return canvas.toDataURL('image/png');
  }

  return { resize, clear, exportPng };
}

/* ---------------- Guest Forms ---------------- */

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
  const missing = required.filter(([id]) => !$(id)?.value || !String($(id).value).trim());
  if (missing.length) throw new Error(`Champs manquants: ${missing.map(x=>x[1]).join(', ')}`);
}

function renderGuestList() {
  const box = $('guestList');
  if (!box) return;
  box.innerHTML = '';
  state.guests.forEach((g, i) => {
    const el = document.createElement('div');
    el.className = 'cz-item';
    el.innerHTML = `<strong>${(g.first_name||'')} ${(g.last_name||'')}</strong>
      <div class="cz-muted">${[g.nationality, g.id_type, g.id_number].filter(Boolean).join(' • ')}</div>`;
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

  // ensure required ids exist (avoid silent null errors)
  [
    'guestIndexLabel',
    'g_last','g_first','g_sex','g_nationality','g_dob',
    'g_res_country','g_res_city','g_address',
    'g_id_type','g_id_number',
    'doc_front','doc_back'
  ].forEach(id => must(id));

  must('guestIndexLabel').textContent = `${i+1}/${state.guests.length}`;

  must('g_last').value = g.last_name || '';
  must('g_first').value = g.first_name || '';
  must('g_sex').value = g.sex || '';
  must('g_nationality').value = g.nationality || '';
  must('g_dob').value = g.dob || '';
  must('g_res_country').value = g.res_country || '';
  must('g_res_city').value = g.res_city || '';
  must('g_address').value = g.address || '';
  must('g_id_type').value = g.id_type || '';
  must('g_id_number').value = g.id_number || '';

  // clear file inputs
  must('doc_front').value = '';
  must('doc_back').value = '';
}

function readGuestFromForm() {
  return {
    last_name: must('g_last').value.trim(),
    first_name: must('g_first').value.trim(),
    sex: must('g_sex').value,
    nationality: must('g_nationality').value.trim(),
    dob: must('g_dob').value,
    res_country: must('g_res_country').value.trim(),
    res_city: must('g_res_city').value.trim(),
    address: must('g_address').value.trim(),
    id_type: must('g_id_type').value,
    id_number: must('g_id_number').value.trim(),
  };
}

/* ---------------- Init ---------------- */

async function init() {
  showScreen('loading');

  state.token = tokenFromUrl();
  if (!state.token) {
    safeText($('errorText'), "Lien incomplet. Vérifiez le lien de check-in.");
    return showScreen('error');
  }

  try {
    const initOut = await api('/.netlify/functions/checkin-init', { token: state.token });

    state.session = initOut.session;
    state.reservation = initOut.reservation;
    state.property = initOut.property;

    state.requireMarriage = !!(initOut.property && initOut.property.require_marriage_cert_for_moroccan_couples);

    const propertyName = state.property?.name || '';
    if ($('propertyName')) $('propertyName').value = propertyName;
    safeText($('topPropertyName'), propertyName || '—');

    if ($('stayDates') && state.reservation) {
      $('stayDates').value = `${state.reservation.arrival_date} → ${state.reservation.departure_date}`;
    }

    // init guests
    state.guests = (initOut.guests?.length ? initOut.guests : [{ is_group_lead: true }]);
    state.currentGuestIndex = 0;

    showScreen('consent');
  } catch (e) {
    console.error(e);
    safeText($('errorText'), e.message || String(e));
    showScreen('error');
  }
}

/* ---------------- Main wiring ---------------- */

document.addEventListener('DOMContentLoaded', async () => {
  // Screens map
  SCREENS = {
    loading: $('screen-loading'),
    error: $('screen-error'),
    consent: $('screen-consent'),
    guest: $('screen-guest'),
    group: $('screen-group'),
    couple: $('screen-couple'),
    contract: $('screen-contract'),
    sign: $('screen-sign'),
    done: $('screen-done'),
  };

  // Signature pad
  const sigPad = createSignaturePad('sig');
  if ($('btnClearSig')) $('btnClearSig').onclick = () => sigPad.clear();

  // Contract strict scroll gating
  const contractScroll = $('contractScroll');
  const acceptWrap = $('contractAcceptWrap');
  const acceptCheckbox = $('acceptContract');
  const btnToSignFromContract = $('btnToSignFromContract');

  let contractScrolledToBottom = false;

  if (acceptWrap) acceptWrap.classList.add('cz-disabled');
  if (acceptCheckbox) acceptCheckbox.disabled = true;
  if (btnToSignFromContract) btnToSignFromContract.disabled = true;

  if (contractScroll) {
    contractScroll.addEventListener('scroll', () => {
      const nearBottom =
        contractScroll.scrollTop + contractScroll.clientHeight >=
        contractScroll.scrollHeight - 10;

      if (nearBottom && !contractScrolledToBottom) {
        contractScrolledToBottom = true;
        if (acceptWrap) acceptWrap.classList.remove('cz-disabled');
        if (acceptCheckbox) acceptCheckbox.disabled = false;
      }
    });
  }

  if (acceptCheckbox && btnToSignFromContract) {
    acceptCheckbox.addEventListener('change', () => {
      btnToSignFromContract.disabled = !acceptCheckbox.checked;
    });
  }

  // Consent -> Guest
  if ($('btnStart')) $('btnStart').onclick = () => {
    if (!$('consent')?.checked) return alert("Veuillez accepter avant de continuer.");
    loadGuestToForm(0);
    showScreen('guest');
  };

  // Guest back
  if ($('btnPrevGuest')) $('btnPrevGuest').onclick = () => {
    if (state.currentGuestIndex === 0) return showScreen('consent');
    showScreen('group');
  };

  // Save guest
  if ($('btnSaveGuest')) $('btnSaveGuest').onclick = async () => {
    try {
      validateGuestForm();

      const reservationId = getReservationId();
      if (!reservationId) {
        console.error("Reservation object =", state.reservation);
        throw new Error("reservation_id introuvable. Utilise un lien check-in généré par l'admin.");
      }

      const guest = readGuestFromForm();

      const frontFile = $('doc_front')?.files?.[0];
      const backFile = $('doc_back')?.files?.[0] || null;

      await validateIdDocument(frontFile);

      // Compress images to avoid Netlify internal error
      const front = await imageFileToJpegDataUrl(frontFile, { maxDim: 1600, quality: 0.78 });
      const back = backFile ? await imageFileToJpegDataUrl(backFile, { maxDim: 1600, quality: 0.78 }) : null;

      state.guests[state.currentGuestIndex] = {
        ...state.guests[state.currentGuestIndex],
        ...guest
      };

      // Backward-compatible payload (old + new)
      await api('/.netlify/functions/checkin-save', {
        // old
        session: state.session,
        token: state.token,
        reservation_id: reservationId,
        guest_index: state.currentGuestIndex,
        guest: state.guests[state.currentGuestIndex],
        documents: { id_front: front, id_back: back },

        // new (if function expects step/payload)
        step: "guest",
        payload: {
          reservation_id: reservationId,
          reservation: { id: reservationId },
          guests: [{
            guest_index: state.currentGuestIndex,
            ...state.guests[state.currentGuestIndex],
            docs: { id_front: front, id_back: back },
            documents: { id_front: front, id_back: back },
          }]
        }
      });

      renderGuestList();
      showScreen('group');
    } catch (e) {
      console.error(e);
      alert(e.message || String(e));
    }
  };

  // Add guest
  if ($('btnAddGuest')) $('btnAddGuest').onclick = () => {
    state.guests.push({});
    state.currentGuestIndex = state.guests.length - 1;
    loadGuestToForm(state.currentGuestIndex);
    showScreen('guest');
  };

  // To Couple
  if ($('btnToCouple')) $('btnToCouple').onclick = () => {
    if (!state.guests.length) return alert("Ajoutez au moins un voyageur.");
    showScreen('couple');

    // marriage UI
    if ($('isMoroccanCouple')) $('isMoroccanCouple').checked = !!state.isMoroccanCouple;
    const box = $('marriageBox');
    const hint = $('marriageHint');
    if (hint) hint.textContent = state.requireMarriage ? "(requis pour ce logement)" : "(optionnel)";
    if (box) box.classList.toggle('cz-hide', !$('isMoroccanCouple')?.checked);
  };

  if ($('isMoroccanCouple')) $('isMoroccanCouple').onchange = () => {
    state.isMoroccanCouple = !!$('isMoroccanCouple')?.checked;
    const box = $('marriageBox');
    if (box) box.classList.toggle('cz-hide', !state.isMoroccanCouple);
  };

  // Back to group
  if ($('btnBackToGroup')) $('btnBackToGroup').onclick = () => showScreen('group');

  // Couple -> Contract
  if ($('btnToSign')) $('btnToSign').onclick = () => {
    showScreen('contract');
    // reset contract gating each time entering contract
    contractScrolledToBottom = false;
    if (contractScroll) contractScroll.scrollTop = 0;
    if (acceptWrap) acceptWrap.classList.add('cz-disabled');
    if (acceptCheckbox) { acceptCheckbox.checked = false; acceptCheckbox.disabled = true; }
    if (btnToSignFromContract) btnToSignFromContract.disabled = true;
    state.acceptedContract = false;
  };

  // Contract back
  if ($('btnBackToCouple')) $('btnBackToCouple').onclick = () => showScreen('couple');

  // Contract -> Sign
  if (btnToSignFromContract) btnToSignFromContract.onclick = () => {
    if (!acceptCheckbox?.checked) {
      alert("Vous devez accepter le contrat pour continuer.");
      return;
    }
    state.acceptedContract = true;
    showScreen('sign');

    // Resize canvas once visible
    sigPad.resize();
    requestAnimationFrame(() => sigPad.resize());
  };

  // Submit final
  if ($('btnSubmit')) $('btnSubmit').onclick = async () => {
    try {
      const reservationId = getReservationId();
      if (!reservationId) throw new Error("reservation_id introuvable. Utilise un lien check-in généré par l'admin.");

      if (!state.acceptedContract) {
        alert("Vous devez accepter le contrat d’engagement pour continuer.");
        return;
      }

      const marriage = (state.isMoroccanCouple && $('doc_marriage')?.files?.[0])
        ? await imageFileToJpegDataUrl($('doc_marriage').files[0], { maxDim: 1600, quality: 0.78 })
        : null;

      state.signaturePngDataUrl = sigPad.exportPng();

      const out = await api('/.netlify/functions/checkin-submit', {
        session: state.session,
        token: state.token,
        reservation_id: reservationId,
        guests: state.guests,
        is_moroccan_couple: !!state.isMoroccanCouple,
        documents: { marriage_certificate: marriage },
        signature_png: state.signaturePngDataUrl,

        // contract proof
        accepted_contract: true,
        accepted_contract_version: "v1",
      });

      // instructions
      if ($('instructions')) {
        $('instructions').innerHTML = out.instructions_html || "<p>Instructions indisponibles pour le moment.</p>";
      }

      // optional doc links (if your backend returns them)
      const links = [];
      if (out.receipt_pdf_url) links.push({ label: "Fiche (PDF)", url: out.receipt_pdf_url });
      if (out.files?.id_front_url) links.push({ label: "Pièce d’identité – Face 1", url: out.files.id_front_url });
      if (out.files?.id_back_url) links.push({ label: "Pièce d’identité – Face 2", url: out.files.id_back_url });
      if (out.files?.marriage_url) links.push({ label: "Acte de mariage", url: out.files.marriage_url });
      if (out.files?.signature_url) links.push({ label: "Signature (PNG)", url: out.files.signature_url });

      const box = $('docLinks');
      if (box) {
        box.innerHTML = links.length
          ? links.map(x => `<a class="cz-docBtn" href="${x.url}" target="_blank" rel="noopener">${x.label}<span>Ouvrir</span></a>`).join('')
          : `<div class="cz-sub">Aucun document à afficher.</div>`;
      }

      showScreen('done');
    } catch (e) {
      console.error(e);
      alert(e.message || String(e));
    }
  };

  // Start
  await init();
});
