// netlify/functions/delete-guide.js
const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE =
      process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SERVICE_ROLE_KEY;
    const GUIDES_BUCKET = process.env.GUIDES_BUCKET || 'guides';
    const ASSETS_BUCKET = process.env.ASSETS_BUCKET || 'guide-assets';

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) {
      return { statusCode: 500, body: 'Missing server env: SUPABASE_URL / SUPABASE_SERVICE_ROLE' };
    }

    const { slug } = JSON.parse(event.body || '{}');
    if (!slug) return { statusCode: 400, body: 'Missing slug' };

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE);

    // 1) Delete guide JSON
    const jsonPath = `${slug}.json`;
    const { error: delJsonErr } = await supabase.storage.from(GUIDES_BUCKET).remove([jsonPath]);
    if (delJsonErr && delJsonErr.message && !/not found/i.test(delJsonErr.message)) {
      return { statusCode: 500, body: `Delete JSON error: ${delJsonErr.message}` };
    }

    // 2) Delete cover image(s) if exist: covers/<slug>.<ext>
    //    On liste le dossier covers/ et on supprime les fichiers qui commencent par "<slug>."
    const { data: list, error: listErr } = await supabase.storage
      .from(ASSETS_BUCKET)
      .list('covers', { limit: 1000 });
    if (!listErr && Array.isArray(list)) {
      const matches = list
        .filter(obj => obj.name && obj.name.startsWith(`${slug}.`))
        .map(obj => `covers/${obj.name}`);
      if (matches.length) {
        await supabase.storage.from(ASSETS_BUCKET).remove(matches);
      }
    }

    return { statusCode: 200, body: JSON.stringify({ ok: true, slug, removed: [jsonPath] }) };
  } catch (e) {
    return { statusCode: 500, body: `Server error: ${e.message}` };
  }
};
