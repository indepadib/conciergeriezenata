// =============================
//  CZ Finance - Admin (MVP v1)
// =============================

// 1) Configure supabaseClient
const supabase_URL = "https://ojgchrqtvkwzhjvwwftd.supabase.co";
const supabase_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9qZ2NocnF0dmt3emhqdnd3ZnRkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk2OTMxODEsImV4cCI6MjA3NTI2OTE4MX0.Ok7fj3QUs28Q8dOiNy6caSBmjcUmjFrZgmIvAnzJZ00";
/*************************************************
 * Finance Admin — finance.js (FULL)
 * - Supabase Auth + Admin gate (admin_users)
 * - Tabs navigation
 * - Expenses V2 (CRUD + receipt upload/download)
 *************************************************/

// IMPORTANT: keep supabase library loaded via CDN in index.html
// <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
const supabaseClient = window.supabase.createClient(supabase_URL, supabase_ANON_KEY);

const $ = (id) => document.getElementById(id);

function money(v){
  const n = Number(v || 0);
  return n.toLocaleString('fr-MA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " MAD";
}

function monthRange(yyyyMm){
  const [y, m] = (yyyyMm || "").split('-').map(Number);
  if(!y || !m) return null;
  const start = new Date(y, m - 1, 1);
  const end = new Date(y, m, 0);
  return { start: start.toISOString().slice(0,10), end: end.toISOString().slice(0,10) };
}

function escapeHtml(v){
  return String(v ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
}

function nightsBetween(start, end){
  if(!start || !end) return 0;
  const a = new Date(start + 'T00:00:00');
  const b = new Date(end + 'T00:00:00');
  const d = Math.round((b - a) / 86400000);
  return Math.max(0, d);
}

const QUICK_EXPENSE_ITEMS = [
  { label:'Netflix', category:'Abonnements', hint:'0 ou 25 DH' },
  { label:'Liquide vaisselle', category:'Cuisine', hint:'0–20 DH' },
  { label:'Éponge', category:'Cuisine', hint:'0–5 DH' },
  { label:'Essuie-tout', category:'Cuisine', hint:'0–10 DH' },
  { label:'Liquide machine à laver', category:'Linge', hint:'0–25 DH' },
  { label:'Clinex', category:'Accueil', hint:'0–20 DH' },
  { label:'Eau de javel', category:'Ménage', hint:'0–10 DH' },
  { label:'Eau Sanicroix', category:'Ménage', hint:'0–12 DH' },
  { label:'Bouteilles d’eau', category:'Accueil', hint:'0–25 DH' },
  { label:'Capsules', category:'Accueil', hint:'0–35 DH' },
  { label:'Bonbons', category:'Accueil', hint:'0–15 DH' },
  { label:'Chocolat', category:'Accueil', hint:'0–15 DH' },
  { label:'Fruits', category:'Accueil', hint:'0–20 DH' },
  { label:'Papier toilette', category:'Salle de bain', hint:'0–25 DH' },
  { label:'Gel douche', category:'Salle de bain', hint:'0–30 DH' },
  { label:'Shampoing', category:'Salle de bain', hint:'0–30 DH' },
  { label:'Savon mains', category:'Salle de bain', hint:'0–20 DH' },
  { label:'Sac poubelle', category:'Cuisine', hint:'0–20 DH' },
  { label:'Serpillère', category:'Ménage', hint:'0–30 DH' },
  { label:'Torchon', category:'Cuisine', hint:'0–25 DH' }
];

let nightRows = [];

function renderQuickExpenseGrid(targetId = 'quickExpenseGrid'){
  const box = $(targetId);
  if(!box) return;
  const groups = QUICK_EXPENSE_ITEMS.reduce((acc, item) => {
    (acc[item.category] ||= []).push(item);
    return acc;
  }, {});
  box.innerHTML = Object.entries(groups).map(([cat, items]) => `
    <div class="quick-group">
      <div class="quick-title">${escapeHtml(cat)}</div>
      ${items.map((it, idx) => {
        const placeholder = it.hint || '0';
        const valueAttr = it.defaultAmount ? ` value="${Number(it.defaultAmount)}"` : '';
        return `<div class="quick-row">
          <span>${escapeHtml(it.label)} <small>${escapeHtml(placeholder)}</small></span>
          <input data-qexp-desc="${escapeHtml(it.label)}" data-qexp-target="${escapeHtml(targetId)}" type="number" step="0.01" placeholder="${escapeHtml(placeholder)}"${valueAttr} />
        </div>`;
      }).join('')}
    </div>
  `).join('');
}

function renderQuickExpenses(){
  renderQuickExpenseGrid('quickExpenseGrid');
  renderQuickExpenseGrid('quickExpenseGridExpenses');
}

async function saveQuickExpenses(source = 'closing'){
  const isExpensesTab = source === 'expenses';
  const pid = isExpensesTab ? $('fProperty')?.value : $('cProperty')?.value;
  const m = isExpensesTab ? $('fMonth')?.value : $('cMonth')?.value;
  const msgEl = isExpensesTab ? $('quickExpenseMsgExpenses') : $('quickExpenseMsg');
  const target = isExpensesTab ? 'quickExpenseGridExpenses' : 'quickExpenseGrid';
  if(!pid || !m){ if(msgEl) msgEl.textContent = 'Choisis un bien et un mois.'; return; }
  const r = monthRange(m);
  if(!r) return;
  const inputs = [...document.querySelectorAll(`[data-qexp-target="${target}"]`)];
  const filled = inputs
    .map(input => ({ description: input.dataset.qexpDesc, amount: Number(input.value || 0) }))
    .filter(x => x.amount > 0);

  if(!filled.length){ if(msgEl) msgEl.textContent = 'Aucun montant renseigné.'; return; }

  // Dans l'écran Clôture, ces lignes sont des consommables du mois.
  // Elles doivent alimenter le champ "Consommables", pas "Dépenses refacturables".
  if(!isExpensesTab){
    const total = filled.reduce((s, x) => s + Number(x.amount || 0), 0);
    $('cConsumables').value = total.toFixed(2);
    calcClosing();
    if(msgEl) msgEl.textContent = `Total consommables reporté: ${money(total)} ✅. Clique ensuite sur Valider la clôture.`;
    return;
  }

  // Dans l'onglet Dépenses, on garde le comportement historique : insertion en dépenses refacturables.
  const rows = filled.map(x => ({
    property_id: pid,
    expense_date: r.end,
    description: x.description,
    amount: x.amount,
    bill_to_owner: true,
    owner_markup_rate: 0,
    locked: false
  }));

  if(msgEl) msgEl.textContent = 'Enregistrement…';
  const { error } = await supabaseClient.from('expenses').insert(rows);
  if(error){ if(msgEl) msgEl.textContent = 'Erreur: ' + error.message; return; }
  inputs.forEach(i => i.value = '');
  if(typeof loadMonthExpenses === 'function') await loadMonthExpenses();
  if(typeof calcClosing === 'function') calcClosing();
  if(typeof loadExpensesV2 === 'function') await loadExpensesV2();
  if(msgEl) msgEl.textContent = `${rows.length} dépense(s) ajoutée(s) ✅`;
}


  const consum = Number($('cConsumables').value||0);
  const exp = Number($('cExpenses').value||0);
  const commission = housing * COMMISSION_RATE;
  const net = housing - commission - consum - exp-cleaning;

  $('revTotalMsg').textContent = `Total revenus logement : ${money(housing)}`;
  $('sHousing').textContent = money(housing);
  $('sCommission').textContent = `-${money(commission)}`;
  $('sConsumables').textContent = `-${money(consum)}`;
  $('sExpenses').textContent = `-${money(exp)}`;
  $('sCleaning').textContent = `-${money(cleaning)}`;
  $('sNet').textContent = money(net);
  

  return { housing, commission, consum, exp, net };
}

async function loadClosingDefaults(){
  // properties dropdown
  await loadExpenseProperties(); // déjà existant → remplit EXP_PROPS
  $('cProperty').innerHTML = EXP_PROPS.map(p=>`<option value="${p.id}">${p.name}</option>`).join('');

  // month default
  const now = new Date();
  $('cMonth').value = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;

  // consommables forfait du bien
  $('cProperty').onchange = async () => {
    const pid = $('cProperty').value;
    const { data } = await supabaseClient
      .from('finance_settings')
      .select('consumables_flat_mad')
      .eq('property_id', pid)
      .maybeSingle();
    $('cConsumables').value = Number(data?.consumables_flat_mad||0);
    await loadMonthExpenses();
    await loadReservationsDetail();
    calcClosing();
  };

  $('cMonth').onchange = async () => {
    await loadMonthExpenses();
    await loadReservationsDetail();
    calcClosing();
    if(typeof loadClosingSaved === 'function') await loadClosingSaved();
  };

  renderQuickExpenses();
  renderNightRows();
  await loadReservationsDetail();
}

async function loadMonthExpenses(){
  const pid = $('cProperty').value;
  const m = $('cMonth').value;
  if(!pid || !m) return;

  const [y,mo] = m.split('-').map(Number);
  const start = `${y}-${String(mo).padStart(2,'0')}-01`;
  const end = new Date(y, mo, 0).toISOString().slice(0,10);

  const { data } = await supabaseClient
    .from('expenses')
    .select('amount,owner_markup_rate')
    .eq('property_id', pid)
    .gte('expense_date', start)
    .lte('expense_date', end)
    .eq('bill_to_owner', true);

  const total = (data||[]).reduce((s,x)=> s + Number(x.amount)*(1+Number(x.owner_markup_rate||0)), 0);
  $('cExpenses').value = total.toFixed(2);
}

async function saveClosing(){
  const pid = $('cProperty').value;
  const m = $('cMonth').value;
  if(!pid || !m){ $('closeMsg').textContent="Choisis un bien et un mois."; return; }

  const [y,mo] = m.split('-').map(Number);
  const start = `${y}-${String(mo).padStart(2,'0')}-01`;
  const end = new Date(y, mo, 0).toISOString().slice(0,10);

  // 0) Fetch owner_id from property (OBLIGATOIRE pour ton NOT NULL)
  const pRes = await supabaseClient
    .from('properties')
    .select('owner_id')
    .eq('id', pid)
    .single();

  if(pRes.error){
    console.error(pRes.error);
    $('closeMsg').textContent = "Erreur lecture bien: " + pRes.error.message;
    return;
  }
  const ownerId = pRes.data?.owner_id;
  if(!ownerId){
    $('closeMsg').textContent = "Ce bien n’a pas de propriétaire (owner_id).";
    return;
  }

  // Inputs revenus
  const aH = Number($('airbnbHousing').value||0);
  const aF = Number($('airbnbFees').value||0);
  const bH = Number($('bookingHousing').value||0);
  const bF = Number($('bookingFees').value||0);
  const dH = Number($('directHousing')?.value||0);
  const dF = Number($('directFees')?.value||0);

  const aC = Number($('airbnbCleaning')?.value || 0);
  const bC = Number($('bookingCleaning')?.value || 0);
  const dC = Number($('directCleaning')?.value || 0);
  const cleaningCollected = aC + bC + dC;

  // Déductions
  const consum = Number($('cConsumables').value||0);
  const exp = Number($('cExpenses').value||0);

  // Règle: commission sur logement uniquement (recommandé)
  const housing = aH + bH + dH;
  const commission = housing * COMMISSION_RATE;

  // Net propriétaire: logement - commission - consommables - dépenses
  // (le ménage n'impacte pas le proprio si tu le gères à part)
  const net = housing - commission - consum - exp-cleaningCollected;

  $('closeMsg').textContent = "Enregistrement…";

  // 1) Save platform payouts (si tu utilises platform_payouts)
  const pRows = [
    { property_id: pid, platform:'airbnb', period_start:start, period_end:end, housing_revenue:aH, platform_fees:aF, cleaning_collected: aC },
    { property_id: pid, platform:'booking', period_start:start, period_end:end, housing_revenue:bH, platform_fees:bF, cleaning_collected: bC },
    { property_id: pid, platform:'direct', period_start:start, period_end:end, housing_revenue:dH, platform_fees:dF, cleaning_collected: dC },
  ];

  let r = await supabaseClient
    .from('platform_payouts')
    .upsert(pRows, { onConflict:'property_id,platform,period_start,period_end' });

  if(r.error){
    console.error(r.error);
    $('closeMsg').textContent="Erreur revenus plateformes: "+r.error.message;
    return;
  }

  // 2) Save consumables override (ce mois)
  r = await supabaseClient
    .from('consumables_overrides')
    .upsert([{ property_id: pid, period_start:start, period_end:end, amount: consum }], { onConflict:'property_id,period_start,period_end' });

  if(r.error){
    console.error(r.error);
    $('closeMsg').textContent="Erreur consommables: "+r.error.message;
    return;
  }

  // 3) Upsert monthly closing (LOCKED) + owner_id ✅
  const up = await supabaseClient
    .from('monthly_closings')
    .upsert([{
      property_id: pid,
      owner_id: ownerId,                 // ✅ FIX
      period_start: start,
      period_end: end,
      status: 'locked',

      housing_revenue_total: housing,
      cleaning_collected_total: cleaningCollected, // ✅ si colonne existe (sinon enlève)
      platform_fees_total: (aF + bF + dF),

      commission_rate: COMMISSION_RATE,
      commission_amount: commission,

      consumables_amount: consum,
      billable_expenses_amount: exp,

      net_owner_amount: net
    }], { onConflict: 'property_id,period_start,period_end' })
    .select('id')
    .single();

  if(up.error){
    console.error(up.error);
    $('closeMsg').textContent="Erreur clôture: "+up.error.message;
    return;
  }

  const closingId = up.data.id;

  // 4) Lock expenses in this month
  const lock = await supabaseClient
    .from('expenses')
    .update({ locked: true, closing_id: closingId })
    .eq('property_id', pid)
    .gte('expense_date', start)
    .lte('expense_date', end);

  if(lock.error){
    console.error(lock.error);
    $('closeMsg').textContent="Clôture OK mais lock dépenses KO: "+lock.error.message;
    return;
  }

  $('closeMsg').textContent = "Clôture validée 🔒";
}

async function ownerStatement(){
  const pid = $('cProperty').value;
  const m = $('cMonth').value;
  if(!pid || !m) return alert("Choisis un bien et un mois.");

  const [y,mo] = m.split('-').map(Number);
  const start = `${y}-${String(mo).padStart(2,'0')}-01`;
  const end = new Date(y, mo, 0).toISOString().slice(0,10);

  // property + owner
  const pRes = await supabaseClient
    .from('properties')
    .select('id,name,owner_id,owners(full_name,email,phone)')
    .eq('id', pid)
    .single();
  if(pRes.error) return alert("Erreur bien: " + pRes.error.message);

  // closing
  const cRes = await supabaseClient
    .from('monthly_closings')
    .select('*')
    .eq('property_id', pid)
    .eq('period_start', start)
    .eq('period_end', end)
    .maybeSingle();
  if(cRes.error) return alert("Erreur clôture: " + cRes.error.message);

  const clo = cRes.data;
  if(!clo) return alert("Aucune clôture trouvée pour ce mois. Valide d’abord la clôture.");

  // platform payouts
  const ppRes = await supabaseClient
    .from('platform_payouts')
    .select('platform,housing_revenue,platform_fees,cleaning_collected')
    .eq('property_id', pid)
    .eq('period_start', start)
    .eq('period_end', end);
  const payouts = ppRes.data || [];

  // expenses list with receipt
  const eRes = await supabaseClient
    .from('expenses')
    .select('expense_date,description,amount,owner_markup_rate,receipt_path,bill_to_owner')
    .eq('property_id', pid)
    .gte('expense_date', start)
    .lte('expense_date', end)
    .order('expense_date', { ascending:true });

  const prop = pRes.data;
  const owner = prop?.owners || {};
  const expenses = (eRes.data||[]).filter(x=>x.bill_to_owner);

  const expTotal = expenses.reduce((s,x)=> s + Number(x.amount)*(1+Number(x.owner_markup_rate||0)), 0);

  const air = payouts.find(x=>x.platform==='airbnb') || {};
  const boo = payouts.find(x=>x.platform==='booking') || {};
  const dir = payouts.find(x=>x.platform==='direct') || {};

  let reservations = [];
  try {
    const nRes = await supabaseClient
      .from('reservation_nights')
      .select('platform,checkin,checkout,nights,housing_amount,cleaning_amount')
      .eq('property_id', pid)
      .gte('checkin', start)
      .lte('checkin', end)
      .order('checkin', { ascending:true });
    reservations = nRes.data || [];
  } catch(e) { reservations = []; }

  const nightsTotal = reservations.reduce((s,x)=>s+Number(x.nights||0),0);
  const bookingsTotal = reservations.length;

  const housingTotal = Number(clo.housing_revenue_total||0);
  const cleaningTotal = Number(clo.cleaning_collected_total||0);
  const feesTotal = Number(clo.platform_fees_total||0);


  const logoUrl = "/assets/logo.png"; // <- change if needed

  const html = `
  <html>
  <head>
    <meta charset="utf-8"/>
    <title>Relevé propriétaire • ${prop?.name||''} • ${m}</title>
    <style>
      :root{
        --ink:#0B1220;
        --muted:#667085;
        --line:#E5E7EB;
        --card:#FFFFFF;
        --bg:#F7F8FB;
        --accent:#1D4ED8;
      }
      *{box-sizing:border-box}
      body{
        margin:0;
        background:var(--bg);
        color:var(--ink);
        font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial;
      }
      .page{max-width:900px; margin:0 auto; padding:28px}
      .header{
        display:flex; align-items:center; justify-content:space-between;
        gap:14px; padding:16px 18px;
        background:var(--card); border:1px solid var(--line); border-radius:18px;
      }
      .brand{display:flex; align-items:center; gap:12px}
      .brand img{height:34px; width:auto}
      .h1{font-size:18px; font-weight:900; margin:0}
      .sub{font-size:12px; color:var(--muted); margin-top:2px}
      .badge{
        font-size:12px; padding:6px 10px; border-radius:999px;
        border:1px solid var(--line); background:#fff;
      }
      .grid2{display:grid; grid-template-columns:1fr 1fr; gap:14px; margin-top:14px}
      .card{
        background:var(--card);
        border:1px solid var(--line);
        border-radius:18px;
        padding:14px 16px;
      }
      .title{font-weight:900; margin:0 0 10px 0; font-size:14px}
      .muted{color:var(--muted)}
      .row{display:flex; justify-content:space-between; gap:12px; padding:6px 0}
      .row b{font-variant-numeric: tabular-nums;}
      hr{border:none; border-top:1px solid var(--line); margin:10px 0}
      .total{
        display:flex; justify-content:space-between; align-items:center;
        font-weight:1000; font-size:18px;
        padding-top:8px;
      }
      table{width:100%; border-collapse:collapse; margin-top:8px}
      th,td{padding:10px; border-bottom:1px solid #EEF0F4; font-size:12.5px; text-align:left; vertical-align:top}
      th{color:var(--muted); font-weight:800}
      .right{text-align:right}
      .pill{
        display:inline-flex; align-items:center; gap:6px;
        font-size:11px; padding:4px 8px; border-radius:999px;
        border:1px solid var(--line);
        color:var(--muted);
      }
      .note{font-size:12px; color:var(--muted); margin-top:10px}
      .footer{margin-top:14px; font-size:11px; color:var(--muted); text-align:center}
      @media print{
        body{background:#fff}
        .page{padding:0}
        .card,.header{border:1px solid #ddd}
      }
    </style>
  </head>
  <body>
    <div class="page">
      <div class="header">
        <div class="brand">
          <img src="${logoUrl}" onerror="this.style.display='none'"/>
          <div>
            <div class="h1">Relevé propriétaire</div>
            <div class="sub">${m} • ${prop?.name||''}</div>
          </div>
        </div>
        <div class="badge">Conciergerie Zenata</div>
      </div>

      <div class="grid2">
        <div class="card">
          <div class="title">Propriétaire</div>
          <div><b>${owner.full_name || '—'}</b></div>
          <div class="muted">${owner.email || '—'} • ${owner.phone || '—'}</div>
          <div class="note">Période : ${start} → ${end}</div>
        </div>

        <div class="card">
          <div class="title">Dashboard du mois</div>
          <div class="row"><span>Réservations</span><b>${bookingsTotal || '—'}</b></div>
          <div class="row"><span>Nuitées</span><b>${nightsTotal || '—'}</b></div>
          <div class="row"><span>Prix moyen / nuit</span><b>${nightsTotal ? money(housingTotal/nightsTotal) : '—'}</b></div>
          <div class="row"><span>Commission</span><b>${Math.round(Number(clo.commission_rate||0)*100)}%</b></div>
        </div>
      </div>

      <div class="grid2" style="margin-top:14px">
        <div class="card">
          <div class="title">Résumé (clair)</div>
          <div class="row"><span>Revenus logement</span><b>${money(housingTotal)}</b></div>
          <div class="row"><span>Commission Zenata</span><b>-${money(clo.commission_amount||0)}</b></div>
          <div class="row"><span>Consommables</span><b>-${money(clo.consumables_amount||0)}</b></div>
          <div class="row"><span>Dépenses refacturées</span><b>-${money(expTotal)}</b></div>
          <div class="row"><span>Ménages</span><b>-${money(cleaningTotal)}</b></div>
          <hr/>
          <div class="total"><span>À verser au propriétaire</span><span>${money(clo.net_owner_amount||0)}</span></div>
          <div class="note">Le ménage collecté est inclus dans le net(facturé au client). Les consommables ont été inclus pour  ce mois aux dépenses refacturées</div>
        </div>
      </div>

      <div class="card" style="margin-top:14px">
        <div class="title">Détail revenus plateformes</div>
        <table>
          <thead>
            <tr>
              <th>Plateforme</th>
              <th class="right">Revenu logement</th>
              <th class="right">Ménage collecté</th>
              <th class="right">Frais plateforme</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><span class="pill">Airbnb</span></td>
              <td class="right">${money(air.housing_revenue||0)}</td>
              <td class="right">-${money(air.cleaning_collected||0)}</td>
              <td class="right">-${money(air.platform_fees||0)}</td>
            </tr>
            <tr>
              <td><span class="pill">Booking</span></td>
              <td class="right">${money(boo.housing_revenue||0)}</td>
              <td class="right">-${money(boo.cleaning_collected||0)}</td>
              <td class="right">-${money(boo.platform_fees||0)}</td>
            </tr>
            <tr>
              <td><span class="pill">Hors plateforme</span></td>
              <td class="right">${money(dir.housing_revenue||0)}</td>
              <td class="right">-${money(dir.cleaning_collected||0)}</td>
              <td class="right">-${money(dir.platform_fees||0)}</td>
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <th>Total</th>
              <th class="right">${money(housingTotal)}</th>
              <th class="right">-${money(cleaningTotal)}</th>
              <th class="right">-${money(feesTotal)}</th>
            </tr>
          </tfoot>
        </table>
        <div class="note">Cash collecté (logement + ménage) : <b>${money(housingTotal)}</b> (avant frais plateformes)</div>
      </div>

      <div class="card" style="margin-top:14px">
        <div class="title">Détail des nuitées</div>
        <table>
          <thead><tr><th>Plateforme</th><th>Du</th><th>Au</th><th class="right">Nuits</th><th class="right">Montant</th></tr></thead>
          <tbody>
            ${reservations.length ? reservations.map(x => `<tr>
              <td><span class="pill">${escapeHtml(x.platform || '—')}</span></td>
              <td>${x.checkin || ''}</td>
              <td>${x.checkout || ''}</td>
              <td class="right">${Number(x.nights||0)}</td>
              <td class="right">${money(x.housing_amount||0)}</td>
            </tr>`).join('') : `<tr><td colspan="5" class="muted">Détail des nuitées non renseigné</td></tr>`}
          </tbody>
        </table>
      </div>

      <div class="card" style="margin-top:14px">
        <div class="title">Dépenses refacturées (détail)</div>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Description</th>
              <th class="right">Montant</th>
              <th>Justificatif</th>
            </tr>
          </thead>
          <tbody>
            ${
              expenses.length
              ? expenses.map(x=>{
                  const amt = Number(x.amount)*(1+Number(x.owner_markup_rate||0));
                  const has = x.receipt_path ? "📎 Oui" : "—";
                  return `<tr>
                    <td>${x.expense_date||''}</td>
                    <td>${(x.description||'').replace(/</g,'&lt;')}</td>
                    <td class="right">${money(amt)}</td>
                    <td>${has}</td>
                  </tr>`;
                }).join('')
              : `<tr><td colspan="4" class="muted">Aucune dépense refacturée</td></tr>`
            }
          </tbody>
          <tfoot>
            <tr>
              <th colspan="2">Total dépenses refacturées</th>
              <th class="right">${money(expTotal)}</th>
              <th></th>
            </tr>
          </tfoot>
        </table>
        <div class="note">Les justificatifs sont disponibles dans l’espace admin (liens signés).</div>
      </div>

      <div class="footer">Généré par Conciergerie Zenata • ${new Date().toISOString().slice(0,10)}</div>
    </div>
    <script>window.onload=()=>{ setTimeout(()=>window.print(), 250); };</script>
  </body>
  </html>`;

  const w = window.open('', '_blank');
  w.document.open();
  w.document.write(html);
  w.document.close();
}



async function loadToPay(){
  const tbody = $('tblToPay')?.querySelector('tbody');
  const msg = $('toPayMsg');
  if(!tbody) return;

  msg && (msg.textContent = "Chargement…");

  const { data, error } = await supabaseClient
    .from('monthly_closings')
    .select('id, net_owner_amount, period_start, properties(name, owners(full_name))')
    .eq('status', 'locked')
    .is('paid_at', null)
    .order('period_start', { ascending:false })
    .limit(200);

  if(error){
    console.error(error);
    msg && (msg.textContent = "Erreur: " + error.message);
    return;
  }

  const rows = data || [];
  tbody.innerHTML = rows.map(r => `
    <tr>
      <td><b>${r.properties?.owners?.full_name || '—'}</b></td>
      <td class="muted">${r.properties?.name || '—'}</td>
      <td class="muted">${String(r.period_start).slice(0,7)}</td>
      <td><b>${money(r.net_owner_amount)}</b></td>
      <td class="row-actions">
        <button class="iconbtn" data-paid="${r.id}">Marquer payé</button>
      </td>
    </tr>
  `).join('') || `<tr><td colspan="5" class="muted">Rien à payer 🎉</td></tr>`;

  // action
  document.querySelectorAll('[data-paid]').forEach(btn => {
    btn.onclick = async () => {
      const ref = prompt("Référence paiement (optionnel) :") || null;
      const { error: uerr } = await supabaseClient
        .from('monthly_closings')
        .update({ paid_at: new Date().toISOString(), paid_ref: ref })
        .eq('id', btn.dataset.paid);

      if(uerr){ alert("Erreur: " + uerr.message); return; }

      await loadToPay();
      await loadPaid();
    };
  });

  msg && (msg.textContent = `${rows.length} paiement(s) en attente`);
}

async function loadPaid(){
  const tbody = $('tblPaid')?.querySelector('tbody');
  const msg = $('paidMsg');
  if(!tbody) return;

  msg && (msg.textContent = "Chargement…");

  const { data, error } = await supabaseClient
    .from('monthly_closings')
    .select('id, net_owner_amount, period_start, paid_at, paid_ref, properties(name, owners(full_name))')
    .eq('status', 'locked')
    .not('paid_at', 'is', null)
    .order('paid_at', { ascending:false })
    .limit(200);

  if(error){
    console.error(error);
    msg && (msg.textContent = "Erreur: " + error.message);
    return;
  }

  const rows = data || [];
  tbody.innerHTML = rows.map(r => `
    <tr>
      <td><b>${r.properties?.owners?.full_name || '—'}</b></td>
      <td class="muted">${r.properties?.name || '—'}</td>
      <td class="muted">${String(r.period_start).slice(0,7)}</td>
      <td><b>${money(r.net_owner_amount)}</b></td>
      <td class="muted">${(r.paid_at || '').slice(0,10)}</td>
      <td class="muted">${r.paid_ref || '—'}</td>
    </tr>
  `).join('') || `<tr><td colspan="6" class="muted">Aucun historique</td></tr>`;

  msg && (msg.textContent = `${rows.length} paiement(s) payés`);
}




/*************************************************
 * WIRE UI
 *************************************************/
function wire(){
  // Auth buttons
  const btnLogin = $('btnLogin');
  const btnMagic = $('btnMagic');
  if(btnLogin) btnLogin.onclick = loginEmailPassword;
  if(btnMagic) btnMagic.onclick = magicLink;
  
  // Tabs navigation
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.onclick = async () => {
      const tab = btn.dataset.tab;
      setTab(tab);

      // lazy-load expenses when opening tab
      if(tab === 'expenses'){
        await loadExpenseProperties();
        await loadExpensesV2();
      }
      if(tab === 'properties') await loadPropertiesList();
       if(tab === 'owners'){
  await loadOwnersList();   // si tu l’as déjà
  await loadToPay();
  await loadPaid();
}
    };
    
    // ===== Biens =====
  const propSearch = $('propSearch');
  if(propSearch){
    propSearch.oninput = () => {
      clearTimeout(window.__psT);
      window.__psT = setTimeout(loadPropertiesList, 150);
    };
  }

  

  // ===== Owners =====
  const ownerSearch = $('ownerSearch');
  if(ownerSearch){
    ownerSearch.oninput = () => {
      clearTimeout(window.__osT);
      window.__osT = setTimeout(loadOwnersList, 150);
    };
  }
  });

  // Global buttons (optional)
  const btnLogout = $('btnLogout');
  if(btnLogout){
    btnLogout.onclick = async () => {
      await supabaseClient.auth.signOut();
      location.reload();
    };
    
  }

  // Closing
$('btnCloseMonth') && ($('btnCloseMonth').onclick = saveClosing);
['airbnbHousing','airbnbFees','airbnbCleaning','bookingHousing','bookingFees','bookingCleaning','directHousing','directFees','directCleaning','cConsumables'].forEach(id=>{
  $(id) && ($(id).oninput = calcClosing);
});
  $('btnOwnerStatement') && ($('btnOwnerStatement').onclick = ownerStatement);
  $('btnEmailOwner') && ($('btnEmailOwner').onclick = prepareOwnerEmail);
  $('btnAddNight') && ($('btnAddNight').onclick = addNightRow);
  $('btnSaveNights') && ($('btnSaveNights').onclick = async () => { syncPlatformTotalsFromNights(); await saveReservationsDetail(); });
  $('btnSaveQuickExpenses') && ($('btnSaveQuickExpenses').onclick = () => saveQuickExpenses('closing'));
  $('btnSaveQuickExpensesExpenses') && ($('btnSaveQuickExpensesExpenses').onclick = () => saveQuickExpenses('expenses'));



  // ===== Expenses V2 wiring =====
  const btnNewExpense = $('btnNewExpense');
  if(btnNewExpense) btnNewExpense.onclick = () => openExpenseModal(null);

  document.querySelectorAll('[data-close="1"]').forEach(el => {
    el.onclick = () => closeExpenseModal();
  });

  const btnSaveExpense = $('btnSaveExpense');
  if(btnSaveExpense) btnSaveExpense.onclick = saveExpense;

  const btnDeleteExpense = $('btnDeleteExpense');
  if(btnDeleteExpense) btnDeleteExpense.onclick = deleteExpense;

  const fProperty = $('fProperty');
  if(fProperty) fProperty.onchange = loadExpensesV2;

  const fMonth = $('fMonth');
  if(fMonth) fMonth.onchange = loadExpensesV2;

  const fBillable = $('fBillable');
  if(fBillable) fBillable.onchange = loadExpensesV2;

  const fSearch = $('fSearch');
  if(fSearch){
    fSearch.oninput = () => {
      clearTimeout(window.__expT);
      window.__expT = setTimeout(loadExpensesV2, 150);
    };
  }
}

/*************************************************
 * BOOT
 *************************************************/
async function boot(){
  const a = await ensureAdmin();

  if(!a.ok){
    if(a.reason === "no_user") return showLogin("");
    if(a.reason === "admin_check_failed") return showLogin("Erreur lecture admin_users (RLS).");
    return showLogin("Accès refusé : tu n’es pas admin (table admin_users).");
  }

  showApp(a.user);
    // preload lists
  if($('tblProps')) await loadPropertiesList();
  if($('tblOwners')) await loadOwnersList();
  if($('tab-closing')) await loadClosingDefaults();
  if($('tblToPay')) { await loadToPay(); await loadPaid(); }


  // Default month filter for expenses
  const fMonth = $('fMonth');
  if(fMonth){
    const now = new Date();
    fMonth.value = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  }

  // preload expenses (safe even if tab hidden)
  await loadExpenseProperties();
  renderQuickExpenses();
  await loadExpensesV2();

  // Default tab
  const active = document.querySelector('.nav-item.active')?.dataset?.tab || 'overview';
  setTab(active);
}

/*************************************************
 * START
 *************************************************/
document.addEventListener('DOMContentLoaded', () => {
  wire();
  boot();
});

