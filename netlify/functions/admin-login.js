const { makeAdminToken, envOrThrow } = require('./_admin_common');

exports.handler = async (event) => {
  try {
    const { password } = JSON.parse(event.body || '{}');
    const expected = envOrThrow('CHECKIN_ADMIN_PASSWORD');
    if (!password || password !== expected) {
      return { statusCode: 401, body: JSON.stringify({ error: 'Mot de passe incorrect' }) };
    }
    return { statusCode: 200, body: JSON.stringify({ token: makeAdminToken() }) };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message || String(e) }) };
  }
};
