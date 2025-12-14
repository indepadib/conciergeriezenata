const { verifyAdminToken } = require('./_admin_common');
const { sbAdmin } = require('./_checkin_common');

exports.handler = async (event) => {
  try {
    const { admin_token, date_from, date_to } = JSON.parse(event.body || '{}');
    verifyAdminToken(admin_token);

    const sb = sbAdmin();
    const from = date_from || new Date().toISOString().slice(0,10);
    const to = date_to || from;

    const { data, error } = await sb
      .from('checkin_reservations_view')
      .select('*')
      .gte('arrival_date', from)
      .lte('arrival_date', to)
      .order('arrival_date', { ascending: true });

    if (error) throw error;

    return { statusCode: 200, body: JSON.stringify({ arrivals: data || [] }) };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message || String(e) }) };
  }
};
