// get-guide.ts
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY!; // pour SELECT public
const SUPABASE_BUCKET = 'guides';

const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export default async (req: Request) => {
  try {
    const url = new URL(req.url);
    const slug = url.searchParams.get('slug')?.trim();
    if (!slug) return json(400, { error: 'Missing slug' });

    // 1) DB lookup (direct current_slug)
    let guide = await fetchGuideBySlug(slug);
    // 2) Si pas trouvé, essayer via table d’alias (au cas où)
    if (!guide) {
      const alias = await fetchGuideByAlias(slug);
      if (alias) guide = alias;
    }
    // 3) Fallback ancien storage
    if (!guide) {
      const legacy = await fetchLegacyFromStorage(slug);
      if (!legacy) return json(404, { error: 'Guide not found' });
      return json(200, legacy);
    }

    // Normalisation minimale pour coller au front actuel
    const payload = normalizeGuide(guide);
    return json(200, payload);

  } catch (e: any) {
    return json(500, { error: e?.message || 'Server error' });
  }
};

async function fetchGuideBySlug(slug: string) {
  const { data, error } = await sb
    .from('properties_guides')
    .select('*')
    .eq('current_slug', slug)
    .eq('is_published', true)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}
async function fetchGuideByAlias(slug: string) {
  const { data, error } = await sb
    .from('properties_guides_slugs')
    .select('is_current, guide_id, properties_guides!inner(*)')
    .eq('slug', slug)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data?.properties_guides || null;
}

async function fetchLegacyFromStorage(slug: string) {
  // l’ancien JSON: public/guides/<slug>.json
  const url = `${SUPABASE_URL}/storage/v1/object/public/${SUPABASE_BUCKET}/${encodeURIComponent(slug)}.json`;
  try {
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

// Transforme notre ligne SQL en l’objet attendu par le front
function normalizeGuide(row: any) {
  const cover =
    row.cover_url ? { imageUrl: row.cover_url } :
    row.cover_key ? { imageUrl: publicStorageUrl(row.cover_key) } :
    null;

  return {
    name: row.name,
    address: row.address,
    geo: (row.geo_lat != null && row.geo_lng != null)
      ? { lat: row.geo_lat, lng: row.geo_lng }
      : null,
    cover,
    intro: row.intro || null,
    welcome: row.welcome || null,
    neighborhood: row.neighborhood || null,
    recommendations: row.recommendations || null,
    arrival: row.arrival || null,
    departure: row.departure || null,
    rules: row.rules || null,
    amenities: row.amenities || [],
    appliances: row.appliances || null,
    troubleshoot: row.troubleshoot || null,
    parking: row.parking || null,
    upsells: row.upsells || [],
    essentials: row.essentials || null,
    __sensitive: row.sensitive_token ? { token: row.sensitive_token } : undefined
  };
}

function publicStorageUrl(key: string) {
  const k = key.replace(/^\/+/, '');
  return `${SUPABASE_URL}/storage/v1/object/public/${k}`;
}

function json(status: number, body: any) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}
