// ===============================
// CZ Finance - Monthly Closing UI
// ===============================

const SUPABASE_URL = "https://ojgchrqtvkwzhjvwwftd.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9qZ2NocnF0dmt3emhqdnd3ZnRkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk2OTMxODEsImV4cCI6MjA3NTI2OTE4MX0.Ok7fj3QUs28Q8dOiNy6caSBmjcUmjFrZgmIvAnzJZ00";
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const $ = (id) => document.getElementById(id);

function money(n){
  const v = Number(n || 0);
  return v.toLocaleString('fr-MA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " MAD";
}
function badge(status){
  if(status === 'locked') return `<span class="badge locked">Locked</span>`;
  return `<span class="badge draft">Draft</span>`;
}

async function requireAdmin(){
  const { data: { user } } = await supabase.auth.getUser();
  if(!user){ alert("Non connecté (Supabase Auth)."); return false; }

  const { data, error } = await supabase
    .from('admin_users')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle();

  if(error || !data){ alert("Accès refusé (admin only)."); return false; }
  return true;
}

function monthRange(yyyyMm){
  const [y, m] = yyyyMm.split('-').map(Number);
  const start = new Date(y, m - 1, 1);
  const end = new Date(y, m, 0); // last day previous month index trick
  return { start: start.toISOString().slice(0,10), end: end.toISOString().slice(0,10) };
}

async function loadProperties(){
  const { data, error } = await supabase
    .from('properties')
    .select('id,name,owner_id,prospect_id')
    .order('name', { ascending:true });

  if(error) throw error;

  $('selProperty').innerHTML = data.map(p => `<option value="${p.id}">${p.name}</option>`).join('')
    || `<option value="">Aucun bien</option>`;
}

async function loadClosings(propertyId){
  const { data, error } = await supabase
    .from('monthly_closings')
    .select('id,period_start,period_end,status,net_owner_amount')
    .eq('property_id', propertyId)
    .order('period_end', { ascending:false })
    .limit(12);

  if(error) throw error;

  const tbody = $('tblClosings').querySelector('tbody');
  tbody.innerHTML = (data || []).map(c => `
    <tr>
      <td>${c.period_start} → ${c.period_end}</td>
      <td>${badge(c.status)}</td>
      <td><b>${money(c.net_owner_amount)}</b></td>
      <td class="muted">${c.status === 'locked' ? 'OK' : '—'}</td>
    </tr>
  `).join('') || `<tr><td colspan="4" class="muted">Aucun closing</td></tr>`;
}

async function loadOwnerBalance(propertyId){
  const { data, error } = await supabase
    .from('v_owner_balance')
    .select('balance')
    .eq('property_id', propertyId)
    .maybeSingle();

  if(error) throw error;
  $('ownerBalance').textContent = money(data?.balance || 0);
}

let lastPreview = null; // keep last preview row
let lastClosingId = null;

async function preview(){
  const propertyId = $('selProperty').value;
  const month = $('inpMonth').value;
  if(!propertyId || !month){ $('status').textContent = "Choisis bien + mois."; return; }

  const { start, end } = monthRange(month);
  $('status').textContent = "Calcul…";

  const { data, error } = await supabase.rpc('calc_monthly_summary', {
    p_property_id: propertyId,
    p_period_start: start,
    p_period_end: end
  });

  if(error){
    console.error(error);
    $('status').textContent = "Erreur: " + error.message;
    return;
  }

  // rpc returns array (table function)
  const row = Array.isArray(data) ? data[0] : data;
  lastPreview = row;

  $('kpiPayout').textContent = money(row?.payout_total);
  $('kpiCommission').textContent = money(row?.commission_amount);
  $('kpiConsumables').textContent = money(row?.consumables_amount);
  $('kpiBillables').textContent = money(row?.billable_expenses_amount);

  $('vGross').textContent = money(row?.gross_total);
  $('vCleaning').textContent = money(row?.cleaning_collected_total);
  $('vHousing').textContent = money(row?.housing_revenue_total);
  $('vPlatformFees').textContent = money(row?.platform_fees_total);

  const adj = Number($('inpAdjust').value || 0);
  const netWithAdj = Number(row?.net_owner_amount || 0) + adj;

  $('kpiNetOwner').textContent = money(netWithAdj);
  $('ownerMeta').textContent = `Période ${start} → ${end} • Commission base: ${row?.commission_base} • Taux: ${(Number(row?.commission_rate||0)*100).toFixed(0)}%`;

  await loadClosings(propertyId);
  await loadOwnerBalance(propertyId);

  $('status').textContent = "Preview OK ✅";
}

async function closeMonth(){
  const propertyId = $('selProperty').value;
  const month = $('inpMonth').value;
  if(!propertyId || !month){ $('status').textContent = "Choisis bien + mois."; return; }

  const { start, end } = monthRange(month);
  const adj = Number($('inpAdjust').value || 0);
  const notes = $('inpNotes').value || null;
  const vatRate = Number($('inpVat').value || 0);

  $('status').textContent = "Clôture…";

  // 1) close_month -> returns closing_id
  const { data: closingId, error: e1 } = await supabase.rpc('close_month', {
    p_property_id: propertyId,
    p_period_start: start,
    p_period_end: end,
    p_adjustments: adj,
    p_notes: notes
  });

  if(e1){
    console.error(e1);
    $('status').textContent = "Erreur close_month: " + e1.message;
    return;
  }

  lastClosingId = closingId;

  // 2) create Zenata invoice from closing
  const { error: e2 } = await supabase.rpc('create_zenata_invoice_from_closing', {
    p_closing_id: closingId,
    p_vat_rate: vatRate
  });

  if(e2){
    console.error(e2);
    $('status').textContent = "Closing OK, mais erreur facture CZ: " + e2.message;
    // still allow lock
    return;
  }

  $('status').textContent = "Closing + facture CZ ✅";
  await preview();
}

async function lock(){
  if(!lastClosingId){
    $('status').textContent = "Fais d’abord un closing (ou recharge et sélectionne le mois).";
    return;
  }
  $('status').textContent = "Verrouillage…";
  const { error } = await supabase.rpc('lock_closing', { p_closing_id: lastClosingId });
  if(error){
    console.error(error);
    $('status').textContent = "Erreur lock: " + error.message;
    return;
  }
  $('status').textContent = "Locked ✅";
  await preview();
}

async function main(){
  const ok = await requireAdmin();
  if(!ok) return;

  // default month = last month
  const now = new Date();
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  $('inpMonth').value = lastMonth.toISOString().slice(0,7);

  $('btnPreview').addEventListener('click', preview);
  $('btnClose').addEventListener('click', closeMonth);
  $('btnLock').addEventListener('click', lock);
  $('btnRefresh').addEventListener('click', preview);
  $('btnLogout').addEventListener('click', async () => { await supabase.auth.signOut(); location.reload(); });

  $('selProperty').addEventListener('change', () => {
    lastClosingId = null;
    $('status').textContent = "Bien changé — recalcul preview.";
    preview();
  });
  $('inpMonth').addEventListener('change', () => {
    lastClosingId = null;
    preview();
  });
  $('inpAdjust').addEventListener('input', () => {
    if(!lastPreview) return;
    const adj = Number($('inpAdjust').value || 0);
    $('kpiNetOwner').textContent = money(Number(lastPreview.net_owner_amount || 0) + adj);
  });

  await loadProperties();
  await preview();
}

main().catch(err => {
  console.error(err);
  alert("Erreur chargement closings: " + err.message);
});

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

