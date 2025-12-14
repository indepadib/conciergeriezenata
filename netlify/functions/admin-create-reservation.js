const crypto = require('crypto');
const { verifyAdminToken } = require('./_admin_common');
const { sbAdmin, sha256 } = require('./_checkin_common');

function randomToken() {
  // token lisible + sécurisé
  const raw = crypto.randomBytes(18).toString('base64url'); // ~24 chars
  return `cz_${raw}`;
}

exports.handler = async (event) => {
  try {
    const body = JSON.parse(event.body || '{}');
    const { admin_token, property_id, arrival_date, departure_date } = body;

    verifyAdminToken(admin_token);

    if (!property_id) return { statusCode: 400, body: JSON.stringify({ error: 'Missing property_id' }) };
    if (!arrival_date || !departure_date) return { statusCode: 400, body: JSON.stringify({ error: 'Missing dates' }) };
    if (String(departure_date) <= String(arrival_date)) {
      return { statusCode: 400, body: JSON.stringify({ error: 'departure_date must be after arrival_date' }) };
    }

    const sb = sbAdmin();

    // generate token and hash
    const token = randomToken();
    const tokenHash = sha256(token);

    // insert reservation
    const { data, error } = await sb
      .from('checkin_reservations')
      .insert([{
        property_id,
        checkin_token_hash: tokenHash,
        arrival_date,
        departure_date,
        status: 'sent'
      }])
      .select('id')
      .single();

    if (error) throw error;

    // return link (use production hostname)
    const link = `https://conciergeriezenata.com/checkin/${encodeURIComponent(token)}`;

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reservation_id: data.id, token, link }),
    };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message || String(e) }) };
  }
};
