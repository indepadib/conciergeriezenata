const { verifyAdminToken } = require('./_admin_common');
const { sbAdmin } = require('./_checkin_common');

exports.handler = async (event) => {
  try {
    const { admin_token, reservation_id, guest_id } = JSON.parse(event.body || '{}');
    verifyAdminToken(admin_token);

    if (!reservation_id || !guest_id) {
      return { statusCode: 400, body: 'Missing reservation_id or guest_id' };
    }

    const sb = sbAdmin();

    // Reservation
    const { data: resv } = await sb
      .from('checkin_reservations')
      .select('arrival_date, departure_date, is_moroccan_couple, property_id')
      .eq('id', reservation_id)
      .single();

    // Property
    const { data: property } = await sb
      .from('properties')
      .select('name')
      .eq('id', resv.property_id)
      .single();

    // Guest
    const { data: guest } = await sb
      .from('checkin_guests')
      .select('*')
      .eq('id', guest_id)
      .single();

    // Guest documents
    const { data: guestDocs } = await sb
      .from('checkin_guest_documents')
      .select('*')
      .eq('guest_id', guest_id);

    // Reservation documents (marriage, signature)
    const { data: resDocs } = await sb
      .from('checkin_reservation_documents')
      .select('*')
      .eq('reservation_id', reservation_id);

    const getDoc = (docs, type) =>
      (docs || []).find(d => d.doc_type === type)?.storage_path;

    const cinFront = getDoc(guestDocs, 'id_front');
    const cinBack = getDoc(guestDocs, 'id_back');
    const marriage = getDoc(resDocs, 'marriage_certificate');
    const signature = getDoc(resDocs, 'signature_png');

    const img = (path) =>
      path
        ? `<img src="${process.env.SUPABASE_PUBLIC_URL}/storage/v1/object/public/checkin-docs/${path}" />`
        : `<div class="empty">Non fourni</div>`;

    const today = new Date().toLocaleDateString('fr-FR');

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
      body: `
<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8"/>
<title>Fiche de police</title>
<style>
body{font-family:Arial,Helvetica,sans-serif;color:#000}
.page{max-width:820px;margin:0 auto;padding:24px}
h1,h2,h3{text-align:center;margin:4px 0}
hr{margin:12px 0}
.label{font-weight:bold}
.row{display:flex;gap:16px;margin-bottom:6px}
.col{flex:1}
.box{border:1px solid #000;padding:8px;margin-top:6px}
.images img{max-width:100%;max-height:220px;border:1px solid #000;margin-bottom:6px}
.signature img{max-height:120px}
.small{font-size:12px}
.empty{border:1px dashed #999;padding:16px;text-align:center;color:#666}
@media print {
  body{margin:0}
}
</style>
</head>
<body>
<div class="page">

<h2>Royaume du Maroc</h2>
<h3>Ministère de l’Intérieur</h3>
<h1>FICHE INDIVIDUELLE DE POLICE</h1>

<hr/>

<div class="row">
  <div class="col"><span class="label">Établissement :</span> ${property?.name || '—'}</div>
  <div class="col"><span class="label">Séjour :</span> ${resv.arrival_date} → ${resv.departure_date}</div>
</div>

<div class="box">
  <div class="row">
    <div class="col"><span class="label">Nom :</span> ${guest.last_name || ''}</div>
    <div class="col"><span class="label">Prénom :</span> ${guest.first_name || ''}</div>
  </div>
  <div class="row">
    <div class="col"><span class="label">Sexe :</span> ${guest.sex || ''}</div>
    <div class="col"><span class="label">Nationalité :</span> ${guest.nationality || ''}</div>
  </div>
  <div class="row">
    <div class="col"><span class="label">Date de naissance :</span> ${guest.dob || ''}</div>
    <div class="col"><span class="label">Pays de résidence :</span> ${guest.res_country || ''}</div>
  </div>
  <div class="row">
    <div class="col"><span class="label">Adresse :</span> ${guest.address || ''}</div>
    <div class="col"><span class="label">Pièce :</span> ${guest.id_type || ''} — ${guest.id_number || ''}</div>
  </div>
</div>

<h3>Pièce d’identité</h3>
<div class="images">
  ${img(cinFront)}
  ${img(cinBack)}
</div>

<h3>Acte de mariage</h3>
<div class="images">
  ${resv.is_moroccan_couple ? img(marriage) : '<div class="empty">Non applicable</div>'}
</div>

<h3>Signature du voyageur</h3>
<div class="signature">
  ${img(signature)}
</div>

<div class="box small">
  Je soussigné(e) certifie exacts les renseignements ci-dessus.<br/>
  Fait le ${today}
</div>

</div>
</body>
</html>
`
    };
  } catch (e) {
    return { statusCode: 500, body: e.message || String(e) };
  }
};
