const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

function envOrThrow(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function sbAdmin() {
  const url = envOrThrow('SUPABASE_URL');
  const key = envOrThrow('SUPABASE_SERVICE_ROLE');
  return createClient(url, key);
}

function sha256(input) {
  return crypto.createHash('sha256').update(String(input)).digest('hex');
}

function hmac(payload) {
  const secret = envOrThrow('CHECKIN_SESSION_SECRET');
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

function makeSession(reservationId) {
  // session courte, signée : "<reservationId>.<timestamp>.<sig>"
  const ts = Date.now();
  const base = `${reservationId}.${ts}`;
  const sig = hmac(base);
  return `${base}.${sig}`;
}

function verifySession(session, reservationId, maxAgeMs = 1000 * 60 * 60) {
  if (!session) throw new Error('Missing session');
  const parts = String(session).split('.');
  if (parts.length !== 3) throw new Error('Invalid session');
  const [rid, tsStr, sig] = parts;
  if (rid !== reservationId) throw new Error('Session mismatch');
  const ts = Number(tsStr);
  if (!Number.isFinite(ts)) throw new Error('Invalid session timestamp');
  if (Date.now() - ts > maxAgeMs) throw new Error('Session expired');
  const base = `${rid}.${tsStr}`;
  if (hmac(base) !== sig) throw new Error('Invalid session signature');
  return true;
}

async function uploadDataUrl(sb, bucket, path, dataUrl) {
  if (!dataUrl) return null;
  const m = String(dataUrl).match(/^data:([^;]+);base64,(.+)$/);
  if (!m) throw new Error('Invalid data URL');
  const mime = m[1];
  const b64 = m[2];
  const buf = Buffer.from(b64, 'base64');

  const ext =
    mime.includes('pdf') ? 'pdf' :
    mime.includes('png') ? 'png' :
    mime.includes('jpeg') ? 'jpg' :
    mime.includes('jpg') ? 'jpg' : 'bin';

  const fullPath = `${path}.${ext}`;
  const { error } = await sb.storage.from(bucket).upload(fullPath, buf, {
    upsert: true,
    contentType: mime,
  });
  if (error) throw error;
  return fullPath;
}

module.exports = {
  sbAdmin,
  sha256,
  makeSession,
  verifySession,
  uploadDataUrl,
};
