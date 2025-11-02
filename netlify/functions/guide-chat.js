/**
// netlify/functions/guide-chat.js
export default async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  try {
    const { slug, token, lang = 'fr', question = '', history = [] } = await req.json();

    if (!slug || !question) {
      return Response.json({ error: 'Missing slug/question' }, { status: 400 });
    }

    // === Build absolute URL to get-guide (no relative URL issues)
    const base =
      process.env.SITE_URL_GPT ||
      process.env.URL ||
      process.env.DEPLOY_PRIME_URL ||
      new URL('/', req.url).origin;

    const guideUrl = `${base}/.netlify/functions/get-guide?slug=${encodeURIComponent(slug)}&ts=${Date.now()}`;
    const guideRes = await fetch(guideUrl, { headers: { 'cache-control': 'no-store' } });

    if (!guideRes.ok) {
      return Response.json({ error: `Guide fetch failed (${guideRes.status})` }, { status: 500 });
    }

    
    const guide = await guideRes.json();
    if (!guide || typeof guide !== 'object') {
      return Response.json({ error: 'Guide empty or invalid' }, { status: 500 });
    }

    // === Security: never reveal door code if token invalid
    const hasToken = guide?.__sensitive?.token ? (token === guide.__sensitive.token) : true;
    const risky = /code.*porte|door.*code|bo[iî]te.*cl[eé]|lockbox|digicode/i.test(question);
    if (risky && !hasToken) {
      const msg = (lang === 'en')
        ? "For security, I can’t share the door code here. Add your token in the URL (?token=YOUR_TOKEN) or contact us."
        : "Par sécurité, je ne peux pas partager le code porte ici. Ajoutez votre jeton dans l’URL (?token=VOTRE_TOKEN) ou contactez-nous.";
      return Response.json({ answer: msg }, { status: 200 });
    }

    // === Language helpers
    const pick = (obj) => (obj && (obj[lang] ?? obj.fr ?? obj.en)) || null;
    const br = (s) => (s || '').toString().replace(/\n/g, ' ');

    // === Context extraction (defensively)
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

    const system = `
You are "Concierge Zenata", a concise 5★ hotel-style concierge.
Language: ${lang}.
Use ONLY the JSON context to answer (address, wifi, check-in/out, rules, essentials, neighborhood, recommendations, amenities).
If a detail is missing, say you'll check with the team; do not invent.
Never reveal door codes unless "hasToken" is true.
Answer in 2–6 short lines, clear and friendly. Use bullets when helpful.
`.trim();

    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_API_KEY) {
      return Response.json({ error: 'Missing OPENAI_API_KEY' }, { status: 500 });
    }

    const messages = [
      { role: 'system', content: system },
      { role: 'user', content: `GUIDE CONTEXT (JSON):\n${JSON.stringify(contextBlob, null, 2)}` },
      ...(Array.isArray(history) ? history : []),
      { role: 'user', content: question }
    ];

    const llmRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_API_KEY}` },
      body: JSON.stringify({ model: 'gpt-4o-mini', temperature: 0.2, messages })
    });

    if (!llmRes.ok) {
      const txt = await llmRes.text();
      return Response.json({ error: `LLM error: ${txt}` }, { status: 502 });
    }

    const json = await llmRes.json();
    let answer = json?.choices?.[0]?.message?.content?.trim() || '';

    // Post-filter: avoid accidental code leakage if token missing
    if (!hasToken && /(\b\d{4,6}\b)/.test(answer)) {
      answer = (lang === 'en')
        ? "For security, I can’t share codes here. Add your token in the URL (?token=YOUR_TOKEN) or contact us."
        : "Par sécurité, je ne peux pas partager des codes ici. Ajoutez votre jeton dans l’URL (?token=VOTRE_TOKEN) ou contactez-nous.";
    }

    return Response.json({ answer }, { status: 200 }); 
  } catch (e) {
    return Response.json({ error: e?.message || String(e) }, { status: 500 });
  }
};
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

  	// === Build absolute URL to get-guide (no relative URL issues)
  	const base =
  	  process.env.SITE_URL_GPT ||
  	  process.env.URL ||
  	  process.env.DEPLOY_PRIME_URL ||
  	  new URL('/', req.url).origin;

  	const guideUrl = `${base}/.netlify/functions/get-guide?slug=${encodeURIComponent(slug)}&ts=${Date.now()}`;
  	const guideRes = await fetch(guideUrl, { headers: { 'cache-control': 'no-store' } });

  	if (!guideRes.ok) {
  	  return Response.json({ error: `Guide fetch failed (${guideRes.status})` }, { status: 500 });
  	}

  	/** @type {any} */
  	const guide = await guideRes.json();
  	if (!guide || typeof guide !== 'object') {
  	  return Response.json({ error: 'Guide empty or invalid' }, { status: 500 });
  	}

  	// === Security: never reveal door code if token invalid
  	const hasToken = guide?.__sensitive?.token ? (token === guide.__sensitive.token) : true;
  	const risky = /code.*porte|door.*code|bo[iî]te.*cl[eé]|lockbox|digicode/i.test(question);
  	if (risky && !hasToken) {
  	  const msg = (lang === 'en')
  	    ? "For security, I can’t share the door code here. Add your token in the URL (?token=YOUR_TOKEN) or contact us."
  	    : "Par sécurité, je ne peux pas partager le code porte ici. Ajoutez votre jeton dans l’URL (?token=VOTRE_TOKEN) ou contactez-nous.";
  	  return Response.json({ answer: msg }, { status: 200 });
  	}

  	// === Language helpers
  	const pick = (obj) => (obj && (obj[lang] ?? obj.fr ?? obj.en)) || null;
  	const br = (s) => (s || '').toString().replace(/\n/g, ' ');

  	// === Context extraction (defensively)
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

  	// --- MISE À JOUR DU SYSTEM PROMPT pour autoriser la connaissance générale ---
  	const system = `
You are "Concierge Zenata", a concise 5★ hotel-style concierge.
Language: ${lang}.
Use the GUIDE CONTEXT (JSON) to answer questions about the property, rules, and amenities.
For questions about the local area, activities, or general knowledge (not covered in the JSON), use your general knowledge and the provided search results.
If a detail about the property is missing in the JSON, say you'll check with the team; do not invent.
Never reveal door codes unless "hasToken" is true.
Answer in 2–6 short lines, clear and friendly. Use bullets when helpful.
`.trim();

  	// --- CHANGEMENT CRUCIAL ICI ---
  	const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
  	if (!OPENROUTER_API_KEY) {
  	  return Response.json({ error: 'Missing OPENROUTER_API_KEY. Please set this variable in Netlify.' }, { status: 500 });
  	}

  	const messages = [
  	  { role: 'system', content: system },
  	  { role: 'user', content: `GUIDE CONTEXT (JSON):\n${JSON.stringify(contextBlob, null, 2)}` },
  	  ...(Array.isArray(history) ? history : []),
  	  { role: 'user', content: question }
  	];

  	// --- CONFIGURATION OPENROUTER POUR LA RECHERCHE (GROUNDING) ---
    // Note: OpenRouter supporte le 'tools' (Google Search) pour les modèles qui le permettent.
    // Nous définissons la requête pour la recherche.
    const city = guide.city || 'local attractions'; // Utiliser la ville du guide comme fallback
    const tools = [{ type: "google_search", queries: [`${city} ${question}`, question] }];

  	const llmRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
  	  method: 'POST',
  	  headers: { 
          'Content-Type': 'application/json', 
          // Utiliser la clé OpenRouter
          Authorization: `Bearer ${OPENROUTER_API_KEY}` 
      },
  	  body: JSON.stringify({ 
          model: 'mistralai/mistral-7b-instruct:free', 
          temperature: 0.2, 
          messages,
          tools: tools // Ajout de l'outil de recherche
      })
  	});

  	if (!llmRes.ok) {
  	  const txt = await llmRes.text();
  	  return Response.json({ error: `LLM error from OpenRouter: ${txt}` }, { status: 502 });
  	}

  	const json = await llmRes.json();
  	let answer = json?.choices?.[0]?.message?.content?.trim() || '';

  	// Post-filter: avoid accidental code leakage if token missing
  	if (!hasToken && /(\b\d{4,6}\b)/.test(answer)) {
  	  answer = (lang === 'en')
  	    ? "For security, I can’t share codes here. Add your token in the URL (?token=YOUR_TOKEN) or contact us."
  	    : "Par sécurité, je ne peux pas partager des codes ici. Ajoutez votre jeton dans l’URL (?token=VOTRE_TOKEN) ou contactez-nous.";
  	}

  	return Response.json({ answer }, { status: 200 });
  } catch (e) {
  	return Response.json({ error: e?.message || String(e) }, { status: 500 });
  }
};
