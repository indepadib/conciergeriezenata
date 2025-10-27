const { createClient } = require('@supabase/supabase-js');

exports.handler = async () => {
  try {
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;
    const GUIDES_BUCKET = process.env.GUIDES_BUCKET || 'guides';

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) {
      return { statusCode: 500, body: 'Missing server env: SUPABASE_URL / SUPABASE_SERVICE_ROLE' };
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE);
    const { data, error } = await supabase.storage.from(GUIDES_BUCKET).list('', { limit: 200 });
    if (error) return { statusCode: 500, body: error.message };

    const items = (data || [])
      .filter(o => o.name.endsWith('.json'))
      .map(o => {
        const name = o.name.replace(/\.json$/, '');
        const { data:pub } = supabase.storage.from(GUIDES_BUCKET).getPublicUrl(o.name);
        return { name, publicUrl: pub.publicUrl };
      });

    return { statusCode: 200, body: JSON.stringify({ ok: true, objects: items }) };
  } catch (e) {
    return { statusCode: 500, body: `Server error: ${e.message}` };
  }
};

