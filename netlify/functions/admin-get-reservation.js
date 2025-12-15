const { verifyAdminToken } = require('./_admin_common');
const { sbAdmin } = require('./_checkin_common');

exports.handler = async (event) => {
  try {
    const { admin_token, reservation_id } = JSON.parse(event.body || '{}');
    verifyAdminToken(admin_token);
    if (!reservation_id) return { statusCode: 400, body: JSON.stringify({ error: 'Missing reservation_id' }) };

    const sb = sbAdmin();
    const docsBucket = process.env.CHECKIN_DOCS_BUCKET || 'checkin-docs';
    const expiresIn = Number(process.env.CHECKIN_SIGNED_URL_EXPIRES || 60 * 60 * 6); // 6h par défaut

    const { data: resv, error: rErr } = await sb
      .from('checkin_reservations')
      .select('*')
      .eq('id', reservation_id)
      .single();
    if (rErr) throw rErr;

    const { data: guests, error: gErr } = await sb
      .from('checkin_guests')
      .select('*')
      .eq('reservation_id', reservation_id)
      .order('guest_index', { ascending: true });
    if (gErr) throw gErr;

    const guestIds = (guests || []).map(g => g.id);

    const { data: docs1, error: d1Err } = await sb
      .from('checkin_guest_documents')
      .select('*')
      .in('guest_id', guestIds.length ? guestIds : ['00000000-0000-0000-0000-000000000000']);
    if (d1Err) throw d1Err;

    const { data: docs2, error: d2Err } = await sb
      .from('checkin_reservation_documents')
      .select('*')
      .eq('reservation_id', reservation_id);
    if (d2Err) throw d2Err;

    // Build signed URLs
    const signed = { reservation: {}, guests: {} };

    // reservation docs: by doc_type
    for (const d of (docs2 || [])) {
      if (!d?.storage_path || !d?.doc_type) continue;
      const { data: s, error } = await sb.storage
        .from(docsBucket)
        .createSignedUrl(d.storage_path, expiresIn);
      if (!error && s?.signedUrl) signed.reservation[d.doc_type] = s.signedUrl;
    }

    // guest docs: group by guest_id + doc_type
    for (const d of (docs1 || [])) {
      if (!d?.storage_path || !d?.guest_id || !d?.doc_type) continue;
      const { data: s, error } = await sb.storage
        .from(docsBucket)
        .createSignedUrl(d.storage_path, expiresIn);
      if (error || !s?.signedUrl) continue;
      signed.guests[d.guest_id] = signed.guests[d.guest_id] || {};
      signed.guests[d.guest_id][d.doc_type] = s.signedUrl;
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        reservation: resv,
        guests: guests || [],
        guest_documents: docs1 || [],
        reservation_documents: docs2 || [],
        signed_urls: signed,
        signed_urls_expires_in: expiresIn
      })
    };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message || String(e) }) };
  }
};
