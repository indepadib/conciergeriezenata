// netlify/functions/upload-guide.js
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;
const BUCKET = 'guides';

// active/désactive l'historisation
const SAVE_HISTORY = true;

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, body: 'Method Not Allowed' };
    }
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) {
      return { statusCode: 500, body: 'Missing server env: SUPABASE_URL / SUPABASE_SERVICE_ROLE' };
    }

    const { slug, guide } = JSON.parse(event.body || '{}');
    if (!slug || !guide) {
      return { statusCode: 400, body: 'Missing { slug, guide }' };
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE);

    // 1) backup versionné (optionnel)
    let historyUrl = null;
    if (SAVE_HISTORY) {
      const historyPath = `history/${slug}-${Date.now()}.json`;
      const { error: histErr } = await supabase.storage
        .from(BUCKET)
        .upload(historyPath, JSON.stringify(guide, null, 2), {
          upsert: true,
          contentType: 'application/json',
          cacheControl: '5',
        });
      if (histErr) {
        // on loggue seulement — pas bloquant pour la publication principale
        console.warn('History upload error:', histErr.message);
      } else {
        const { data } = supabase.storage.from(BUCKET).getPublicUrl(historyPath);
        historyUrl = data?.publicUrl || null;
      }
    }

    // 2) publication “active” (écrase l’ancienne)
    const mainPath = `${slug}.json`;
    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(mainPath, JSON.stringify(guide, null, 2), {
        upsert: true,                      // <-- IMPORTANT
        contentType: 'application/json',
        cacheControl: '5',                 // réduit l’effet du cache
      });

    if (upErr) {
      return { statusCode: 500, body: `Upload error: ${upErr.message}` };
    }

    const { data } = supabase.storage.from(BUCKET).getPublicUrl(mainPath);
    const url = data?.publicUrl;

    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, url, historyUrl }),
      headers: { 'Content-Type': 'application/json' },
    };
  } catch (e) {
    return { statusCode: 500, body: `Server error: ${e.message || e}` };
  }
};
