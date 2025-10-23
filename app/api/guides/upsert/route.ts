import { NextRequest, NextResponse } from 'next/server';


export async function POST(req: NextRequest) {
try {
const body = await req.json();
if (!body?.slug) return NextResponse.json({ error: 'slug manquant' }, { status: 400 });


const json = JSON.stringify(body, null, 2);
const filename = `${body.slug}.json`;


// 1) Local dev: write to /public/guides
if (process.env.NODE_ENV !== 'production') {
const fs = await import('fs/promises');
const path = await import('path');
const dir = path.join(process.cwd(), 'public', 'guides');
await fs.mkdir(dir, { recursive: true });
const filePath = path.join(dir, filename);
await fs.writeFile(filePath, json, 'utf8');
return NextResponse.json({ ok: true, path: `/guides/${filename}` });
}


// 2) Production: try Supabase storage if configured
if (process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY) {
const { createClient } = await import('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
const bucket = 'guides';
// Ensure bucket exists (will fail silently if already exists)
try { await supabase.storage.createBucket(bucket, { public: true }); } catch {}
const { data, error } = await supabase.storage.from(bucket).upload(filename, new Blob([json], { type: 'application/json' }), { upsert: true });
if (error) throw error;
const { data: pub } = supabase.storage.from(bucket).getPublicUrl(filename);
return NextResponse.json({ ok: true, path: pub.publicUrl });
}


// 3) Fallback: not configured
return NextResponse.json({ error: 'Pas de méthode de stockage en production (configure SUPABASE_URL/ANON_KEY)' }, { status: 501 });
} catch (e: any) {
return NextResponse.json({ error: e.message || 'Unknown error' }, { status: 500 });
}
}
