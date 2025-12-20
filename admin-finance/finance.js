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

/*************************************************
 * AUTH / ADMIN
 *************************************************/
async function ensureAdmin(){
  const { data: userRes, error: userErr } = await supabaseClient.auth.getUser();
  const user = userRes?.user;

  if (userErr || !user) return { ok:false, reason:"no_user" };

  const { data, error } = await supabaseClient
    .from('admin_users')
    .select('user_id, role')
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) {
    console.error("admin_users select error:", error);
    return { ok:false, reason:"admin_check_failed", error };
  }
  if (!data) return { ok:false, reason:"not_admin" };

  return { ok:true, user, role: data.role };
}

function showLogin(msg=""){
  $('app')?.classList.add('hidden');
  $('login')?.classList.remove('hidden');
  if($('authMsg')) $('authMsg').textContent = msg;
}

function showApp(user){
  $('login')?.classList.add('hidden');
  $('app')?.classList.remove('hidden');
  if($('whoami')) $('whoami').textContent = user?.email || "admin";
}

/*************************************************
 * NAV
 *************************************************/
function setTab(tab){
  document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
  document.querySelector(`.nav-item[data-tab="${tab}"]`)?.classList.add('active');

  document.querySelectorAll('.tab').forEach(t => t.classList.add('hidden'));
  $(`tab-${tab}`)?.classList.remove('hidden');

  const titles = {
    overview: ["Résumé", "Les chiffres importants, sans jargon."],
    properties: ["Biens", "Tout est géré par bien : dépenses, consommables, clôture."],
    expenses: ["Dépenses", "Ajoute une dépense en 10 secondes. Justificatif optionnel. 🔒 si mois verrouillé."],
    closing: ["Clôture du mois", "Choisir → vérifier → clôturer → verrouiller."],
    owners: ["Propriétaires", "Qui doit recevoir combien."],
    cash: ["Trésorerie", "Combien on a en banque et d’où ça vient."],
    settings: ["Réglages", "Règles simples. Pas de complexité inutile."]
  };

  const t = titles[tab] || ["Finance", ""];
  if($('pageTitle')) $('pageTitle').textContent = t[0];
  if($('pageSub')) $('pageSub').textContent = t[1];
}

/*************************************************
 * BASIC DATA LOADERS (minimal)
 * (Tu peux garder tes versions existantes si tu veux)
 *************************************************/
async function loadPropertiesDropdown(selectId){
  const el = $(selectId);
  if(!el) return;

  const { data, error } = await supabaseClient
    .from('properties')
    .select('id,name')
    .order('name', { ascending:true })
    .limit(500);

  if(error){ console.error(error); return; }
  el.innerHTML = (data||[]).map(p => `<option value="${p.id}">${p.name}</option>`).join('');
}

/*************************************************
 * EXPENSES V2 (CRUD + receipts)
 *************************************************/
let EXP_PROPS = [];
let editingExpenseId = null;
let editingReceiptPath = null;
let editingLocked = false;

function fmtDate(d){ return d || "—"; }
function pillYesNo(v){
  return v ? `<span class="pill yes">Oui</span>` : `<span class="pill no">Non</span>`;
}
function pillLock(v){
  return v ? `<span class="pill lock">🔒 Verrouillé</span>` : ``;
}
function propNameById(id){
  return (EXP_PROPS.find(p => p.id === id)?.name) || "—";
}

async function loadExpenseProperties(){
  const { data, error } = await supabaseClient
    .from('properties')
    .select('id,name')
    .order('name', { ascending:true })
    .limit(500);

  if(error){ console.error(error); return; }
  EXP_PROPS = data || [];

  const opts = EXP_PROPS.map(p => `<option value="${p.id}">${p.name}</option>`).join('');

  if($('fProperty')) $('fProperty').innerHTML = `<option value="all">Tous</option>` + opts;
  if($('mProperty')) $('mProperty').innerHTML = opts;
}

function openExpenseModal(row=null){
  $('expModal')?.classList.remove('hidden');
  if($('mMsg')) $('mMsg').textContent = "";

  const today = new Date().toISOString().slice(0,10);

  if($('mDate')) $('mDate').value = row?.expense_date || today;
  if($('mAmount')) $('mAmount').value = row?.amount ?? "";
  if($('mDesc')) $('mDesc').value = row?.description ?? "";
  if($('mBillToOwner')) $('mBillToOwner').value = String(row?.bill_to_owner ?? true);
  if($('mMarkup')) $('mMarkup').value = row?.owner_markup_rate ?? 0;
  if($('mFile')) $('mFile').value = "";

  if(row){
    editingExpenseId = row.id;
    editingReceiptPath = row.receipt_path || null;
    editingLocked = !!row.locked;

    if($('modalTitle')) $('modalTitle').textContent = "Modifier une dépense";
    $('btnDeleteExpense')?.classList.toggle('hidden', editingLocked);
    if($('mProperty')) $('mProperty').value = row.property_id;
  } else {
    editingExpenseId = null;
    editingReceiptPath = null;
    editingLocked = false;

    if($('modalTitle')) $('modalTitle').textContent = "Ajouter une dépense";
    $('btnDeleteExpense')?.classList.add('hidden');

    // default property from filter
    const fp = $('fProperty')?.value;
    if(fp && fp !== 'all' && $('mProperty')) $('mProperty').value = fp;
  }
}

function closeExpenseModal(){
  $('expModal')?.classList.add('hidden');
  editingExpenseId = null;
  editingReceiptPath = null;
  editingLocked = false;
}

async function uploadReceipt(propertyId, expenseId, file){
  const ext = (file.name.split('.').pop() || 'bin').toLowerCase();
  const path = `expenses/${propertyId}/${expenseId}.${ext}`;

  const { error } = await supabaseClient
    .storage
    .from('expenses-receipts')
    .upload(path, file, { upsert: true });

  if(error) throw error;
  return path;
}

async function downloadReceipt(path){
  const { data, error } = await supabaseClient
    .storage
    .from('expenses-receipts')
    .createSignedUrl(path, 60);

  if(error) throw error;
  window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
}

async function loadExpensesV2(){
  const msg = $('expListMsg');
  if(msg) msg.textContent = "Chargement…";

  const fProp = $('fProperty')?.value || "all";
  const fMonth = $('fMonth')?.value || "";
  const fSearch = ($('fSearch')?.value || "").trim().toLowerCase();
  const fBillable = $('fBillable')?.value || "all";

  let q = supabaseClient
    .from('expenses')
    .select('id,property_id,expense_date,description,amount,bill_to_owner,owner_markup_rate,receipt_path,locked')
    .order('expense_date', { ascending:false })
    .limit(300);

  if(fProp !== 'all') q = q.eq('property_id', fProp);

  const r = fMonth ? monthRange(fMonth) : null;
  if(r) q = q.gte('expense_date', r.start).lte('expense_date', r.end);

  if(fBillable === 'billable') q = q.eq('bill_to_owner', true);
  if(fBillable === 'not_billable') q = q.eq('bill_to_owner', false);

  const { data, error } = await q;
  if(error){
    console.error(error);
    if(msg) msg.textContent = "Erreur chargement: " + error.message;
    return;
  }

  let rows = data || [];
  if(fSearch){
    rows = rows.filter(r =>
      (r.description||"").toLowerCase().includes(fSearch) ||
      propNameById(r.property_id).toLowerCase().includes(fSearch)
    );
  }

  const tbody = $('tblExpensesV2')?.querySelector('tbody');
  if(!tbody) return;

  tbody.innerHTML = rows.map(r => {
    const hasReceipt = !!r.receipt_path;
    const lock = !!r.locked;
    return `
      <tr class="${lock ? 'lockedRow':''}">
        <td>${fmtDate(r.expense_date)}</td>
        <td class="muted">${propNameById(r.property_id)}</td>
        <td>
          <b>${r.description || '—'}</b>
          ${pillLock(lock)}
        </td>
        <td><b>${money(r.amount)}</b></td>
        <td>${pillYesNo(!!r.bill_to_owner)}</td>
        <td>
          ${hasReceipt ? `<button class="iconbtn" data-dl="${encodeURIComponent(r.receipt_path)}">📎</button>` : `<span class="muted">—</span>`}
        </td>
        <td>
          <div class="row-actions">
            <button class="iconbtn" data-edit="${r.id}">⋮</button>
          </div>
        </td>
      </tr>
    `;
  }).join('') || `<tr><td colspan="7" class="muted">Aucune dépense</td></tr>`;

  // download
  document.querySelectorAll('[data-dl]').forEach(btn => {
    btn.onclick = async () => {
      try { await downloadReceipt(decodeURIComponent(btn.dataset.dl)); }
      catch(e){ alert("Erreur téléchargement: " + (e?.message||e)); }
    };
  });

  // edit
  const map = new Map(rows.map(r => [r.id, r]));
  document.querySelectorAll('[data-edit]').forEach(btn => {
    btn.onclick = () => openExpenseModal(map.get(btn.dataset.edit));
  });

  if(msg) msg.textContent = `${rows.length} dépense(s)`;
}

async function saveExpense(){
  const propertyId = $('mProperty')?.value;
  const expenseDate = $('mDate')?.value;
  const amount = Number($('mAmount')?.value || 0);
  const description = ($('mDesc')?.value || "").trim();
  const billToOwner = ($('mBillToOwner')?.value || "true") === "true";
  const markup = Number($('mMarkup')?.value || 0);
  const file = $('mFile')?.files?.[0] || null;

  const mMsg = $('mMsg');
  if(!propertyId){ if(mMsg) mMsg.textContent = "Choisis un bien."; return; }
  if(!expenseDate){ if(mMsg) mMsg.textContent = "Choisis une date."; return; }
  if(!(amount > 0)){ if(mMsg) mMsg.textContent = "Montant invalide."; return; }
  if(!description){ if(mMsg) mMsg.textContent = "Ajoute une description."; return; }

  if(mMsg) mMsg.textContent = "Enregistrement…";

  try {
    if(editingExpenseId){
      if(editingLocked){
        if(mMsg) mMsg.textContent = "Cette dépense est verrouillée (mois clôturé).";
        return;
      }

      const { error: e1 } = await supabaseClient
        .from('expenses')
        .update({
          property_id: propertyId,
          expense_date: expenseDate,
          amount,
          description,
          bill_to_owner: billToOwner,
          owner_markup_rate: markup
        })
        .eq('id', editingExpenseId);

      if(e1) throw e1;

      if(file){
        const path = await uploadReceipt(propertyId, editingExpenseId, file);
        const { error: e2 } = await supabaseClient
          .from('expenses')
          .update({ receipt_path: path })
          .eq('id', editingExpenseId);
        if(e2) throw e2;
        editingReceiptPath = path;
      }

      if(mMsg) mMsg.textContent = "Modifié ✅";
    } else {
      const { data, error: e1 } = await supabaseClient
        .from('expenses')
        .insert([{
          property_id: propertyId,
          expense_date: expenseDate,
          amount,
          description,
          bill_to_owner: billToOwner,
          owner_markup_rate: markup
        }])
        .select('id')
        .single();

      if(e1) throw e1;

      const expenseId = data.id;

      if(file){
        const path = await uploadReceipt(propertyId, expenseId, file);
        const { error: e2 } = await supabaseClient
          .from('expenses')
          .update({ receipt_path: path })
          .eq('id', expenseId);
        if(e2) throw e2;
      }

      if(mMsg) mMsg.textContent = "Ajouté ✅";
    }

    await loadExpensesV2();
    setTimeout(closeExpenseModal, 200);

  } catch (e){
    console.error(e);
    if(mMsg) mMsg.textContent = "Erreur: " + (e?.message || e);
  }
}

async function deleteExpense(){
  const mMsg = $('mMsg');
  if(!editingExpenseId) return;
  if(editingLocked){ if(mMsg) mMsg.textContent = "Dépense verrouillée: suppression impossible."; return; }

  const ok = confirm("Supprimer cette dépense ? (action irréversible)");
  if(!ok) return;

  if(mMsg) mMsg.textContent = "Suppression…";

  try {
    if(editingReceiptPath){
      await supabaseClient.storage.from('expenses-receipts').remove([editingReceiptPath]);
    }

    const { error } = await supabaseClient
      .from('expenses')
      .delete()
      .eq('id', editingExpenseId);

    if(error) throw error;

    if(mMsg) mMsg.textContent = "Supprimé ✅";
    await loadExpensesV2();
    setTimeout(closeExpenseModal, 200);

  } catch (e){
    console.error(e);
    if(mMsg) mMsg.textContent = "Erreur: " + (e?.message || e);
  }
}

/*************************************************
 * LOGIN ACTIONS
 *************************************************/
let loginInFlight = false;

async function loginEmailPassword(){
  if(loginInFlight) return;
  loginInFlight = true;

  const email = $('authEmail')?.value?.trim();
  const password = $('authPassword')?.value;

  if($('authMsg')) $('authMsg').textContent = "Connexion…";
  $('btnLogin') && ($('btnLogin').disabled = true);
  $('btnMagic') && ($('btnMagic').disabled = true);

  try {
    const res = await supabaseClient.auth.signInWithPassword({ email, password });
    if(res?.error){
      console.error(res.error);
      if($('authMsg')) $('authMsg').textContent = "Erreur: " + res.error.message;
      return;
    }
    if($('authMsg')) $('authMsg').textContent = "Connecté ✅";
    await boot();
  } catch (e){
    console.error(e);
    if($('authMsg')) $('authMsg').textContent = "Erreur: " + (e?.message || e);
  } finally {
    loginInFlight = false;
    $('btnLogin') && ($('btnLogin').disabled = false);
    $('btnMagic') && ($('btnMagic').disabled = false);
  }
}

let otpInFlight = false;

async function magicLink(){
  if(otpInFlight) return;
  otpInFlight = true;

  const email = $('authEmail')?.value?.trim();
  if(!email){ if($('authMsg')) $('authMsg').textContent = "Entre ton email."; otpInFlight=false; return; }

  if($('authMsg')) $('authMsg').textContent = "Envoi du lien…";
  $('btnLogin') && ($('btnLogin').disabled = true);
  $('btnMagic') && ($('btnMagic').disabled = true);

  try {
    const { error } = await supabaseClient.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.href }
    });
    if(error){
      console.error(error);
      if($('authMsg')) $('authMsg').textContent = "Erreur: " + error.message;
      return;
    }
    if($('authMsg')) $('authMsg').textContent = "Lien envoyé ✅ (si SMTP configuré).";
  } finally {
    otpInFlight = false;
    $('btnLogin') && ($('btnLogin').disabled = false);
    $('btnMagic') && ($('btnMagic').disabled = false);
  }
}

/*************************************************
 * PROPERTIES (Biens)
 *************************************************/
async function loadPropertiesList(){
  const tbody = $('tblProps')?.querySelector('tbody');
  const msg = $('propsMsg');
  if(msg) msg.textContent = "Chargement…";
  if(!tbody) return;

  const q = ($('propSearch')?.value || "").trim().toLowerCase();

  // On prend aussi owner via relation si possible
  const { data, error } = await supabaseClient
    .from('properties')
    .select('id,name,owner_id,owners(full_name,email)')
    .order('name', { ascending:true })
    .limit(500);

  if(error){
    console.error(error);
    if(msg) msg.textContent = "Erreur: " + error.message;
    return;
  }

  let rows = data || [];
  if(q) rows = rows.filter(p => (p.name||"").toLowerCase().includes(q));

  tbody.innerHTML = rows.map(p => `
    <tr>
      <td><b>${p.name || "—"}</b></td>
      <td class="muted">${p.owners?.full_name || "—"}</td>
      <td class="row-actions">
        <button class="iconbtn" data-prop-exp="${p.id}">Dépenses</button>
        <button class="iconbtn" data-prop-close="${p.id}">Clôturer</button>
      </td>
    </tr>
  `).join('') || `<tr><td colspan="3" class="muted">Aucun bien</td></tr>`;

  // Actions
  document.querySelectorAll('[data-prop-exp]').forEach(b => {
    b.onclick = async () => {
      setTab('expenses');
      $('fProperty').value = b.dataset.propExp;
      await loadExpensesV2();
    };
  });

  document.querySelectorAll('[data-prop-close]').forEach(b => {
    b.onclick = () => {
      setTab('closing');
      // Si tu as un select property dans closing :
      if($('selProperty')) $('selProperty').value = b.dataset.propClose;
      // previewClosing si tu l’as
      if(typeof previewClosing === 'function') previewClosing();
    };
  });

  if(msg) msg.textContent = `${rows.length} bien(s)`;
}

/*************************************************
 * OWNERS (Propriétaires)
 *************************************************/
async function loadOwnersList(){
  const tbody = $('tblOwners')?.querySelector('tbody');
  const msg = $('ownersMsg');
  if(msg) msg.textContent = "Chargement…";
  if(!tbody) return;

  const q = ($('ownerSearch')?.value || "").trim().toLowerCase();

  const { data, error } = await supabaseClient
    .from('owners')
    .select('id,full_name,email,phone,created_at')
    .order('created_at', { ascending:false })
    .limit(500);

  if(error){
    console.error(error);
    if(msg) msg.textContent = "Erreur: " + error.message;
    return;
  }

  let rows = data || [];
  if(q){
    rows = rows.filter(o =>
      (o.full_name||"").toLowerCase().includes(q) ||
      (o.email||"").toLowerCase().includes(q) ||
      (o.phone||"").toLowerCase().includes(q)
    );
  }

  tbody.innerHTML = rows.map(o => `
    <tr>
      <td><b>${o.full_name || "—"}</b></td>
      <td class="muted">${o.email || "—"}</td>
      <td class="muted">${o.phone || "—"}</td>
    </tr>
  `).join('') || `<tr><td colspan="3" class="muted">Aucun propriétaire</td></tr>`;

  if(msg) msg.textContent = `${rows.length} propriétaire(s)`;
}

/*************************************************
 * CLOSING – UX + LOGIC
 *************************************************/
const COMMISSION_RATE = 0.20;

function calcClosing(){
  const aH = Number($('airbnbHousing').value||0);
  const bH = Number($('bookingHousing').value||0);
  const housing = aH + bH;

  const consum = Number($('cConsumables').value||0);
  const exp = Number($('cExpenses').value||0);
  const commission = housing * COMMISSION_RATE;
  const net = housing - commission - consum - exp;

  $('revTotalMsg').textContent = `Total revenus logement : ${money(housing)}`;
  $('sHousing').textContent = money(housing);
  $('sCommission').textContent = `-${money(commission)}`;
  $('sConsumables').textContent = `-${money(consum)}`;
  $('sExpenses').textContent = `-${money(exp)}`;
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
    calcClosing();
  };

  $('cMonth').onchange = async () => {
    await loadMonthExpenses();
    calcClosing();
  };
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

  const { housing, commission, consum, exp, net } = calcClosing();

  $('closeMsg').textContent = "Enregistrement…";

  const { error } = await supabaseClient.from('monthly_closings').upsert([{
    property_id: pid,
    period_start: start,
    period_end: end,
    status: 'locked',
    housing_revenue_total: housing,
    commission_rate: COMMISSION_RATE,
    commission_amount: commission,
    consumables_amount: consum,
    billable_expenses_amount: exp,
    net_owner_amount: net
  }], { onConflict: 'property_id,period_start,period_end' });

  if(error){
    console.error(error);
    $('closeMsg').textContent = "Erreur: " + error.message;
    return;
  }
  $('closeMsg').textContent = "Clôture validée 🔒";
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
      if(tab === 'owners') await loadOwnersList();
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
['airbnbHousing','airbnbFees','bookingHousing','bookingFees','cConsumables'].forEach(id=>{
  $(id) && ($(id).oninput = calcClosing);
});


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

  // Default month filter for expenses
  const fMonth = $('fMonth');
  if(fMonth){
    const now = new Date();
    fMonth.value = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  }

  // preload expenses (safe even if tab hidden)
  await loadExpenseProperties();
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

