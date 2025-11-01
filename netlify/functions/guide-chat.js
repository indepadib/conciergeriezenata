// netlify/functions/guide-chat.js
export default async (req, context) => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }
  try {
    const { slug, token, lang = 'fr', question = '', history = [] } = await req.json();

    if (!slug || !question) {
      return Response.json({ error: 'Missing slug/question' }, { status: 400 });
    }

    // 1) Récupère le JSON du guide (via ton endpoint sans cache)
    const guideRes = await fetch(`${process.env.SITE_URL || ''}/.netlify/functions/get-guide?slug=${encodeURIComponent(slug)}&ts=${Date.now()}`);
    if (!guideRes.ok) {
      return Response.json({ error: 'Guide fetch failed' }, { status: 500 });
    }
    const guide = await guideRes.json();

    // 2) Garde-fous (ne jamais divulguer code porte si token invalide)
    const hasToken = guide?.__sensitive?.token ? (token === guide.__sensitive.token) : true;
    const risky = /code.*porte|door.*code|boîte.*clé|lockbox|digicode/i.test(question);
    if (risky && !hasToken) {
      const msg = (lang==='en')
        ? "For security, I can’t share the door code here. Add your token in the URL (?token=YOUR_TOKEN) or contact us."
        : "Par sécurité, je ne peux pas partager le code porte ici. Ajoute ton jeton dans l’URL (?token=VOTRE_TOKEN) ou contacte-nous.";
      return Response.json({ answer: msg }, { status: 200 });
    }

    // 3) Construit le contexte (langue + données utiles)
    const pick = (obj)=> obj?.[lang] ?? obj?.fr ?? obj?.en ?? null;
    const arrival = pick(guide.arrival) || {};
    const departure = pick(guide.departure) || {};
    const rules = (pick(guide.rules)?.items) || [];
    const essentials = pick(guide.essentials) || '';
    const neighborhood = pick(guide.neighborhood) || {};
    const recommendations = pick(guide.recommendations) || {};
    const amenities = (guide.amenities||[]).map(a=>a.label).join(', ');

    // 4) Prompt “sûr” pour le LLM
    const system = `
You are "Concierge Zenata", a helpful, concise hotel-style concierge.
Language: ${lang}.
Use ONLY the provided guide JSON to answer (address, wifi, check-in/out, rules, essentials, neighborhood, recommendations, amenities).
If a detail is missing, say you will check with the team; do not hallucinate.
Never reveal door codes unless "hasToken" is true.
Keep answers short (2-6 lines) and friendly. When relevant, include clear steps or bullets.
`.trim();

    const contextBlob = {
      name: guide.name,
      address: guide.address,
      city: guide.city,
      wifi: arrival?.wifi || {},
      checkin_from: arrival?.checkin_from,
      parking: arrival?.parking,
      rules,
      essentials,
      departure: departure || {},
      neighborhood_intro: neighborhood?.intro || '',
      neighborhood_places: neighborhood?.places || [],
      recommendations_intro: recommendations?.intro || '',
      recommendations_tips: recommendations?.tips || [],
      amenities,
      geo: guide.geo || null,
      hasToken
    };

    // 5) Appelle ton fournisseur LLM (ex: OpenAI) — modèle au choix
    //    Mets OPENAI_API_KEY dans Netlify env. Tu peux changer l’URL/modèle si tu utilises un autre provider.
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_API_KEY) {
      return Response.json({ error: 'Missing OPENAI_API_KEY' }, { status: 500 });
    }

    const messages = [
      { role: 'system', content: system },
      { role: 'user', content: `GUIDE CONTEXT (JSON):\n${JSON.stringify(contextBlob, null, 2)}` },
      ...history, // [{role:'user'|'assistant', content:'...'}] si tu veux persister
      { role: 'user', content: question }
    ];

    const llmRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type':'application/json', Authorization: `Bearer ${OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini', // ou autre
        temperature: 0.2,
        messages
      })
    });
    if (!llmRes.ok) {
      const txt = await llmRes.text();
      return Response.json({ error: `LLM error: ${txt}` }, { status: 500 });
    }
    const json = await llmRes.json();
    const answer = json?.choices?.[0]?.message?.content?.trim() || '';

    // Option: petite post-protection (codes)
    if (!hasToken && /(\b\d{4,6}\b)/.test(answer)) {
      return Response.json({ answer: (lang==='en'
        ? "For security, I can’t share codes here. Add your token in the URL (?token=YOUR_TOKEN) or contact us."
        : "Par sécurité, je ne peux pas partager des codes ici. Ajoute ton jeton dans l’URL (?token=VOTRE_TOKEN) ou contacte-nous.") }, { status: 200 });
    }

    return Response.json({ answer }, { status: 200 });
  } catch (e) {
    return Response.json({ error: e.message || String(e) }, { status: 500 });
  }
};
