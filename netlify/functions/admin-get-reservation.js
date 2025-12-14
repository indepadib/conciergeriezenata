const { verifyAdminToken } = require('./_admin_common');
const { sbAdmin } = require('./_checkin_common');

exports.handler = async (event) => {
  try {
    const { admin_token, reservation_id } = JSON.parse(event.body || '{}');
    verifyAdminToken(admin_token);
    if (!reservation_id) return { statusCode: 400, body: JSON.stringify({ error: 'Missing reservation_id' }) };

    const sb = sbAdmin();

    const { data: resv, error: rErr } = await sb
      .from('checkin_reservations')
      .select('*')
      .eq('id', reservation_id)
      .single();
    if (rErr) throw rErr;

    const { data: guests } = await sb
      .from('checkin_guests')
      .select('*')
      .eq('reservation_id', reservation_id)
      .order('guest_index', { ascending: true });

    const { data: docs1 } = await sb
      .from('checkin_guest_documents')
      .select('*')
      .in('guest_id', (guests || []).map(g => g.id));

    const { data: docs2 } = await sb
      .from('checkin_reservation_documents')
      .select('*')
      .eq('reservation_id', reservation_id);

    return { statusCode: 200, body: JSON.stringify({ reservation: resv, guests: guests || [], guest_documents: docs1 || [], reservation_documents: docs2 || [] }) };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message || String(e) }) };
  }
};
