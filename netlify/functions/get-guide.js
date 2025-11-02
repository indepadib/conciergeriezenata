// netlify/functions/get-guide.js
import { createClient } from '@supabase/supabase-js';

export const handler = async (event) => {
  try {
    const slug = event.queryStringParameters?.slug?.trim();
    if (!slug) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Missing slug' }) };
    }

    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

    const { data, error } = await supabase
      .rpc('guide_by_slug', { p_slug: slug });

    if (error) throw error;

    if (!data) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: 'Guide not found' }),
        headers: { 'Cache-Control': 'no-store' }
      };
    }

    // Normalisations douces pour le front (optionnel)
    const g = data;
    // harmoniser cover url/obj
    if (typeof g.cover === 'string') g.cover = { imageUrl: g.cover };
    // defaults
    g.amenities ??= [];
    g.rules ??= { items: [] };

    return {
      statusCode: 200,
      body: JSON.stringify(g),
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        // 30s edge cache, revalidate si besoin
        'Cache-Control': 'public, max-age=30, s-maxage=60'
      }
    };
  } catch (e) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: e.message || 'Server error' }),
      headers: { 'Cache-Control': 'no-store' }
    };
  }
};
