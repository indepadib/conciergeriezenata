const { verifyAdminToken } = require('./_admin_common');
const { sbAdmin } = require('./_checkin_common');

exports.handler = async (event) => {
  try {
    const { admin_token, reservation_id, guest_id } = JSON.parse(event.body || '{}');
    verifyAdminToken(admin_token);

    if (!reservation_id) {
      return { statusCode: 400, body: 'Missing reservation_id' };
    }

    const sb = sbAdmin();
    const docsBucket = process.env.CHECKIN_DOCS_BUCKET || 'checkin-docs';
    const expiresIn = Number(process.env.CHECKIN_SIGNED_URL_EXPIRES || 60 * 60 * 6);

    // Reservation
    const { data: resv, error: rErr } = await sb
      .from('checkin_reservations')
      .select('id, arrival_date, departure_date, is_moroccan_couple, property_id, submitted_at')
      .eq('id', reservation_id)
      .single();
    if (rErr) throw rErr;

    // Property
    const { data: property, error: pErr } = await sb
      .from('properties')
      .select('name')
      .eq('id', resv.property_id)
      .maybeSingle();
    if (pErr) throw pErr;

    // Guests (all) — we will filter later if guest_id provided
    const { data: guests, error: gErr } = await sb
      .from('checkin_guests')
      .select('*')
      .eq('reservation_id', reservation_id)
      .order('guest_index', { ascending: true });
    if (gErr) throw gErr;

    const targetGuests = guest_id ? (guests || []).filter(g => g.id === guest_id) : (guests || []);
    if (guest_id && !targetGuests.length) {
      return { statusCode: 404, body: 'Guest not found in reservation' };
    }

    // Reservation docs (marriage, signature)
    const { data: resDocs, error: rdErr } = await sb
      .from('checkin_reservation_documents')
      .select('*')
      .eq('reservation_id', reservation_id);
    if (rdErr) throw rdErr;

    const getDocPath = (docs, type) => (docs || []).find(d => d.doc_type === type)?.storage_path || null;

    const marriagePath = getDocPath(resDocs, 'marriage_certificate');
    const signaturePath = getDocPath(resDocs, 'signature_png');

    async function signedUrl(path) {
      if (!path) return null;
      const { data, error } = await sb.storage.from(docsBucket).createSignedUrl(path, expiresIn);
      if (error) return null;
      return data?.signedUrl || null;
    }

    const marriageUrl = await signedUrl(marriagePath);
    const signatureUrl = await signedUrl(signaturePath);

    // Fetch guest docs for all guest_ids (once)
    const guestIds = targetGuests.map(g => g.id);
    const { data: gDocs, error: gdErr } = await sb
      .from('checkin_guest_documents')
      .select('*')
      .in('guest_id', guestIds.length ? guestIds : ['00000000-0000-0000-0000-000000000000']);
    if (gdErr) throw gdErr;

    // Map guest_id -> { id_front: url, id_back: url }
    const guestDocsSigned = {};
    for (const d of (gDocs || [])) {
      if (!d?.guest_id || !d?.doc_type || !d?.storage_path) continue;
      const url = await signedUrl(d.storage_path);
      if (!url) continue;
      guestDocsSigned[d.guest_id] = guestDocsSigned[d.guest_id] || {};
      guestDocsSigned[d.guest_id][d.doc_type] = url;
    }

    const signDate = resv.submitted_at ? new Date(resv.submitted_at) : new Date();
    const signDateFR = signDate.toLocaleDateString('fr-FR');

    const htmlPages = targetGuests.map((g, idx) => renderPage({
      propertyName: property?.name || '—',
      resv,
      guest: g,
      guestDocs: guestDocsSigned[g.id] || {},
      marriageUrl,
      signatureUrl,
      signDateFR,
      multi: !guest_id,
      pageIndex: idx + 1,
      pageTotal: targetGuests.length
    })).join('\n');

    const html = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Fiche(s) de police</title>
<style>
  :root{
    --ink:#0b1220; --muted:#6b7280; --border:#d1d5db; --soft:#f3f4f6; --gold:#c7a24d;
  }
  *{box-sizing:border-box}
  body{margin:0;background:#e9eaee;font-family:Arial,Helvetica,sans-serif;color:var(--ink)}
  .toolbar{
    position:fixed; top:14px; right:14px; z-index:10;
    display:flex; gap:10px;
  }
  .btn{
    display:inline-flex;align-items:center;justify-content:center;
    padding:10px 12px;border-radius:12px;
    border:1px solid rgba(11,18,32,.16);
    background:#fff;color:var(--ink);
    text-decoration:none;font-weight:900;font-size:12px;
    box-shadow:0 10px 25px rgba(0,0,0,.08);
    cursor:pointer;
  }
  .btn.ghost{background:transparent}
  .wrap{padding:18px}
  .page{
    width:210mm; min-height:297mm;
    margin:0 auto 18px; background:#fff;
    padding:14mm 14mm 12mm;
    border:1px solid #ddd; box-shadow:0 12px 32px rgba(0,0,0,.08);
  }
  @media print{
    body{background:#fff}
    .toolbar{display:none!important}
    .wrap{padding:0}
    .page{margin:0;border:none;box-shadow:none;page-break-after:always}
    .page:last-child{page-break-after:auto}
  }
  .topRow{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
  .brand{display:flex;gap:10px;align-items:flex-start}
  .mark{
    width:44px;height:44px;border-radius:16px;
    background:radial-gradient(circle at 30% 30%, rgba(199,162,77,.35), rgba(11,18,32,.06));
    border:1px solid rgba(11,18,32,.14);
  }
  h1{font-size:18px;margin:2px 0 0;text-transform:uppercase;letter-spacing:.05em}
  .sub{color:var(--muted);font-size:12px;margin-top:6px;line-height:1.35}
  .metaRight{text-align:right;font-size:12px;color:var(--muted);line-height:1.5}
  .divider{height:1px;background:var(--border);margin:12px 0 14px}
  .section{margin-top:10px}
  .sectionTitle{
    font-size:12px;text-transform:uppercase;letter-spacing:.06em;
    color:rgba(11,18,32,.78);font-weight:900;margin:0 0 8px;
  }
  .grid2{display:grid;grid-template-columns:1fr 1fr;gap:8px}
  .field{border:1px solid var(--border);border-radius:12px;padding:9px;background:#fff}
  .k{font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.05em}
  .v{font-size:13px;font-weight:900;margin-top:4px;min-height:16px}
  .docGrid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
  .docBox{border:1px solid var(--border);border-radius:14px;padding:10px;background:#fff}
  .docTitle{font-weight:900;font-size:12.5px;margin-bottom:8px}
  .imgFrame{
    border:1px solid rgba(11,18,32,.18);
    border-radius:12px;background:var(--soft);
    padding:8px; height:220px;
    display:flex;align-items:center;justify-content:center;
    overflow:hidden;
  }
  .imgFrame img{max-width:100%;max-height:100%;object-fit:contain;display:block}
  .empty{
    border:1px dashed rgba(11,18,32,.25);
    border-radius:12px;padding:16px;text-align:center;color:var(--muted);
    background:var(--soft);
  }
  .docActions{margin-top:8px;display:flex;gap:8px;flex-wrap:wrap}
  .link{
    display:inline-flex;align-items:center;gap:8px;
    padding:8px 10px;border-radius:10px;
    border:1px solid rgba(11,18,32,.14);
    background:#fff;color:var(--ink);
    text-decoration:none;font-weight:900;font-size:12px;
  }
  .signatureWrap{display:flex;gap:10px;align-items:flex-start}
  .signBox{flex:1;border:1px solid var(--border);border-radius:14px;padding:10px}
  .signImg{
    height:130px;border:1px solid rgba(11,18,32,.18);
    border-radius:12px;background:var(--soft);
    padding:8px;display:flex;align-items:center;justify-content:center
  }
  .signImg img{max-width:100%;max-height:100%;object-fit:contain}
  .hint{font-size:11px;color:var(--muted);margin-top:6px;line-height:1.35}
  .legal{
    margin-top:10px;padding:10px;border:1px solid rgba(199,162,77,.35);
    border-radius:14px;background:rgba(199,162,77,.08);font-size:12px;color:rgba(11,18,32,.88);
    line-height:1.45
  }
  .footerRow{
    display:flex;justify-content:space-between;gap:10px;margin-top:10px;color:var(--muted);font-size:11px
  }
</style>
</head>
<body>
  <div class="toolbar">
    <button class="btn" onclick="window.print()">Imprimer / Enregistrer en PDF</button>
  </div>
  <div class="wrap">
    ${htmlPages}
  </div>
</body>
</html>`;

    return { statusCode: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' }, body: html };

  } catch (e) {
    return { statusCode: 500, body: e.message || String(e) };
  }
};

function renderPage({ propertyName, resv, guest, guestDocs, marriageUrl, signatureUrl, signDateFR, multi, pageIndex, pageTotal }) {
  const isPdf = (u) => String(u || '').toLowerCase().includes('.pdf');

  const docBlock = (title, url) => {
    if (!url) return `
      <div class="docBox">
        <div class="docTitle">${esc(title)}</div>
        <div class="empty">Non fourni</div>
      </div>
    `;
    if (isPdf(url)) return `
      <div class="docBox">
        <div class="docTitle">${esc(title)}</div>
        <a class="link" href="${url}" target="_blank" rel="noopener">Ouvrir le PDF ↗</a>
        <div class="hint">Astuce: pour intégration visuelle parfaite, uploade une photo plutôt qu’un PDF.</div>
      </div>
    `;
    return `
      <div class="docBox">
        <div class="docTitle">${esc(title)}</div>
        <div class="imgFrame"><img src="${url}" alt="${esc(title)}"/></div>
        <div class="docActions"><a class="link" href="${url}" target="_blank" rel="noopener">Ouvrir ↗</a></div>
      </div>
    `;
  };

  const field = (k, v) => `
    <div class="field">
      <div class="k">${esc(k)}</div>
      <div class="v">${esc(v || '—')}</div>
    </div>
  `;

  return `
  <div class="page">
    <div class="topRow">
      <div class="brand">
        <div class="mark"></div>
        <div>
          <div style="font-size:12px;color:var(--muted);font-weight:900">Royaume du Maroc • Ministère de l’Intérieur</div>
          <h1>Fiche individuelle de police</h1>
          <div class="sub">
            Établissement: <strong>${esc(propertyName)}</strong><br/>
            Séjour: <strong>${esc(resv.arrival_date)} → ${esc(resv.departure_date)}</strong>
            ${multi ? `<br/><span class="hint">Dossier réservation • Fiche ${pageIndex}/${pageTotal}</span>` : ``}
          </div>
        </div>
      </div>
      <div class="metaRight">
        <div><strong>ID Réservation</strong>: ${esc(resv.id)}</div>
        <div><strong>Date</strong>: ${esc(signDateFR)}</div>
      </div>
    </div>

    <div class="divider"></div>

    <div class="section">
      <div class="sectionTitle">Identité</div>
      <div class="grid2">
        ${field('Nom', guest.last_name)}
        ${field('Prénom', guest.first_name)}
        ${field('Sexe', guest.sex)}
        ${field('Nationalité', guest.nationality)}
        ${field('Date de naissance', guest.dob)}
        ${field('Pays de résidence', guest.res_country)}
        ${field('Ville de résidence', guest.res_city)}
        ${field('Adresse habituelle', guest.address)}
        ${field('Type de pièce', guest.id_type)}
        ${field('Numéro de pièce', guest.id_number)}
      </div>
    </div>

    <div class="section">
      <div class="sectionTitle">Pièces d’identité</div>
      <div class="docGrid">
        ${docBlock("CIN / Passeport — Face 1", guestDocs.id_front)}
        ${docBlock("CIN / Passeport — Face 2", guestDocs.id_back)}
      </div>
    </div>

    <div class="section">
      <div class="sectionTitle">Acte de mariage</div>
      ${
        resv.is_moroccan_couple
          ? `<div class="docGrid">
               ${docBlock("Acte de mariage", marriageUrl)}
               <div class="docBox"><div class="docTitle">Couple marocain</div><div class="empty">Déclaré: OUI</div></div>
             </div>`
          : `<div class="docBox"><div class="docTitle">Couple marocain</div><div class="empty">Déclaré: NON (non applicable)</div></div>`
      }
    </div>

    <div class="section">
      <div class="sectionTitle">Signature</div>
      <div class="signatureWrap">
        <div class="signBox">
          <div class="docTitle">Signature du voyageur</div>
          <div class="signImg">
            ${
              signatureUrl && !isPdf(signatureUrl)
                ? `<img src="${signatureUrl}" alt="Signature"/>`
                : `<div class="empty">${signatureUrl ? `Signature PDF: <a class="link" href="${signatureUrl}" target="_blank" rel="noopener">Ouvrir ↗</a>` : 'Non fournie'}</div>`
            }
          </div>
          <div class="hint">Fait le ${esc(signDateFR)}</div>
        </div>
        <div class="signBox">
          <div class="docTitle">Déclaration</div>
          <div class="legal">
            Je soussigné(e) certifie exacts les renseignements ci-dessus et accepte l’utilisation de ces données
            pour les obligations légales relatives au séjour.
          </div>
        </div>
      </div>
    </div>

    <div class="footerRow">
      <div>Confidentiel • Usage obligations légales</div>
      <div>Conciergerie Zenata</div>
    </div>
  </div>
  `;
}

function esc(s) {
  return String(s ?? '')
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'","&#039;");
}
