// netlify/functions/get-prices.js
const { createClient } = require('@supabase/supabase-js');

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE;

exports.handler = async (event) => {
  try {
    if (!url || !key) return { statusCode: 500, body: 'Missing env' };
    const sb = createClient(url, key);

    const qs = event.queryStringParameters || {};
    const propertyId = qs.property_id;
    if (!propertyId) return { statusCode: 400, body: 'property_id required' };

    const start = new Date(qs.start || new Date().toISOString().slice(0,10));
    const days = Math.max(1, Math.min(parseInt(qs.days || '90', 10), 540));
    const startIso = start.toISOString().slice(0,10);
    const end = new Date(start); end.setDate(end.getDate() + days);
    const endIso = end.toISOString().slice(0,10);

    const { data, error } = await sb
      .from('nightly_prices')
      .select('stay_date, price')
      .eq('property_id', propertyId)
      .gte('stay_date', startIso)
      .lt('stay_date', endIso)
      .order('stay_date', { ascending: true });

    if (error) throw error;
    return { statusCode: 200, body: JSON.stringify({ prices: data || [] }), headers: { 'Content-Type': 'application/json' } };
  } catch (e) {
    return { statusCode: 500, body: `get-prices error: ${e.message || e}` };
  }
};
