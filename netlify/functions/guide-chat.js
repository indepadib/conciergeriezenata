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

  	// --- NOUVELLE LOGIQUE D'EXTRACTION DE CONTEXTE AMÉLIORÉE ---
  	const contextBlob = {
  	  name: guide.name || '',
  	  address: guide.address || '',
  	  city: guide.city || '',
  	  
        // Détails de l'arrivée
  	  checkin_from: arrival?.checkin_from || 'Information de check-in manquante',
  	  wifi: arrival?.wifi?.password || 'Mot de passe WiFi manquant', // Extraction directe pour plus de clarté
  	  parking: arrival?.parking || '',
        arrival_instructions: br(arrival?.instructions), // Ajout des instructions d'arrivée
        
        // Détails du départ
        checkout_before: departure?.checkout_before || 'Information de check-out manquante', // Heure de check-out
  	  departure_details: departure, // Garder l'objet complet pour d'autres détails de départ
        
        // Autres informations du guide
  	  rules,
  	  essentials: br(essentials),
  	  neighborhood_intro: neighborhood?.intro || '',
  	  neighborhood_places: Array.isArray(neighborhood?.places) ? neighborhood.places : [],
  	  recommendations_intro: recommendations?.intro || '',
  	  recommendations_tips: Array.isArray(recommendations?.tips) ? recommendations.tips : [],
  	  amenities,
  	  geo: guide.geo || null,
  	  hasToken
  	};
    
    // Si l'information est manquante, insérer un message explicite au lieu d'une chaîne vide
    if (contextBlob.checkin_from === '') contextBlob.checkin_from = 'Information de check-in manquante';
    if (contextBlob.checkout_before === '') contextBlob.checkout_before = 'Information de check-out manquante';
    if (contextBlob.wifi === '') contextBlob.wifi = 'Mot de passe WiFi manquant';


  	// --- MISE À JOUR DU SYSTEM PROMPT: Renforcement de la priorité au GUIDE CONTEXT et OBLIGATION de recherche ---
  	const system = `
You are "Concierge Zenata", a concise 5★ hotel-style concierge.
Language: ${lang}.
RÈGLES DU BIEN (Priorité Absolue) : Utilise le GUIDE CONTEXT (JSON) pour répondre à TOUTES les questions concernant le bien (check-in, check-out, règles, adresse, équipements, wifi). Si l'information dans le JSON est marquée comme "manquante" ou est vide, utilise la phrase du JSON (e.g., "Information de check-in manquante") au lieu d'inventer.
RÈGLES DE RECHERCHE (Obligation) : Si la question concerne la ville, les activités, les transports ou les recommandations locales ("que faire", "recommandations", "activités"), tu DOIS utiliser l'outil google_search.
Réponse : Réponds en 2–6 lignes courtes, clair et amical. Utilise des listes à puces si nécessaire.
Never reveal door codes unless "hasToken" is true.
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
    // Utilisation de GPT-3.5 Turbo pour sa fiabilité avec le tool calling.
    const city = guide.city || 'local attractions'; // Utiliser la ville du guide comme fallback
    
    // Définition de la fonction de recherche que le modèle peut appeler
    const searchTool = {
      type: "function",
      function: {
        name: "google_search",
        description: "Search Google for real-time information, especially for questions about local attractions, activities, and general knowledge outside of the guide context. MUST be used for local recommendations.",
        parameters: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "The search query, ideally including the city name if relevant, e.g., 'best restaurants in Paris' or 'activities near Zenata'."
            }
          },
          required: ["query"]
        }
      }
    };
    
    // Pour OpenRouter/OpenAI, les outils sont dans un tableau distinct.
    const tools = [searchTool];
    const modelName = 'openai/gpt-3.5-turbo';

  	const llmRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
  	  method: 'POST',
  	  headers: { 
          'Content-Type': 'application/json', 
          Authorization: `Bearer ${OPENROUTER_API_KEY}` 
      },
  	  body: JSON.stringify({ 
          model: modelName, // Nouveau modèle GPT-3.5 Turbo
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

    // Si le modèle décide d'utiliser l'outil (tool call), OpenRouter va automatiquement exécuter la recherche
    // et renvoyer la réponse comme si c'était le texte de la réponse (Grounding).

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
