export async function handler(){
try{
const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GUIDES_BUCKET } = process.env;
if(!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !GUIDES_BUCKET){
const missing=[!SUPABASE_URL&&'SUPABASE_URL',!SUPABASE_SERVICE_ROLE_KEY&&'SUPABASE_SERVICE_ROLE_KEY',!GUIDES_BUCKET&&'GUIDES_BUCKET'].filter(Boolean).join(', ');
return { statusCode: 500, body: `Missing env: ${missing}` };
}
// Storage list API: POST /storage/v1/object/list/<bucket>
const res = await fetch(`${SUPABASE_URL}/storage/v1/object/list/${GUIDES_BUCKET}`, {
method: 'POST',
headers: { 'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' },
body: JSON.stringify({ prefix: '', limit: 1000, offset: 0, sortBy: { column: 'name', order: 'asc' } })
});
if(!res.ok){ const txt=await res.text(); return { statusCode: res.status, body: `Supabase error: ${txt}` } }
const arr = await res.json();
// shape rows
const objects = (arr||[]).filter(o=>o.name.endsWith('.json')).map(o=>({ name: o.name.replace(/\.json$/,''), publicUrl: `${SUPABASE_URL}/storage/v1/object/public/${GUIDES_BUCKET}/${o.name}` }));
return { statusCode: 200, body: JSON.stringify({ objects }) };
}catch(e){ return { statusCode: 500, body: `Server error: ${e.message}` } }
}
