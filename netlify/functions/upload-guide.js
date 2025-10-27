// CommonJS, Node 18
const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;
    const GUIDES_BUCKET = process.env.GUIDES_BUCKET || 'guides';

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) {
      return { statusCode: 500, body: 'Missing server env: SUPABASE_URL / SUPABASE_SERVICE_ROLE' };
    }

    const { slug, guide } = JSON.parse(event.body || '{}');
    if (!slug || !guide) return { statusCode: 400, body: 'Missing slug or guide' };

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE);
    const path = `${slug}.json`;
    const buf = Buffer.from(JSON.stringify(guide, null, 2), 'utf8');

    const { error } = await supabase.storage.from(GUIDES_BUCKET).upload(path, buf, {
      upsert: true,
      contentType: 'application/json'
    });
    if (error) return { statusCode: 500, body: `Upload error: ${error.message}` };

    const { data } = supabase.storage.from(GUIDES_BUCKET).getPublicUrl(path);
    return { statusCode: 200, body: JSON.stringify({ ok: true, url: data.publicUrl, path }) };
  } catch (e) {
    return { statusCode: 500, body: `Server error: ${e.message}` };
  }
};

