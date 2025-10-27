// netlify/functions/upload-image.js
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;
const BUCKET = 'guide-assets';

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, body: 'Method Not Allowed' };
    }
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) {
      return { statusCode: 500, body: 'Missing server env: SUPABASE_URL / SUPABASE_SERVICE_ROLE' };
    }

    const slug = (event.queryStringParameters?.slug || '').trim();
    const ext = (event.queryStringParameters?.ext || 'webp').toLowerCase();
    if (!slug) return { statusCode: 400, body: 'Missing slug' };

    const contentType = event.headers['content-type'] || 'application/octet-stream';
    const body = Buffer.from(event.body, event.isBase64Encoded ? 'base64' : 'utf8');

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE);
    const path = `covers/${slug}.${ext}`;

    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(path, body, { upsert: true, contentType, cacheControl: '60' });

    if (upErr) return { statusCode: 500, body: `Upload error: ${upErr.message}` };

    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, url: data?.publicUrl }),
      headers: { 'Content-Type': 'application/json' },
    };
  } catch (e) {
    return { statusCode: 500, body: `Server error: ${e.message || e}` };
  }
};
