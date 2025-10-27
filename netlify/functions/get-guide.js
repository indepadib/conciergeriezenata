// netlify/functions/get-guide.js
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || ''; // suffit pour contenu public
const BUCKET = 'guides';

exports.handler = async (event) => {
  try {
    const slug = (event.queryStringParameters?.slug || '').trim();
    if (!slug) {
      return { statusCode: 400, body: 'Missing slug' };
    }
    if (!SUPABASE_URL) {
      return { statusCode: 500, body: 'Missing SUPABASE_URL env' };
    }

    // Client public suffit car on lit un objet public
    const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const path = `${slug}.json`;

    // On récupère l'URL publique puis on fetch côté serveur (pour contrôler les headers cache)
    const { data: pub } = sb.storage.from(BUCKET).getPublicUrl(path);
    const publicUrl = pub?.publicUrl;
    if (!publicUrl) {
      return { statusCode: 404, body: 'Public URL not found' };
    }

    const resp = await fetch(`${publicUrl}?ts=${Date.now()}`, { cache: 'no-store' });
    if (!resp.ok) {
      return { statusCode: resp.status, body: `fetch error ${resp.status}` };
    }
    const json = await resp.json();

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        // Désactive fortement le cache côté edge/browser
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
      },
      body: JSON.stringify(json),
    };
  } catch (e) {
    return { statusCode: 500, body: `Server error: ${e.message || e}` };
  }
};
