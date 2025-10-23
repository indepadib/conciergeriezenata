export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ASSETS_BUCKET } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !ASSETS_BUCKET) {
    const missing = [
      !SUPABASE_URL && "SUPABASE_URL",
      !SUPABASE_SERVICE_ROLE_KEY && "SUPABASE_SERVICE_ROLE_KEY",
      !ASSETS_BUCKET && "ASSETS_BUCKET",
    ].filter(Boolean).join(", ");
    return { statusCode: 500, body: `Missing env: ${missing}` };
  }
  try {
    const qs = new URLSearchParams(event.queryStringParameters || {});
    const slug = (qs.get("slug") || "").replace(/[^a-z0-9-]/gi, "-").toLowerCase();
    const ext = (qs.get("ext") || "webp").toLowerCase();
    if (!slug) return { statusCode: 400, body: "Missing slug" };

    const isBase64 = event.isBase64Encoded;
    const raw = isBase64 ? Buffer.from(event.body || "", "base64") : Buffer.from(event.body || "", "utf8");
    const contentType = event.headers["content-type"] || event.headers["Content-Type"] || "application/octet-stream";

    const path = `covers/${slug}.${ext}`;
    const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${ASSETS_BUCKET}/${encodeURI(path)}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": contentType,
        "x-upsert": "true"
      },
      body: raw
    });

    if (!res.ok) {
      const txt = await res.text();
      return { statusCode: res.status, body: `Supabase error: ${txt}` };
    }

    const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${ASSETS_BUCKET}/${encodeURI(path)}`;
    return { statusCode: 200, body: JSON.stringify({ ok: true, url: publicUrl }) };
  } catch (e) {
    return { statusCode: 500, body: `Server error: ${e.message}` };
  }
}
