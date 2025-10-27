const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;
    const ASSETS_BUCKET = process.env.ASSETS_BUCKET || 'guide-assets';

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) {
      return { statusCode: 500, body: 'Missing server env: SUPABASE_URL / SUPABASE_SERVICE_ROLE' };
    }

    const slug = event.queryStringParameters?.slug || '';
    const ext  = (event.queryStringParameters?.ext || 'webp').toLowerCase();
    if (!slug) return { statusCode: 400, body: 'Missing slug' };

    // Netlify transmet le body en base64 pour le binaire
    const bin = event.isBase64Encoded
      ? Buffer.from(event.body || '', 'base64')
      : Buffer.from(event.body || '', 'utf8');

    if (!bin.length) return { statusCode: 400, body: 'Empty body' };

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE);
    const path = `covers/${slug}.${ext}`;
    const contentType = event.headers['content-type'] || 'application/octet-stream';

    const { error } = await supabase.storage.from(ASSETS_BUCKET).upload(path, bin, {
      upsert: true, contentType
    });
    if (error) return { statusCode: 500, body: `Upload error: ${error.message}` };

    const { data } = supabase.storage.from(ASSETS_BUCKET).getPublicUrl(path);
    return { statusCode: 200, body: JSON.stringify({ ok:true, url: data.publicUrl, path }) };
  } catch (e) {
    return { statusCode: 500, body: `Server error: ${e.message}` };
  }
};
