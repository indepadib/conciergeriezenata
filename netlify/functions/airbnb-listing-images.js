exports.handler = async function(event) {
  try {
    const rawUrl = event.queryStringParameters && event.queryStringParameters.url;
    if (!rawUrl) {
      return json(400, { ok: false, error: 'Missing url parameter' });
    }

    let listingUrl;
    try {
      listingUrl = new URL(rawUrl);
    } catch (e) {
      return json(400, { ok: false, error: 'Invalid URL' });
    }

    const isAirbnb = /(^|\.)airbnb\./i.test(listingUrl.hostname) && /\/rooms\//i.test(listingUrl.pathname);
    if (!isAirbnb) {
      return json(400, { ok: false, error: 'Only Airbnb room URLs are accepted' });
    }

    // Keep the URL clean. Dates/search params are not useful for listing media.
    const cleanUrl = `${listingUrl.origin}${listingUrl.pathname}`;

    const response = await fetch(cleanUrl, {
      headers: {
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36',
        'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'accept-language': 'fr-FR,fr;q=0.9,en;q=0.8'
      }
    });

    if (!response.ok) {
      return json(200, { ok: false, error: `Airbnb returned ${response.status}`, images: [], sourceUrl: cleanUrl });
    }

    const html = await response.text();
    const title = pickMeta(html, 'og:title') || pickTitle(html) || '';
    const description = pickMeta(html, 'og:description') || '';

    const images = extractAirbnbImages(html);
    const ogImage = pickMeta(html, 'og:image');
    if (ogImage) images.unshift(normalizeImageUrl(ogImage));

    const uniqueImages = unique(images)
      .filter(Boolean)
      .filter(src => /^https:\/\//.test(src))
      .slice(0, 8);

    return json(200, {
      ok: uniqueImages.length > 0,
      sourceUrl: cleanUrl,
      title,
      description,
      images: uniqueImages
    }, {
      'Cache-Control': 'public, max-age=21600, s-maxage=21600'
    });
  } catch (error) {
    return json(200, { ok: false, error: error.message, images: [] });
  }
};

function json(statusCode, payload, extraHeaders = {}) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...extraHeaders
    },
    body: JSON.stringify(payload)
  };
}

function decodeHtml(value) {
  return String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/\\u002F/g, '/')
    .replace(/\\\//g, '/')
    .replace(/\\u0026/g, '&');
}

function pickMeta(html, property) {
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re1 = new RegExp(`<meta[^>]+property=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`, 'i');
  const re2 = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${escaped}["'][^>]*>`, 'i');
  const match = html.match(re1) || html.match(re2);
  return match ? decodeHtml(match[1]) : '';
}

function pickTitle(html) {
  const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return match ? decodeHtml(match[1]).trim() : '';
}

function normalizeImageUrl(url) {
  let src = decodeHtml(url).trim();
  if (!src) return '';
  try {
    const u = new URL(src);
    // Ask Airbnb's image CDN for a decent card size. It may ignore this, but usually works.
    if (/muscache\.com$/i.test(u.hostname) || /\.muscache\.com$/i.test(u.hostname)) {
      u.searchParams.set('im_w', '960');
      return u.toString();
    }
  } catch (e) {}
  return src;
}

function extractAirbnbImages(html) {
  const text = decodeHtml(html);
  const results = [];

  // Most Airbnb listing photos are hosted on a*.muscache.com/im/pictures/...
  const regexes = [
    /https:\/\/a\d+\.muscache\.com\/im\/pictures\/[^\s"'<>\\)]+/gi,
    /https:\/\/[^\s"'<>\\)]+\.muscache\.com\/im\/pictures\/[^\s"'<>\\)]+/gi,
    /https:\/\/a\d+\.muscache\.com\/pictures\/[^\s"'<>\\)]+/gi
  ];

  for (const re of regexes) {
    let match;
    while ((match = re.exec(text)) !== null) {
      results.push(normalizeImageUrl(match[0]));
    }
  }

  return results;
}

function unique(list) {
  const seen = new Set();
  const out = [];
  for (const item of list) {
    const clean = item && item.split('"')[0].split("'")[0];
    if (!clean || seen.has(clean)) continue;
    seen.add(clean);
    out.push(clean);
  }
  return out;
}
