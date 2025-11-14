/**
 * Netlify Edge Function pour la gestion du chat basé sur le guide.
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

    // === 1. Construire l'URL absolue vers get-guide
    const base =
      process.env.SITE_URL_GPT ||
      process.env.URL ||
      process.env.DEPLOY_PRIME_URL ||
      new URL('/', req.url).origin;
      
    // Utilisation de l'objet URL pour une construction de chemin fiable
   const guidePath = `/.netlify/functions/get-guide?slug=${encodeURIComponent(slug)}&ts=${Date.now()}`;
    
    // 2. Appel de la fonction get-guide
    // Nous passons le chemin au lieu de l'URL complète
    const guideRes = await fetch(guidePath, { 
        headers: { 'cache-control': 'no-store' } 
    });

    
    if (!guideRes.ok) {
      const errorDetail = await guideRes.text().catch(() => 'No response body');
      
      const errorMessage = `Guide fetch failed (${guideRes.status}). Check URL: ${guideUrl.toString()}. Detail: ${errorDetail.substring(0, 100)}`;
      console.error(`[GUIDE FETCH ERROR] ${errorMessage}`);

      // Retourner le message d'erreur explicite pour vous aider à débugger.
      return Response.json({ 
          error: `Le guide [${slug}] est introuvable. URL d'appel: ${guideUrl.toString()}. Détail: ${guideRes.status}` 
      }, { status: 500 }); // Status 500 pour les erreurs internes

    }

    /** @type {any} */
    const guide = await guideRes.json();
    if (!guide || typeof guide !== 'object') {
      return Response.json({ error: 'Guide empty or invalid' }, { status: 500 });
    }

    // Reste du code (Sécurité, Extraction de contexte, Appel LLM) ...
    // ... (Le reste du code est inchangé et correct)

    // === 3. Vérification de sécurité (Code porte)
    const hasToken = guide?.__sensitive?.token ? (token === guide.__sensitive.token) : true;
    const risky = /code.*porte|door.*code|bo[iî]te.*cl[eé]|lockbox|digicode/i.test(question);
    
    if (risky && !hasToken) {
      const msg = (lang === 'en')
        ? "For security, I can’t share the door code here. Add your token in the URL (?token=YOUR_TOKEN) or contact us."
        : "Par sécurité, je ne peux pas partager le code porte ici. Ajoutez votre jeton dans l’URL (?token=VOTRE_TOKEN) ou contactez-nous.";
      return Response.json({ answer: msg }, { status: 200 });
    }

    // === 4. Extraction du Contexte
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
      wifi: arrival?.wifi || {},
      checkin_from: arrival?.checkin_from || '',
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

    // === 5. Prompt Système LLM
    const system = `
You are "Concierge Zenata", a concise 5★ hotel-style concierge.
Language: ${lang}.
Use ONLY the JSON context to answer (address, wifi, check-in/out, rules, essentials, neighborhood, recommendations, amenities).
If a detail is missing, say you'll check with the team; do not invent.
Never reveal door codes unless "hasToken" is true.
Answer in 2–6 short lines, clear and friendly. Use bullets when helpful.
`.trim();

    const messages = [
      { role: 'system', content: system },
      { role: 'user', content: `GUIDE CONTEXT (JSON):\n${JSON.stringify(contextBlob, null, 2)}` },
      ...(Array.isArray(history) ? history : []),
      { role: 'user', content: question }
    ];

    // === 6. Appel à l'API OpenAI
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

    // === 7. Post-filtre de sécurité
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
