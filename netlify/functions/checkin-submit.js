const { sbAdmin, verifySession, uploadDataUrl } = require('./_checkin_common');

exports.handler = async (event) => {
  try {
    const body = JSON.parse(event.body || '{}');
    const { session, reservation_id, guests, is_moroccan_couple, documents, signature_png,accepted_contract,accepted_contract_version } = body;

    if (!reservation_id) return { statusCode: 400, body: JSON.stringify({ error: 'Missing reservation_id' }) };
    verifySession(session, reservation_id);
    if (!accepted_contract) {
  return { statusCode: 400, body: JSON.stringify({ error: "Contrat non accepté." }) };
}

    const sb = sbAdmin();
    const docsBucket = process.env.CHECKIN_DOCS_BUCKET || 'checkin-docs';

    // property requirement
    const { data: resv, error: rErr } = await sb
      .from('checkin_reservations')
      .select('id, property_id')
      .eq('id', reservation_id)
      .single();
    if (rErr) throw rErr;

    const { data: prop, error: pErr } = await sb
      .from('properties')
      .select('require_marriage_cert_for_moroccan_couples, checkin_instructions_html, name')
      .eq('id', resv.property_id)
      .maybeSingle();
    if (pErr) throw pErr;

    const requireMarriage = !!prop?.require_marriage_cert_for_moroccan_couples;

    // If required, enforce server-side
    if (requireMarriage && is_moroccan_couple) {
      if (!documents?.marriage_certificate) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Acte de mariage requis pour ce logement.' }) };
      }
    }

    // Save marriage doc if provided
    if (documents?.marriage_certificate) {
      const path = await uploadDataUrl(sb, docsBucket, `${reservation_id}/marriage_certificate`, documents.marriage_certificate);
      const { error: dErr } = await sb
        .from('checkin_reservation_documents')
        .upsert([{ reservation_id, doc_type: 'marriage_certificate', storage_path: path }], { onConflict: 'reservation_id,doc_type' });
      if (dErr) throw dErr;
    }

    // Save signature (optional)
    if (signature_png) {
      const path = await uploadDataUrl(sb, docsBucket, `${reservation_id}/signature`, signature_png);
      const { error: sErr } = await sb
        .from('checkin_reservation_documents')
        .upsert([{ reservation_id, doc_type: 'signature_png', storage_path: path }], { onConflict: 'reservation_id,doc_type' });
      if (sErr) throw sErr;
    }

    // Mark submitted
    const { error: uErr } = await sb
      .from('checkin_reservations')
      .update({
  status: 'submitted',
  is_moroccan_couple: !!is_moroccan_couple,
  submitted_at: new Date().toISOString(),

  // ✅ AJOUTS
  accepted_contract: true,
  accepted_contract_at: new Date().toISOString(),
  accepted_contract_version: accepted_contract_version || "v1",
})

      .eq('id', reservation_id);
    if (uErr) throw uErr;

       // Create signed urls for what we stored (optional but nice UX)
    const expiresIn = Number(process.env.CHECKIN_SIGNED_URL_EXPIRES || 60 * 60 * 6);
    const files = {};

    if (documents?.marriage_certificate) {
      const { data: d } = await sb.storage.from(docsBucket).createSignedUrl(`${reservation_id}/marriage_certificate`, expiresIn);
      if (d?.signedUrl) files.marriage_url = d.signedUrl;
    }

    if (signature_png) {
      const { data: d } = await sb.storage.from(docsBucket).createSignedUrl(`${reservation_id}/signature`, expiresIn);
      if (d?.signedUrl) files.signature_url = d.signedUrl;
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ok: true,
        instructions_html: prop?.checkin_instructions_html || `<p><strong>${prop?.name || 'Logement'}</strong><br/>Instructions d’arrivée à définir.</p>`,
        files,
        signed_urls_expires_in: expiresIn
      })
    };

  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message || String(e) }) };
  }
};
