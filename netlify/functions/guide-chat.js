/**
 * Netlify Edge Function to handle guide-based chat.
 */
export default async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  try {
    const { slug, token, lang = 'fr', question = '', history = [] } = await req.json();

    if (!slug || !question) {
      return Response.json({ error: 'Missing slug/question' }, { status: 400 });
    }

    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_API_KEY) {
      return Response.json({ error: 'Missing OPENAI_API_KEY' }, { status: 500 });
    }

    // === 1. Build absolute URL to get-guide
    const base =
      process.env.SITE_URL_GPT ||
      process.env.URL ||
      process.env.DEPLOY_PRIME_URL ||
      new URL('/', req.url).origin;

    const guideUrl = `${base}/.netlify/functions/get-guide?slug=${encodeURIComponent(slug)}`;
    
    // Ajout d'un ts pour cache-busting et appel à la fonction get-guide
    const guideRes = await fetch(`${guideUrl}&ts=${Date.now()}`, { headers: { 'cache-control': 'no-store' } });

    if (!guideRes.ok) {
      const errorDetail = await guideRes.text().catch(() => 'No response body');
      // Affichage de l'URL dans l'erreur pour le débogage du 404
      const errorMessage = `Guide fetch failed (${guideRes.status}). Check URL: ${guideUrl}. Detail: ${errorDetail.substring(0, 100)}`;
      console.error(`[GUIDE FETCH ERROR] ${errorMessage}`);
      return Response.json({ error: errorMessage }, { status: 500 });
    }

    /** @type {any} */
    const guide = await guideRes.json();
    if (!guide || typeof guide !== 'object') {
      return Response.json({ error: 'Guide empty or invalid' }, { status: 500 });
    }

    // === 2. Security Check (Code porte)
    const hasToken = guide?.__sensitive?.token ? (token === guide.__sensitive.token) : true;
    const risky = /code.*porte|door.*code|bo[iî]te.*cl[eé]|lockbox|digicode/i.test(question);
    
    if (risky && !hasToken) {
      const msg = (lang === 'en')
        ? "For security, I can’t share the door code here. Add your token in the URL (?token=YOUR_TOKEN) or contact us."
        : "Par sécurité, je ne peux pas partager le code porte ici. Ajoutez votre jeton dans l’URL (?token=VOTRE_TOKEN) ou contactez-nous.";
      return Response.json({ answer: msg }, { status: 200 });
    }

    // === 3. Context Extraction
    const pick = (obj) => (obj && (obj[lang] ?? obj.fr ?? obj.en)) || null;
    const br = (s) => (s || '').toString().replace(/\n/g, ' ');

    const arrival = pick(guide.arrival) || {};
    const departure = pick(guide.departure) || {};
    const rules = (pick(guide.rules)?.items) || [];
    const essentials = pick(guide.essentials) || '';
    const neighborhood = pick(guide.neighborhood) || {};
    const recommendations = pick(guide.recommendations) || {};
    const amenities = (Array.isArray(guide.amenities) ? guide.amenities : []).map(a => a?.label).filter(Boolean).join(', ');

    const contextBlob = {
      name: guide.name || '',
      address: guide.address || '',
      city: guide.city || '',
      // Amélioration de l'extraction de wifi pour éviter les objets vides
      wifi_password: arrival?.wifi?.password || 'Mot de passe WiFi manquant',
      checkin_from: arrival?.checkin_from || 'Information de check-in manquante',
      parking: arrival?.parking || '',
      rules,
      essentials: br(essentials),
      departure,
      neighborhood_intro: neighborhood?.intro || '',
      neighborhood_places: Array.isArray(neighborhood?.places) ? neighborhood.places : [],
      recommendations_intro: recommendations?.intro || '',
      recommendations_tips: Array.isArray(recommendations?.tips) ? recommendations.tips : [],
      amenities,
      geo: guide.geo || null,
      hasToken
    };

    // === 4. LLM System Prompt
    const system = `
You are "Concierge Zenata", a concise 5★ hotel-style concierge.
Language: ${lang}.
Use ONLY the JSON context to answer (address, wifi, check-in/out, rules, essentials, neighborhood, recommendations, amenities).
If a detail is missing, use the "manquante" statement from the JSON context; do not invent.
Never reveal door codes unless "hasToken" is true.
Answer in 2–6 short lines, clear and friendly. Use bullets when helpful.
`.trim();

    const messages = [
      { role: 'system', content: system },
      { role: 'user', content: `GUIDE CONTEXT (JSON):\n${JSON.stringify(contextBlob, null, 2)}` },
      ...(Array.isArray(history) ? history : []),
      { role: 'user', content: question }
    ];

    // === 5. Call OpenAI API
    const llmRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_API_KEY}` },
      body: JSON.stringify({ model: 'gpt-4o-mini', temperature: 0.2, messages })
    });

    if (!llmRes.ok) {
      const txt = await llmRes.text();
      console.error(`[LLM API ERROR] Status: ${llmRes.status}, Response: ${txt.substring(0, 500)}`);
      return Response.json({ error: `LLM error: Failed to get completion.` }, { status: 502 });
    }

    const json = await llmRes.json();
    let answer = json?.choices?.[0]?.message?.content?.trim() || '';

    // === 6. Post-filter: prevent accidental code leakage
    if (!hasToken && /(\b\d{4,6}\b)/.test(answer)) {
      answer = (lang === 'en')
        ? "For security, I can’t share codes here. Add your token in the URL (?token=YOUR_TOKEN) or contact us."
        : "Par sécurité, je ne peux pas partager des codes ici. Ajoutez votre jeton dans l’URL (?token=VOTRE_TOKEN) ou contactez-nous.";
    }

    return Response.json({ answer }, { status: 200 });
  } catch (e) {
    console.error(`[GLOBAL RUNTIME ERROR] ${e?.stack || e?.message || String(e)}`);
    return Response.json({ error: e?.message || String(e) }, { status: 500 });
  }
};
