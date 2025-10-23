export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }
  try {
    const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GUIDES_BUCKET } = process.env;
    const body = JSON.parse(event.body || "{}");
    const { slug, guide } = body || {};
    if (!slug || !guide) return { statusCode: 400, body: "Missing slug or guide" };

    const path = `${slug}.json`;
    const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${GUIDES_BUCKET}/${encodeURI(path)}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
        "x-upsert": "true"
      },
      body: JSON.stringify(guide)
    });

    if (!res.ok) {
      const txt = await res.text();
      return { statusCode: res.status, body: `Supabase error: ${txt}` };
    }

    // URL publique
    const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${GUIDES_BUCKET}/${encodeURI(path)}`;
    return { statusCode: 200, body: JSON.stringify({ ok: true, url: publicUrl }) };
  } catch (e) {
    return { statusCode: 500, body: `Server error: ${e.message}` };
  }
}
