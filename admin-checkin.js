const $ = id => document.getElementById(id);
let adminToken = localStorage.getItem('cz_admin_checkin_token');

const show = id => $(id).classList.remove('hidden');
const hide = id => $(id).classList.add('hidden');

async function api(path, body) {
  const r = await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const j = await r.json();
  if(!r.ok) throw new Error(j.error||'Erreur');
  return j;
}

async function login(){
  const out = await api('/.netlify/functions/admin-login',{password:$('pw').value});
  adminToken = out.token;
  localStorage.setItem('cz_admin_checkin_token',adminToken);
  initAdmin();
}

async function initAdmin(){
  hide('loginBox');
  show('createBox'); show('arrivalsBox');
  await loadProperties();
}

async function loadProperties(){
  const out = await api('/.netlify/functions/admin-list-properties',{admin_token:adminToken});
  $('property_id').innerHTML = out.properties.map(p=>`<option value="${p.id}">${p.name}</option>`).join('');
}

async function createLink(){
  const out = await api('/.netlify/functions/admin-create-reservation',{
    admin_token:adminToken,
    property_id:$('property_id').value,
    arrival_date:$('arrival').value,
    departure_date:$('departure').value
  });
  $('generatedLink').value = out.link;
}

async function loadArrivals(){
  const out = await api('/.netlify/functions/admin-list-arrivals',{
    admin_token:adminToken,
    date_from:$('from').value,
    date_to:$('to').value
  });
  $('list').innerHTML = out.arrivals.map(a=>`
    <tr>
      <td>${a.arrival_date} → ${a.departure_date}</td>
      <td>${a.property_name}</td>
      <td><span class="badge ${a.status}">${a.status}</span></td>
      <td><button onclick="loadDetail('${a.id}')">Ouvrir</button></td>
    </tr>
  `).join('');
}

async function loadDetail(id){
  const out = await api('/.netlify/functions/admin-get-reservation',{
    admin_token:adminToken,reservation_id:id
  });
  show('detailBox');
  $('detail').innerHTML = `
    <pre>${JSON.stringify(out,null,2)}</pre>
  `;
}

$('btnLogin').onclick = login;
$('btnCreateLink').onclick = createLink;
$('btnLoad').onclick = loadArrivals;
$('btnCopyLink').onclick = ()=>navigator.clipboard.writeText($('generatedLink').value);

if(adminToken) initAdmin();

