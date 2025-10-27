// netlify/functions/list-guides.js
const { createClient } = require('@supabase/supabase-js');
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;
const BUCKET = 'guides';

exports.handler = async () => {
  try {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) {
      return { statusCode: 500, body: 'Missing server env: SUPABASE_URL / SUPABASE_SERVICE_ROLE' };
    }
    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE);
    const { data, error } = await sb.storage.from(BUCKET).list('', { limit: 1000 });
    if (error) return { statusCode: 500, body: error.message };

    const objects = (data || [])
      .filter(x => x.name.endsWith('.json'))
      .map(x => ({
        name: x.name.replace(/\.json$/,''),
        publicUrl: sb.storage.from(BUCKET).getPublicUrl(x.name).data.publicUrl,
      }));

    return { statusCode: 200, body: JSON.stringify({ objects }), headers: { 'Content-Type': 'application/json' } };
  } catch (e) {
    return { statusCode: 500, body: e.message || String(e) };
  }
};
