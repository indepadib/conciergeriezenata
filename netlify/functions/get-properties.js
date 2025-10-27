// netlify/functions/get-properties.js
const { createClient } = require('@supabase/supabase-js');
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE;

exports.handler = async () => {
  try {
    if (!url || !key) return { statusCode: 500, body: 'Missing env' };
    const sb = createClient(url, key);
    const { data, error } = await sb
      .from('properties')
      .select('id, slug, name, city')
      .order('name', { ascending: true });
    if (error) throw error;
    return { statusCode: 200, body: JSON.stringify({ properties: data || [] }), headers: { 'Content-Type':'application/json' } };
  } catch (e) {
    return { statusCode: 500, body: `get-properties error: ${e.message || e}` };
  }
};
