const { sbAdmin, sha256, makeSession } = require('./_checkin_common');

exports.handler = async (event) => {
  try {
    const { token } = JSON.parse(event.body || '{}');
    if (!token) return { statusCode: 400, body: JSON.stringify({ error: 'Missing token' }) };

    const sb = sbAdmin();
    const tokenHash = sha256(token);

    const { data: resv, error: rErr } = await sb
      .from('checkin_reservations')
      .select('id, property_id, status, arrival_date, departure_date')
      .eq('checkin_token_hash', tokenHash)
      .maybeSingle();

    if (rErr) throw rErr;
    if (!resv) return { statusCode: 404, body: JSON.stringify({ error: 'Lien invalide ou expiré' }) };

    const { data: prop, error: pErr } = await sb
      .from('properties')
      .select('id, name, require_marriage_cert_for_moroccan_couples, checkin_instructions_html')
      .eq('id', resv.property_id)
      .maybeSingle();

    if (pErr) throw pErr;

    const { data: guests } = await sb
      .from('checkin_guests')
      .select('*')
      .eq('reservation_id', resv.id)
      .order('created_at', { ascending: true });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session: makeSession(resv.id),
        reservation: resv,
        property: prop || { id: resv.property_id, name: 'Logement', require_marriage_cert_for_moroccan_couples: false },
        guests: guests || []
      })
    };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message || String(e) }) };
  }
};
