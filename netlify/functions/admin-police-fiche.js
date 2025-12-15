const { verifyAdminToken } = require('./_admin_common');
const { sbAdmin } = require('./_checkin_common');

exports.handler = async (event) => {
  try {
    const { admin_token, reservation_id, guest_id } = JSON.parse(event.body || '{}');
    verifyAdminToken(admin_token);

    if (!reservation_id || !guest_id) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Missing reservation_id or guest_id' }) };
    }

    const sb = sbAdmin();

    const { data: resv, error: rErr } = await sb
      .from('checkin_reservations')
      .select('*')
      .eq('id', reservation_id)
      .single();
    if (rErr) throw rErr;

    const { data: guest, error: gErr } = await sb
      .from('checkin_guests')
      .select('*')
      .eq('id', guest_id)
      .single();
    if (gErr) throw gErr;

    // Simple printable HTML (you can improve later)
    const html = `<!doctype html>
<html><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Fiche Police</title>
<style>
  body{font-family:system-ui,Segoe UI,Roboto,Arial; margin:24px; color:#111}
  h1{margin:0 0 12px}
  .muted{color:#666}
  .grid{display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-top:14px}
  .box{border:1px solid #ddd; border-radius:12px; padding:12px}
  .k{font-size:12px; color:#666; text-transform:uppercase; letter-spacing:.03em}
  .v{font-weight:700; margin-top:4px}
  .print{position:fixed; top:14px; right:14px}
  @media print { .print{display:none} }
</style>
</head>
<body>
<button class="print" onclick="window.print()">Imprimer / PDF</button>

<h1>Fiche de Police</h1>
<div class="muted">Réservation: ${escapeHtml(resv.id)} • Arrivée: ${escapeHtml(resv.arrival_date)} • Départ: ${escapeHtml(resv.departure_date)}</div>

<div class="grid">
  <div class="box"><div class="k">Nom</div><div class="v">${escapeHtml(guest.last_name || '')}</div></div>
  <div class="box"><div class="k">Prénom</div><div class="v">${escapeHtml(guest.first_name || '')}</div></div>
  <div class="box"><div class="k">Sexe</div><div class="v">${escapeHtml(guest.sex || '')}</div></div>
  <div class="box"><div class="k">Nationalité</div><div class="v">${escapeHtml(guest.nationality || '')}</div></div>
  <div class="box"><div class="k">Date de naissance</div><div class="v">${escapeHtml(guest.dob || '')}</div></div>
  <div class="box"><div class="k">Pays de résidence</div><div class="v">${escapeHtml(guest.res_country || '')}</div></div>
  <div class="box"><div class="k">Ville de résidence</div><div class="v">${escapeHtml(guest.res_city || '')}</div></div>
  <div class="box"><div class="k">Adresse</div><div class="v">${escapeHtml(guest.address || '')}</div></div>
  <div class="box"><div class="k">Type pièce</div><div class="v">${escapeHtml(guest.id_type || '')}</div></div>
  <div class="box"><div class="k">Numéro pièce</div><div class="v">${escapeHtml(guest.id_number || '')}</div></div>
</div>

</body></html>`;

    return { statusCode: 200, headers: { 'Content-Type': 'text/html' }, body: html };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message || String(e) }) };
  }
};

function escapeHtml(s) {
  return String(s ?? '')
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'","&#039;");
}
