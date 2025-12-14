const crypto = require('crypto');

function envOrThrow(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function sign(base) {
  const secret = process.env.CHECKIN_ADMIN_JWT_SECRET || envOrThrow('CHECKIN_SESSION_SECRET');
  return crypto.createHmac('sha256', secret).update(base).digest('hex');
}

function makeAdminToken() {
  const ts = Date.now();
  const base = `admin.${ts}`;
  return `${base}.${sign(base)}`;
}

function verifyAdminToken(tok, maxAgeMs = 1000 * 60 * 60 * 12) {
  if (!tok) throw new Error('Missing admin_token');
  const parts = String(tok).split('.');
  if (parts.length !== 3) throw new Error('Invalid admin_token');
  const [a, tsStr, sig] = parts;
  if (a !== 'admin') throw new Error('Invalid admin_token');
  const ts = Number(tsStr);
  if (!Number.isFinite(ts)) throw new Error('Invalid admin_token');
  if (Date.now() - ts > maxAgeMs) throw new Error('Admin token expired');
  const base = `admin.${tsStr}`;
  if (sign(base) !== sig) throw new Error('Invalid admin_token');
  return true;
}

module.exports = { makeAdminToken, verifyAdminToken, envOrThrow };
