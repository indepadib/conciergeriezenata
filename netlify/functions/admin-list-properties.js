const { verifyAdminToken } = require('./_admin_common');
const { sbAdmin } = require('./_checkin_common');

exports.handler = async (event) => {
  try {
    const { admin_token } = JSON.parse(event.body || '{}');
    verifyAdminToken(admin_token);

    const sb = sbAdmin();

    const { data, error } = await sb
      .from('properties')
      .select('id, name')
      .order('name', { ascending: true });

    if (error) throw error;

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ properties: data || [] }),
    };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message || String(e) }) };
  }
};
