// =============================
//  CZ Finance - Admin (MVP v1)
// =============================

// 1) Configure Supabase
const SUPABASE_URL = "https://ojgchrqtvkwzhjvwwftd.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9qZ2NocnF0dmt3emhqdnd3ZnRkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk2OTMxODEsImV4cCI6MjA3NTI2OTE4MX0.Ok7fj3QUs28Q8dOiNy6caSBmjcUmjFrZgmIvAnzJZ00";
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// UI
const $ = (id) => document.getElementById(id);

function money(n){
  const v = Number(n || 0);
  return v.toLocaleString('fr-MA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " MAD";
}

function badge(status){
  if(status === 'paid') return `<span class="badge ok">Payée</span>`;
  if(status === 'sent') return `<span class="badge warn">Envoyée</span>`;
  if(status === 'draft') return `<span class="badge">Brouillon</span>`;
  return `<span class="badge danger">${status}</span>`;
}

async function requireAdmin(){
  const { data: { user } } = await supabase.auth.getUser();
  if(!user){
    // if you already have your own admin token system, redirect to it.
    alert("Non connecté. Ouvre la page login admin (Supabase Auth).");
    return false;
  }

  const { data, error } = await supabase
    .from('admin_users')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle();

  if(error || !data){
    alert("Accès refusé (admin only).");
    return false;
  }
  return true;
}

async function loadProperties(){
  const { data, error } = await supabase
    .from('properties')
    .select('id,name,owner_id')
    .order('name', { ascending: true });

  if(error) throw error;

  const opts = data.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
  $('selProperty').innerHTML = opts || `<option value="">Aucun bien</option>`;
  $('selExpenseProperty').innerHTML = opts || `<option value="">Aucun bien</option>`;
}

async function loadCategories(){
  const { data, error } = await supabase
    .from('expense_categories')
    .select('id,code,label')
    .order('label', { ascending: true });

  if(error) throw error;

  $('selCategory').innerHTML = data.map(c => `<option value="${c.id}">${c.label}</option>`).join('');
}

function last30DaysRange(){
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - 30);
  return {
    start: start.toISOString().slice(0,10),
    end: end.toISOString().slice(0,10),
  };
}

async function loadKPIs(){
  const { start, end } = last30DaysRange();

  // billed last 30 days (invoices.total)
  const inv = await supabase
    .from('invoices')
    .select('total,status,issued_at')
    .gte('issued_at', start + 'T00:00:00.000Z')
    .lte('issued_at', end + 'T23:59:59.999Z');

  if(inv.error) throw inv.error;

  const billed = inv.data.reduce((acc, r) => acc + Number(r.total || 0), 0);
  const draft = inv.data.filter(r => r.status === 'draft').length;

  $('kpiBilled').textContent = money(billed);
  $('kpiDraft').textContent = String(draft);

  // billable expenses 30j
  const exp = await supabase
    .from('expenses')
    .select('amount,bill_to_owner,owner_markup_rate,expense_date')
    .gte('expense_date', start)
    .lte('expense_date', end)
    .eq('bill_to_owner', true);

  if(exp.error) throw exp.error;

  const expBilled = exp.data.reduce((acc, r) => {
    const amt = Number(r.amount || 0);
    const mk = Number(r.owner_markup_rate || 0);
    return acc + Math.round((amt * (1 + mk)) * 100) / 100;
  }, 0);

  $('kpiBillableExpenses').textContent = money(expBilled);

  // cleaning services 30j
  const st = await supabase.from('service_types').select('id,code').eq('code','CLEANING').maybeSingle();
  if(st.error) throw st.error;

  if(st.data){
    const clean = await supabase
      .from('services')
      .select('bill_amount,service_date,bill_to_owner,service_type_id')
      .eq('bill_to_owner', true)
      .eq('service_type_id', st.data.id)
      .gte('service_date', start)
      .lte('service_date', end);

    if(clean.error) throw clean.error;

    const csum = clean.data.reduce((a,r)=>a+Number(r.bill_amount||0),0);
    $('kpiCleaning').textContent = money(csum);
  } else {
    $('kpiCleaning').textContent = money(0);
  }
}

async function loadInvoices(){
  const { data, error } = await supabase
    .from('invoices')
    .select('id, invoice_number, status, total, period_start, period_end, properties(name)')
    .order('issued_at', { ascending: false })
    .limit(20);

  if(error) throw error;

  const tbody = $('tblInvoices').querySelector('tbody');
  tbody.innerHTML = data.map(inv => {
    const propName = inv.properties?.name || '—';
    const period = `${inv.period_start} → ${inv.period_end}`;
    return `
      <tr>
        <td>${inv.invoice_number || '—'}</td>
        <td>${propName}</td>
        <td>${period}</td>
        <td>${badge(inv.status)}</td>
        <td><b>${money(inv.total)}</b></td>
        <td>
          <button class="btn" onclick="openInvoice('${inv.id}')">Ouvrir</button>
        </td>
      </tr>
    `;
  }).join('') || `<tr><td colspan="6" class="muted">Aucune facture</td></tr>`;
}

async function loadExpenses(){
  const { data, error } = await supabase
    .from('expenses')
    .select('expense_date, description, amount, bill_to_owner, owner_markup_rate, properties(name)')
    .order('expense_date', { ascending: false })
    .limit(20);

  if(error) throw error;

  const tbody = $('tblExpenses').querySelector('tbody');
  tbody.innerHTML = data.map(e => {
    const propName = e.properties?.name || '—';
    const ref = e.bill_to_owner ? 'Oui' : 'Non';
    return `
      <tr>
        <td>${e.expense_date}</td>
        <td>${propName}</td>
        <td>${(e.description||'').slice(0,60)}</td>
        <td>${money(e.amount)}</td>
        <td>${ref}</td>
      </tr>
    `;
  }).join('') || `<tr><td colspan="5" class="muted">Aucune dépense</td></tr>`;
}

async function generateInvoice(){
  const propertyId = $('selProperty').value;
  const start = $('inpStart').value;
  const end = $('inpEnd').value;

  if(!propertyId || !start || !end){
    $('genStatus').textContent = "Choisis un bien + période.";
    return;
  }

  $('genStatus').textContent = "Génération…";

  const { data, error } = await supabase.rpc('generate_monthly_invoice', {
    p_property_id: propertyId,
    p_period_start: start,
    p_period_end: end
  });

  if(error){
    console.error(error);
    $('genStatus').textContent = "Erreur: " + error.message;
    return;
  }

  $('genStatus').textContent = "Facture générée ✅";
  await refreshAll();
  openInvoice(data);
}

async function addExpense(){
  const propertyId = $('selExpenseProperty').value;
  const expense_date = $('expDate').value;
  const amount = Number($('expAmount').value || 0);
  const description = $('expDesc').value || '';
  const bill_to_owner = $('expBill').checked;
  const owner_markup_rate = Number($('expMarkup').value || 0);
  const category_id = $('selCategory').value;

  if(!propertyId || !expense_date || !amount){
    $('expStatus').textContent = "Bien + date + montant requis.";
    return;
  }

  $('expStatus').textContent = "Ajout…";

  const { error } = await supabase.from('expenses').insert([{
    property_id: propertyId,
    expense_date,
    amount,
    description,
    bill_to_owner,
    owner_markup_rate,
    category_id
  }]);

  if(error){
    console.error(error);
    $('expStatus').textContent = "Erreur: " + error.message;
    return;
  }

  $('expStatus').textContent = "Dépense ajoutée ✅";
  $('expAmount').value = '';
  $('expDesc').value = '';
  $('expBill').checked = false;
  $('expMarkup').value = '0';
  await refreshAll();
}

window.openInvoice = async function(invoiceId){
  // Open printable invoice page with query param
  window.open(`./invoice.html?id=${encodeURIComponent(invoiceId)}`, '_blank');
};

async function refreshAll(){
  await Promise.all([
    loadKPIs(),
    loadInvoices(),
    loadExpenses(),
  ]);
}

async function main(){
  const ok = await requireAdmin();
  if(!ok) return;

  // Default period = last month
  const now = new Date();
  const firstThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastMonthEnd = new Date(firstThisMonth.getTime() - 1);
  const lastMonthStart = new Date(lastMonthEnd.getFullYear(), lastMonthEnd.getMonth(), 1);

  $('inpStart').value = lastMonthStart.toISOString().slice(0,10);
  $('inpEnd').value = lastMonthEnd.toISOString().slice(0,10);

  $('expDate').value = new Date().toISOString().slice(0,10);

  $('btnGenerate').addEventListener('click', generateInvoice);
  $('btnAddExpense').addEventListener('click', addExpense);
  $('btnRefresh').addEventListener('click', refreshAll);
  $('btnLogout').addEventListener('click', async () => {
    await supabase.auth.signOut();
    location.reload();
  });

  await loadProperties();
  await loadCategories();
  await refreshAll();
}

main().catch(err => {
  console.error(err);
  alert("Erreur chargement Finance: " + err.message);
});
