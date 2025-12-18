// =============================
//  CZ Finance - Admin (MVP v1)
// =============================

// 1) Configure Supabase
const SUPABASE_URL = "https://ojgchrqtvkwzhjvwwftd.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9qZ2NocnF0dmt3emhqdnd3ZnRkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk2OTMxODEsImV4cCI6MjA3NTI2OTE4MX0.Ok7fj3QUs28Q8dOiNy6caSBmjcUmjFrZgmIvAnzJZ00";
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const $ = (id) => document.getElementById(id);

function money(n){
  const v = Number(n || 0);
  return v.toLocaleString('fr-MA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " MAD";
}
function monthRange(yyyyMm){
  const [y, m] = yyyyMm.split('-').map(Number);
  const start = new Date(y, m - 1, 1);
  const end = new Date(y, m, 0);
  return { start: start.toISOString().slice(0,10), end: end.toISOString().slice(0,10) };
}
function badge(status){
  return status === 'locked'
    ? `<span class="badge locked">Locked</span>`
    : `<span class="badge draft">Draft</span>`;
}
async function ensureAdmin(){
  const { data: userRes, error: userErr } = await supabase.auth.getUser();
  const user = userRes?.user;

  if (userErr) {
    console.error("getUser error:", userErr);
    return { ok:false, reason:"no_user" };
  }
  if (!user) return { ok:false, reason:"no_user" };

  const { data, error } = await supabase
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


async function showLogin(msg=""){
  $('app').classList.add('hidden');
  $('login').classList.remove('hidden');
  $('authMsg').textContent = msg;
}
async function showApp(user){
  $('login').classList.add('hidden');
  $('app').classList.remove('hidden');
  $('whoami').textContent = user?.email || "admin";
}

function setTab(tab){
  document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
  document.querySelector(`.nav-item[data-tab="${tab}"]`)?.classList.add('active');

  document.querySelectorAll('.tab').forEach(t => t.classList.add('hidden'));
  $(`tab-${tab}`)?.classList.remove('hidden');

  const map = {
    overview: ["Résumé", "Les chiffres importants, sans jargon."],
    closing: ["Clôture du mois", "Tu suis les étapes : choisir → vérifier → clôturer → verrouiller."],
    owners: ["Propriétaires", "Tu vois directement qui doit recevoir combien."],
    cash: ["Trésorerie", "Combien on a en banque et d’où ça vient."],
    settings: ["Réglages", "Règles simples. On évite les options inutiles."]
  };
  $('pageTitle').textContent = map[tab][0];
  $('pageSub').textContent = map[tab][1];
}

async function loadProperties(){
  const { data, error } = await supabase
    .from('properties')
    .select('id,name')
    .order('name', { ascending:true });

  if(error) throw error;

  $('selProperty').innerHTML = (data || []).map(p => `<option value="${p.id}">${p.name}</option>`).join('')
    || `<option value="">Aucun bien</option>`;
}

async function loadOverview(){
  // 1) CA Zenata (sum of invoices in current month)
  const now = new Date();
  const month = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  const { start, end } = monthRange(month);

  const inv = await supabase
    .from('zenata_invoices')
    .select('total, issued_date')
    .gte('issued_date', start)
    .lte('issued_date', end);

  const revenue = (inv.data || []).reduce((s,r)=>s+Number(r.total||0),0);
  $('kpiRevenue').textContent = money(revenue);

  // 2) Dette propriétaires (sum balances)
  const bal = await supabase
    .from('v_owner_balance_by_owner')
    .select('balance');
  const ownerDebt = (bal.data || []).reduce((s,r)=>s+Number(r.balance||0),0);
  $('kpiOwnerDebt').textContent = money(ownerDebt);

  // 3) Cash
  const cash = await supabase
    .from('v_cash_balance')
    .select('balance');
  const cashTotal = (cash.data || []).reduce((s,r)=>s+Number(r.balance||0),0);
  $('kpiCash').textContent = money(cashTotal);

  // 4) Pending closings (rough heuristic): properties count - locked closings count for month
  const props = await supabase.from('properties').select('id');
  const locked = await supabase
    .from('monthly_closings')
    .select('id,property_id,status,period_start,period_end')
    .eq('status','locked')
    .gte('period_start', start)
    .lte('period_end', end);

  const pending = Math.max(0, (props.data?.length||0) - (locked.data?.length||0));
  $('kpiPending').textContent = String(pending);

  // TODO list
  const todo = [];
  if(pending > 0) todo.push({ t:`Faire ${pending} clôture(s) ce mois-ci`, a:`Aller à “Clôture du mois”`, tab:'closing' });
  if(ownerDebt > 0) todo.push({ t:`Verser aux propriétaires (solde à payer)`, a:`Voir “Propriétaires”`, tab:'owners' });
  if((cash.data?.length||0) === 0) todo.push({ t:`Ajouter un compte bancaire`, a:`Voir “Trésorerie”`, tab:'cash' });

  $('todo').innerHTML = (todo.length ? todo : [{t:"Rien d’urgent ✅", a:"Tout est à jour"}]).map(x => `
    <div class="todo-item">
      <div><b>${x.t}</b><div class="muted">${x.a}</div></div>
      ${x.tab ? `<button class="btn" data-goto="${x.tab}">Ouvrir</button>` : ``}
    </div>
  `).join('');

  document.querySelectorAll('[data-goto]').forEach(b => b.onclick = () => setTab(b.dataset.goto));
}

let lastPreview = null;
let lastClosingId = null;

async function previewClosing(){
  const propertyId = $('selProperty').value;
  const month = $('inpMonth').value;
  if(!propertyId || !month){ $('closeMsg').textContent = "Choisis un bien et un mois."; return; }

  const { start, end } = monthRange(month);
  $('closeMsg').textContent = "Calcul…";

  const { data, error } = await supabase.rpc('calc_monthly_summary', {
    p_property_id: propertyId,
    p_period_start: start,
    p_period_end: end
  });

  if(error){ $('closeMsg').textContent = "Erreur: " + error.message; return; }

  const row = Array.isArray(data) ? data[0] : data;
  lastPreview = row;

  const adj = Number($('inpAdjust').value || 0);
  $('cPayout').textContent = money(row?.payout_total);
  $('cComm').textContent = money(row?.commission_amount);
  $('cConsum').textContent = money(row?.consumables_amount);
  $('cBill').textContent = money(row?.billable_expenses_amount);
  $('cGross').textContent = money(row?.gross_total);
  $('cClean').textContent = money(row?.cleaning_collected_total);

  $('cNet').textContent = money(Number(row?.net_owner_amount||0) + adj);
  $('cMeta').textContent = `${start} → ${end} • Base: ${row?.commission_base} • Taux ${(Number(row?.commission_rate||0)*100).toFixed(0)}%`;

  await loadClosingHistory(propertyId);
  $('closeMsg').textContent = "OK ✅ Vérifie puis clôture.";
}

async function loadClosingHistory(propertyId){
  const { data, error } = await supabase
    .from('monthly_closings')
    .select('id,period_start,period_end,status,net_owner_amount')
    .eq('property_id', propertyId)
    .order('period_end', { ascending:false })
    .limit(10);

  if(error) return;

  $('tblClosings').querySelector('tbody').innerHTML = (data||[]).map(c => `
    <tr>
      <td>${c.period_start} → ${c.period_end}</td>
      <td>${badge(c.status)}</td>
      <td><b>${money(c.net_owner_amount)}</b></td>
    </tr>
  `).join('') || `<tr><td colspan="3" class="muted">Aucune clôture</td></tr>`;
}

async function doClose(){
  const propertyId = $('selProperty').value;
  const month = $('inpMonth').value;
  if(!propertyId || !month){ $('closeMsg').textContent = "Choisis un bien et un mois."; return; }

  const { start, end } = monthRange(month);
  const adj = Number($('inpAdjust').value || 0);
  const notes = $('inpNotes').value || null;
  const vatRate = Number($('inpVat').value || 0);

  $('closeMsg').textContent = "Clôture…";

  const { data: closingId, error: e1 } = await supabase.rpc('close_month', {
    p_property_id: propertyId,
    p_period_start: start,
    p_period_end: end,
    p_adjustments: adj,
    p_notes: notes
  });
  if(e1){ $('closeMsg').textContent = "Erreur clôture: " + e1.message; return; }
  lastClosingId = closingId;

  const { error: e2 } = await supabase.rpc('create_zenata_invoice_from_closing', {
    p_closing_id: closingId,
    p_vat_rate: vatRate
  });
  if(e2){ $('closeMsg').textContent = "Clôture OK, erreur facture: " + e2.message; return; }

  $('closeMsg').textContent = "Clôture + facture ✅";
  await previewClosing();
  await loadOverview();
}

async function doLock(){
  if(!lastClosingId){ $('closeMsg').textContent = "Clôture d’abord, puis verrouille."; return; }
  $('closeMsg').textContent = "Verrouillage…";
  const { error } = await supabase.rpc('lock_closing', { p_closing_id: lastClosingId });
  if(error){ $('closeMsg').textContent = "Erreur lock: " + error.message; return; }
  $('closeMsg').textContent = "Locked ✅";
  await previewClosing();
  await loadOverview();
}

async function loadOwners(q=""){
  const { data, error } = await supabase
    .from('owners')
    .select('id,full_name,email')
    .order('full_name', { ascending:true })
    .limit(100);
  if(error) return;

  // balances by owner
  const bal = await supabase.from('v_owner_balance_by_owner').select('owner_id,balance');
  const map = new Map((bal.data||[]).map(x => [x.owner_id, Number(x.balance||0)]));

  const filtered = (data||[]).filter(o => {
    const s = (o.full_name||"") + " " + (o.email||"");
    return s.toLowerCase().includes((q||"").toLowerCase());
  });

  $('tblOwners').querySelector('tbody').innerHTML = filtered.map(o => `
    <tr>
      <td><b>${o.full_name||"—"}</b></td>
      <td class="muted">${o.email||"—"}</td>
      <td><b>${money(map.get(o.id)||0)}</b></td>
    </tr>
  `).join('') || `<tr><td colspan="3" class="muted">Aucun propriétaire</td></tr>`;
}

async function loadCash(){
  const { data } = await supabase.from('v_cash_balance').select('account_name,balance');
  $('tblCash').querySelector('tbody').innerHTML = (data||[]).map(r => `
    <tr>
      <td><b>${r.account_name}</b></td>
      <td><b>${money(r.balance)}</b></td>
    </tr>
  `).join('') || `<tr><td colspan="2" class="muted">Aucun compte</td></tr>`;
}

let loginInFlight = false;

async function loginEmailPassword(){
  if (loginInFlight) return;               // bloque double clic
  loginInFlight = true;

  const email = $('authEmail').value.trim();
  const password = $('authPassword').value;

  $('btnLogin').disabled = true;
  $('btnMagic').disabled = true;
  $('authMsg').textContent = "Connexion…";

  try {
    const res = await supabase.auth.signInWithPassword({ email, password });

    if (res?.error) {
      // Gestion rate limit
      const msg = res.error.message || "";
      if (msg.includes("429") || msg.toLowerCase().includes("rate") || msg.toLowerCase().includes("too many")) {
        $('authMsg').textContent = "Trop de tentatives. Réessaie plus tard (limite Supabase).";
      } else {
        $('authMsg').textContent = "Erreur: " + msg;
      }
      console.error("Auth error:", res.error);
      return;
    }

    $('authMsg').textContent = "Connecté ✅";
    await boot();

  } catch (e) {
    const m = (e?.message || String(e));
    if (m.includes("429")) $('authMsg').textContent = "Rate limit Supabase (429). Réessaie plus tard.";
    else $('authMsg').textContent = "Erreur: " + m;
    console.error(e);
  } finally {
    loginInFlight = false;
    $('btnLogin').disabled = false;
    $('btnMagic').disabled = false;
  }
}

let otpInFlight = false;

async function magicLink(){
  if (otpInFlight) return;
  otpInFlight = true;

  const email = $('authEmail').value.trim();
  if(!email){ $('authMsg').textContent = "Entre ton email."; otpInFlight=false; return; }

  $('btnLogin').disabled = true;
  $('btnMagic').disabled = true;
  $('authMsg').textContent = "Envoi du lien…";

  try {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.href }
    });

    if(error){
      const msg = error.message || "";
      if (msg.includes("429") || msg.toLowerCase().includes("too many")) {
        $('authMsg').textContent = "Trop de demandes de lien. Réessaie plus tard.";
      } else {
        $('authMsg').textContent = "Erreur: " + msg;
      }
      console.error("OTP error:", error);
      return;
    }

    $('authMsg').textContent = "Lien envoyé ✅ (si SMTP configuré).";

  } finally {
    otpInFlight = false;
    $('btnLogin').disabled = false;
    $('btnMagic').disabled = false;
  }
}


async function boot(){
   const a = await ensureAdmin();

  if(!a.ok){
    if(a.reason === "no_user") return showLogin("");
    if(a.reason === "admin_check_failed") return showLogin("Erreur lecture admin_users (RLS). Applique la policy self_read.");
    return showLogin("Accès refusé : tu n’es pas admin (table admin_users).");
  }

  showApp(a.user);

  // Default month = last month
  const now = new Date();
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  $('inpMonth').value = lastMonth.toISOString().slice(0,7);

  await loadProperties();
  await loadOverview();
  await previewClosing();
  await loadOwners();
  await loadCash();
}

function wire(){
  // tabs
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.onclick = async () => {
      setTab(btn.dataset.tab);
      if(btn.dataset.tab === 'overview') await loadOverview();
      if(btn.dataset.tab === 'closing') await previewClosing();
      if(btn.dataset.tab === 'owners') await loadOwners($('ownerSearch').value||"");
      if(btn.dataset.tab === 'cash') await loadCash();
    };
  });

  $('btnReload').onclick = async () => {
    await loadOverview();
    await previewClosing();
    await loadOwners($('ownerSearch').value||"");
    await loadCash();
  };

  $('btnPreview').onclick = previewClosing;
  $('btnClose').onclick = doClose;
  $('btnLock').onclick = doLock;

  $('selProperty').onchange = () => { lastClosingId = null; previewClosing(); };
  $('inpMonth').onchange = () => { lastClosingId = null; previewClosing(); };
  $('inpAdjust').oninput = () => {
    if(!lastPreview) return;
    const adj = Number($('inpAdjust').value||0);
    $('cNet').textContent = money(Number(lastPreview.net_owner_amount||0)+adj);
  };

  $('ownerSearch').oninput = () => loadOwners($('ownerSearch').value||"");

  $('btnLogin').onclick = loginEmailPassword;
  $('btnMagic').onclick = magicLink;

  $('btnLogout').onclick = async () => { await supabase.auth.signOut(); location.reload(); };

  supabase.auth.onAuthStateChange((event,_session) => {
  if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'TOKEN_REFRESHED') {
    boot();
  }
});

}

wire();
boot();

