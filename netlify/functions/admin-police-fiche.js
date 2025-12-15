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

    // Guest
    const { data: guest, error: gErr } = await sb
      .from('checkin_guests')
      .select('*')
      .eq('id', guest_id)
      .single();
    if (gErr) throw gErr;

    // Guest documents
    const { data: guestDocs, error: gdErr } = await sb
      .from('checkin_guest_documents')
      .select('*')
      .eq('guest_id', guest_id);
    if (gdErr) throw gdErr;

    // Reservation documents
    const { data: resDocs, error: rdErr } = await sb
      .from('checkin_reservation_documents')
      .select('*')
      .eq('reservation_id', reservation_id);
    if (rdErr) throw rdErr;

    const getDocPath = (docs, type) => (docs || []).find(d => d.doc_type === type)?.storage_path || null;

    const cinFrontPath = getDocPath(guestDocs, 'id_front');
    const cinBackPath = getDocPath(guestDocs, 'id_back');
    const marriagePath = getDocPath(resDocs, 'marriage_certificate');
    const signaturePath = getDocPath(resDocs, 'signature_png');

    async function signedUrl(path) {
      if (!path) return null;
      const { data, error } = await sb.storage.from(docsBucket).createSignedUrl(path, expiresIn);
      if (error) return null;
      return data?.signedUrl || null;
    }

    // signed URLs
    const cinFrontUrl = await signedUrl(cinFrontPath);
    const cinBackUrl = await signedUrl(cinBackPath);
    const marriageUrl = await signedUrl(marriagePath);
    const signatureUrl = await signedUrl(signaturePath);

    function isPdf(urlOrPath) {
      const s = String(urlOrPath || '').toLowerCase();
      return s.endsWith('.pdf') || s.includes('.pdf?');
    }

    function renderDocBlock(title, url) {
      if (!url) {
        return `<div class="docBox"><div class="docTitle">${esc(title)}</div><div class="empty">Non fourni</div></div>`;
      }
      if (isPdf(url)) {
        return `
          <div class="docBox">
            <div class="docTitle">${esc(title)}</div>
            <a class="btn" href="${url}" target="_blank" rel="noopener">Ouvrir le PDF ↗</a>
            <div class="hint">Si tu veux l’intégrer en image, il faudra convertir le PDF (ou uploader une photo).</div>
          </div>
        `;
      }
      return `
        <div class="docBox">
          <div class="docTitle">${esc(title)}</div>
          <div class="imgFrame">
            <img src="${url}" alt="${esc(title)}" />
          </div>
          <div class="docActions">
            <a class="btn ghost" href="${url}" target="_blank" rel="noopener">Ouvrir ↗</a>
          </div>
        </div>
      `;
    }

    const signDate = resv.submitted_at ? new Date(resv.submitted_at) : new Date();
    const signDateFR = signDate.toLocaleDateString('fr-FR');

    const html = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Fiche individuelle de police</title>
<style>
  :root{
    --ink:#0b1220; --muted:#6b7280; --border:#d1d5db; --soft:#f3f4f6; --gold:#c7a24d;
  }
  *{box-sizing:border-box}
  body{margin:0;background:#eee;font-family:Arial,Helvetica,sans-serif;color:var(--ink)}
  .page{
    width:210mm; min-height:297mm;
    margin:16px auto; background:#fff;
    padding:14mm 14mm 12mm;
    border:1px solid #ddd; box-shadow:0 10px 30px rgba(0,0,0,.08);
  }
  @media print{
    body{background:#fff}
    .page{margin:0;border:none;box-shadow:none}
    .noPrint{display:none!important}
  }
  .topRow{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
  .brand{
    display:flex;gap:10px;align-items:flex-start
  }
  .mark{
    width:40px;height:40px;border-radius:14px;
    background:radial-gradient(circle at 30% 30%, rgba(199,162,77,.35), rgba(11,18,32,.06));
    border:1px solid rgba(11,18,32,.14);
  }
  h1{font-size:18px;margin:0;text-transform:uppercase;letter-spacing:.04em}
  .sub{color:var(--muted);font-size:12px;margin-top:4px}
  .metaRight{text-align:right;font-size:12px;color:var(--muted)}
  .divider{height:1px;background:var(--border);margin:10px 0 12px}
  .section{margin-top:10px}
  .sectionTitle{
    font-size:12px;text-transform:uppercase;letter-spacing:.05em;
    color:rgba(11,18,32,.75);font-weight:bold;margin:0 0 6px;
  }
  .grid2{display:grid;grid-template-columns:1fr 1fr;gap:8px}
  .field{
    border:1px solid var(--border);
    border-radius:10px;padding:8px;background:#fff;
  }
  .k{font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.04em}
  .v{font-size:13px;font-weight:700;margin-top:4px;min-height:16px}
  .docGrid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
  .docBox{
    border:1px solid var(--border);
    border-radius:12px;padding:10px;background:#fff;
  }
  .docTitle{font-weight:800;font-size:12.5px;margin-bottom:8px}
  .imgFrame{
    border:1px solid rgba(11,18,32,.18);
    border-radius:10px;background:var(--soft);
    padding:8px; height:210px; display:flex;align-items:center;justify-content:center;
    overflow:hidden;
  }
  .imgFrame img{max-width:100%;max-height:100%;object-fit:contain;display:block}
  .empty{
    border:1px dashed rgba(11,18,32,.25);
    border-radius:10px;padding:16px;text-align:center;color:var(--muted);
    background:var(--soft);
  }
  .docActions{margin-top:8px;display:flex;gap:8px;flex-wrap:wrap}
  .btn{
    display:inline-flex;align-items:center;justify-content:center;
    padding:8px 10px;border-radius:10px;
    border:1px solid rgba(11,18,32,.14);
    background:#fff;color:var(--ink);
    text-decoration:none;font-weight:800;font-size:12px;
  }
  .btn.ghost{background:transparent}
  .hint{font-size:11px;color:var(--muted);margin-top:6px}
  .signatureWrap{display:flex;gap:10px;align-items:flex-start}
  .signBox{flex:1;border:1px solid var(--border);border-radius:12px;padding:10px}
  .signImg{height:120px;border:1px solid rgba(11,18,32,.18);border-radius:10px;background:var(--soft);padding:8px;display:flex;align-items:center;justify-content:center}
  .signImg img{max-width:100%;max-height:100%;object-fit:contain}
  .legal{
    margin-top:10px;padding:10px;border:1px solid rgba(199,162,77,.35);
    border-radius:12px;background:rgba(199,162,77,.08);font-size:12px;color:rgba(11,18,32,.85)
  }
  .printBtn{position:fixed;top:14px;right:14px}
</style>
</head>
<body>

<button class="btn noPrint printBtn" onclick="window.print()">Imprimer / PDF</button>

<div class="page">
  <div class="topRow">
    <div class="brand">
      <div class="mark"></div>
      <div>
        <div style="font-size:12px;color:var(--muted);font-weight:700">Royaume du Maroc • Ministère de l’Intérieur</div>
        <h1>Fiche individuelle de police</h1>
        <div class="sub">
          Établissement: <strong>${esc(property?.name || '—')}</strong>
          • Séjour: <strong>${esc(resv.arrival_date)} → ${esc(resv.departure_date)}</strong>
        </div>
      </div>
    </div>
    <div class="metaRight">
      <div><strong>ID Réservation</strong>: ${esc(resv.id)}</div>
      <div><strong>Date</strong>: ${esc(signDateFR)}</div>
      <div><strong>Signed URLs</strong>: ${esc(String(expiresIn))}s</div>
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
    <div class="sectionTitle">Pièces jointes</div>
    <div class="docGrid">
      ${renderDocBlock("CIN / Passeport — Face 1", cinFrontUrl)}
      ${renderDocBlock("CIN / Passeport — Face 2", cinBackUrl)}
    </div>
  </div>

  <div class="section">
    <div class="sectionTitle">Acte de mariage</div>
    ${resv.is_moroccan_couple ? `
      <div class="docGrid">
        ${renderDocBlock("Acte de mariage", marriageUrl)}
        <div class="docBox">
          <div class="docTitle">Couple marocain</div>
          <div class="empty">Déclaré: OUI</div>
        </div>
      </div>
    ` : `
      <div class="docBox"><div class="docTitle">Couple marocain</div><div class="empty">Déclaré: NON (non applicable)</div></div>
    `}
  </div>

  <div class="section">
    <div class="sectionTitle">Signature</div>
    <div class="signatureWrap">
      <div class="signBox">
        <div class="docTitle">Signature du voyageur</div>
        <div class="signImg">
          ${signatureUrl && !isPdf(signatureUrl)
            ? `<img src="${signatureUrl}" alt="Signature" />`
            : `<div class="empty">${signatureUrl ? `Signature en PDF: <a class="btn" href="${signatureUrl}" target="_blank" rel="noopener">Ouvrir ↗</a>` : 'Non fournie'}</div>`
          }
        </div>
        <div class="hint">Date: ${esc(signDateFR)}</div>
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

</div>

</body>
</html>`;

    return { statusCode: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' }, body: html };

    function field(k, v) {
      return `<div class="field"><div class="k">${esc(k)}</div><div class="v">${esc(v || '—')}</div></div>`;
    }
    function esc(s) {
      return String(s ?? '')
        .replaceAll('&','&amp;')
        .replaceAll('<','&lt;')
        .replaceAll('>','&gt;')
        .replaceAll('"','&quot;')
        .replaceAll("'","&#039;");
    }
  } catch (e) {
    return { statusCode: 500, body: e.message || String(e) };
  }
};
