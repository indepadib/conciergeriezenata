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

async function loadDashboard(){
  const now = new Date();
  const m = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  const start = `${m}-01`;
  const end = new Date(now.getFullYear(), now.getMonth()+1, 0).toISOString().slice(0,10);

  const { data } = await supabaseClient
    .from('monthly_closings')
    .select('housing_revenue_total, commission_amount, net_owner_amount')
    .gte('period_start', start)
    .lte('period_end', end)
    .eq('status','locked');

  const rows = data || [];
  const housing = rows.reduce((s,x)=>s+Number(x.housing_revenue_total||0),0);
  const commission = rows.reduce((s,x)=>s+Number(x.commission_amount||0),0);
  const toPay = rows.reduce((s,x)=>s+Number(x.net_owner_amount||0),0);
  const margin = commission;

  $('kpiHousing').textContent = money(housing);
  $('kpiCommission').textContent = money(commission);
  $('kpiToPay').textContent = money(toPay);
  $('kpiMargin').textContent = money(margin);
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
  const cleaning = Number($('airbnbCleaning')?.value||0) + Number($('bookingCleaning')?.value||0);



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
    calcClosing();
  };

  $('cMonth').onchange = async () => {
    await loadMonthExpenses();
    calcClosing();
    await loadClosingSaved();
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

  // (temp) ménage si tu l’ajoutes (voir section 2)
  const aC = Number($('airbnbCleaning')?.value || 0);
  const bC = Number($('bookingCleaning')?.value || 0);
  const cleaningCollected = aC + bC;

  // Déductions
  const consum = Number($('cConsumables').value||0);
  const exp = Number($('cExpenses').value||0);

  // Règle: commission sur logement uniquement (recommandé)
  const housing = aH + bH;
  const commission = housing * COMMISSION_RATE;

  // Net propriétaire: logement - commission - consommables - dépenses
  // (le ménage n'impacte pas le proprio si tu le gères à part)
  const net = housing - commission - consum - exp;

  $('closeMsg').textContent = "Enregistrement…";

  // 1) Save platform payouts (si tu utilises platform_payouts)
  const pRows = [
    { property_id: pid, platform:'airbnb', period_start:start, period_end:end, housing_revenue:aH, platform_fees:aF, cleaning_collected: aC },
    { property_id: pid, platform:'booking', period_start:start, period_end:end, housing_revenue:bH, platform_fees:bF, cleaning_collected: bC },
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
      platform_fees_total: (aF + bF),

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
          <div class="title">Résumé (clair)</div>
          <div class="row"><span>Revenus logement</span><b>${money(housingTotal)}</b></div>
          <div class="row"><span>Commission Zenata</span><b>-${money(clo.commission_amount||0)}</b></div>
          <div class="row"><span>Consommables</span><b>-${money(clo.consumables_amount||0)}</b></div>
          <div class="row"><span>Dépenses refacturées</span><b>-${money(expTotal)}</b></div>
          <div class="row"><span>Ménages</span><b>-${money(cleaningTotal)}</b></div>
          <hr/>
          <div class="total"><span>À verser au propriétaire</span><span>${money(clo.net_owner_amount||0)}</span></div>
          <div class="note">Le ménage collecté n’est pas inclus dans le net (géré séparément).</div>
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
              <td class="right">${money(air.cleaning_collected||0)}</td>
              <td class="right">-${money(air.platform_fees||0)}</td>
            </tr>
            <tr>
              <td><span class="pill">Booking</span></td>
              <td class="right">${money(boo.housing_revenue||0)}</td>
              <td class="right">${money(boo.cleaning_collected||0)}</td>
              <td class="right">-${money(boo.platform_fees||0)}</td>
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <th>Total</th>
              <th class="right">${money(housingTotal)}</th>
              <th class="right">${money(cleaningTotal)}</th>
              <th class="right">-${money(feesTotal)}</th>
            </tr>
          </tfoot>
        </table>
        <div class="note">Cash collecté (logement + ménage) : <b>${money(housingTotal + cleaningTotal)}</b> (avant frais plateformes)</div>
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
['airbnbHousing','airbnbFees','bookingHousing','bookingFees','cConsumables'].forEach(id=>{
  $(id) && ($(id).oninput = calcClosing);
});
  $('btnOwnerStatement') && ($('btnOwnerStatement').onclick = ownerStatement);



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

