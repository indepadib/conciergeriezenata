const { sbAdmin, verifySession, uploadDataUrl } = require('./_checkin_common');

exports.handler = async (event) => {
  try {
    const body = JSON.parse(event.body || '{}');
    const { session, reservation_id, guest_index, guest, documents } = body;

    if (!reservation_id) return { statusCode: 400, body: JSON.stringify({ error: 'Missing reservation_id' }) };
    verifySession(session, reservation_id);

    const sb = sbAdmin();
    const bucket = process.env.CHECKIN_DOCS_BUCKET || 'checkin-docs';

    // upsert guest
    const payload = {
      reservation_id,
      is_group_lead: !!guest?.is_group_lead,
      last_name: guest?.last_name || null,
      first_name: guest?.first_name || null,
      sex: guest?.sex || null,
      nationality: guest?.nationality || null,
      dob: guest?.dob || null,
      res_country: guest?.res_country || null,
      res_city: guest?.res_city || null,
      address: guest?.address || null,
      id_type: guest?.id_type || null,
      id_number: guest?.id_number || null,
      guest_index: Number.isFinite(guest_index) ? guest_index : 0,
    };

    const { data: gRow, error: gErr } = await sb
      .from('checkin_guests')
      .upsert(payload, { onConflict: 'reservation_id,guest_index' })
      .select('id')
      .single();

    if (gErr) throw gErr;

    const guestId = gRow.id;
    const basePath = `${reservation_id}/guest_${payload.guest_index}_${guestId}`;

    const frontPath = await uploadDataUrl(sb, bucket, `${basePath}/id_front`, documents?.id_front);
    const backPath  = await uploadDataUrl(sb, bucket, `${basePath}/id_back`, documents?.id_back);

    const docsToUpsert = [];
    if (frontPath) docsToUpsert.push({ guest_id: guestId, doc_type: 'id_front', storage_path: frontPath });
    if (backPath)  docsToUpsert.push({ guest_id: guestId, doc_type: 'id_back', storage_path: backPath });

    if (docsToUpsert.length) {
      const { error: dErr } = await sb.from('checkin_guest_documents')
        .upsert(docsToUpsert, { onConflict: 'guest_id,doc_type' });
      if (dErr) throw dErr;
    }

    // status
    await sb.from('checkin_reservations')
      .update({ status: 'in_progress' })
      .eq('id', reservation_id);

    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message || String(e) }) };
  }
};
