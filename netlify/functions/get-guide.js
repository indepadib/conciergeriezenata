import { createClient } from '@supabase/supabase-js';

// **ATTENTION :** Changez 'guides' si le nom de votre bucket est différent.
const BUCKET_NAME = 'guides'; 

export default async (req) => {
  try {
    // 1. Extraction du SLUG
    const url = new URL(req.url);
    // IMPORTANT : On met le slug en minuscule pour contrer les problèmes de casse dans les chemins de fichiers.
    const slug = url.searchParams.get('slug')?.trim().toLowerCase(); 

    if (!slug) {
      return new Response(JSON.stringify({ error: 'Missing slug' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    // Le chemin d'accès au fichier est le slug + .json
    const filePath = `${slug}.json`;

    // AGGRESSIVE DEBUGGING - Ceci doit apparaître dans vos logs Netlify
    console.log(`[GET-GUIDE] Attempting to fetch guide from bucket: ${BUCKET_NAME}, path: ${filePath}`);

    // 2. Connexion Supabase 
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

    // 3. Récupération du fichier JSON depuis Supabase Storage
    const { data: fileData, error: storageError } = await supabase
        .storage
        .from(BUCKET_NAME)
        .download(filePath);

    if (storageError) {
        // Log d'erreur détaillé pour le débogage Netlify
        console.error(`[GET-GUIDE] Supabase Storage Error for ${filePath}:`, storageError.message);
        
        // C'est ici que l'erreur 404 est générée
        return new Response(JSON.stringify({ error: `Guide not found for slug: ${slug}` }), { 
            status: 404, 
            headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
        });
    }

    if (!fileData) {
        console.warn(`[GET-GUIDE] File data empty for ${filePath}`);
        return new Response(JSON.stringify({ error: `Guide file is empty: ${filePath}` }), { 
            status: 404, 
            headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
        });
    }

    // 4. Conversion du Blob en JSON
    const text = await fileData.text();
    const guide = JSON.parse(text);

    // 5. Normalisation et réponse
    const g = guide; 
    if (typeof g.cover === 'string') g.cover = { imageUrl: g.cover };
    g.amenities ??= [];
    g.rules ??= { items: [] };

    return new Response(JSON.stringify(g), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'public, max-age=30, s-maxage=60'
      }
    });
  } catch (e) {
    console.error('[GET-GUIDE] Global execution error:', e);
    return new Response(JSON.stringify({ error: e.message || 'Server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
    });
  }
};
