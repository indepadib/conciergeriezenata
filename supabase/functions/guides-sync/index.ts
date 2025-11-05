// supabase/functions/guides-sync/index.ts
// Deno / Supabase Edge Functions

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BUCKET       = "guides";

const sb = createClient(SUPABASE_URL, SERVICE_KEY);

// util: applique nos defaults si pricing absent
function withDefaults(guide: any, slug: string) {
  const g = guide || {};
  const pricing = {
    currency:        g?.pricing?.currency        ?? "MAD",
    base:            Number(g?.pricing?.base ?? g?.pricing?.base_rate ?? 500),
    min:             Number(g?.pricing?.min  ?? g?.pricing?.min_rate  ?? 400),
    max:             Number(g?.pricing?.max  ?? g?.pricing?.max_rate  ?? 1000),
    cleaning_fee:    Number(g?.pricing?.cleaning_fee ?? 150),
    extra_guest_fee: Number(g?.pricing?.extra_guest_fee ?? 0),
    included_guests: Number(g?.pricing?.included_guests ?? 3)
  };
  return {
    slug,
    name: g?.name ?? slug,
    pricing
  };
}

// lit un objet JSON du bucket
async function readGuideFromStorage(path: string) {
  const { data, error } = await sb.storage.from(BUCKET).download(path);
  if (error) throw error;
  const txt = await data.text();
  return JSON.parse(txt);
}

// appelle la fonction SQL
async function upsertToDb(payload: any) {
  const { error } = await sb.rpc("upsert_property_from_guide", { p: payload });
  if (error) throw error;
}

serve(async (req) => {
  try {
    // 1) webhook storage (object.created / object.updated)
    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      // Supabase envoie généralement { type, record: { bucket_id, name } }
      const rec = body?.record;
      const name: string | undefined = rec?.name;

      if (!name || !name.endsWith(".json") || !name.startsWith("")) {
        return new Response("ignored", { status: 200 });
      }

      // on ne traite que guides/*.json
      const path = name; // ex: "guides/maison-cabo-elmodafar.json" ou "maison-cabo-elmodafar.json"
      const normalized = path.replace(/^guides\//, "");
      const slug = normalized.replace(/\.json$/,"");

      const raw = await readGuideFromStorage(normalized);
      const payload = withDefaults(raw, slug);
      await upsertToDb(payload);

      return new Response("ok", { status: 200 });
    }

    // 2) backfill manuel (appel GET ?rebuild=1) pour traiter tout le bucket
    const url = new URL(req.url);
    if (req.method === "GET" && url.searchParams.get("rebuild") === "1") {
      const { data, error } = await sb.storage.from(BUCKET).list("", { search: ".json" });
      if (error) throw error;

      const files = (data ?? [])
        .map((f: any) => f.name)
        .filter((n: string) => n?.endsWith(".json"));

      for (const file of files) {
        const slug = file.replace(/\.json$/,"");
        try {
          const raw = await readGuideFromStorage(file);
          const payload = withDefaults(raw, slug);
          await upsertToDb(payload);
        } catch (e) {
          console.error("rebuild error for", file, e);
        }
      }
      return new Response(`rebuilt ${files.length}`, { status: 200 });
    }

    return new Response("ok", { status: 200 });
  } catch (e) {
    console.error(e);
    return new Response(String(e?.message ?? e), { status: 500 });
  }
});
