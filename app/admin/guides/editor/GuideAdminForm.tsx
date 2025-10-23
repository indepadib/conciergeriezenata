'use client';
setSaving(true); setMsg('');
try {
const payload = { ...guide, __sensitive: token ? { token } : undefined };
const res = await fetch('/api/guides/upsert', {
method: 'POST',
headers: { 'Content-Type': 'application/json' },
body: JSON.stringify(payload),
});
const j = await res.json();
if (!res.ok) throw new Error(j?.error || 'Save failed');
setMsg(`✅ Sauvegardé : ${j.path}`);
} catch (e: any) {
setMsg(`❌ Erreur: ${e.message}`);
} finally {
setSaving(false);
}
}


return (
<div className="grid grid-cols-1 lg:grid-cols-2 gap-6 p-6">
{/* LEFT: Form */}
<div className="space-y-4">
<fieldset className="border rounded-xl p-4">
<legend className="px-2 text-sm font-medium">Identité</legend>
<div className="grid grid-cols-2 gap-3">
<label className="text-sm">Nom
<input className="border rounded px-2 py-1 w-full" value={guide.name} onChange={e => setGuide({ ...guide, name: e.target.value })} />
</label>
<label className="text-sm">Slug
<input className="border rounded px-2 py-1 w-full" value={guide.slug} onChange={e => setGuide({ ...guide, slug: e.target.value })} placeholder="zenata-azure-12b" />
</label>
<label className="text-sm col-span-2">Adresse
<input className="border rounded px-2 py-1 w-full" value={guide.address} onChange={e => setGuide({ ...guide, address: e.target.value })} />
</label>
<label className="text-sm col-span-2">Image couverture URL
<input className="border rounded px-2 py-1 w-full" value={guide.cover.imageUrl} onChange={e => setGuide({ ...guide, cover: { ...guide.cover, imageUrl: e.target.value } })} />
</label>
</div>
</fieldset>


<fieldset className="border rounded-xl p-4">
<legend className="px-2 text-sm font-medium">Arrivée</legend>
<div className="grid grid-cols-2 gap-3">
<label className="text-sm">Check-in dès
<input className="border rounded px-2 py-1 w-full" value={guide.arrival!.fr!.checkin_from} onChange={e => setGuide({ ...guide, arrival: { ...guide.arrival!, fr: { ...guide.arrival!.fr!, checkin_from: e.target.value } } })} />
</label>
<label className="text-sm">Code porte (sensible)
<input className="border rounded px-2 py-1 w-full" value={guide.arrival!.fr!.doorCode || ''} onChange={e => setGuide({ ...guide, arrival: { ...guide.arrival!, fr: { ...guide.arrival!.fr!, doorCode: e.target.value } } })} />
</label>
<label className="text-sm">Parking
<input className="border rounded px-2 py-1 w-full" value={guide.arrival!.fr!.parking || ''} onChange={e => setGuide({ ...guide, arrival: { ...guide.arrival!, fr: { ...guide.arrival!.fr!, parking: e.target.value } } })} />
</label>
<label className="text-sm">Wi‑Fi SSID
<input className="border rounded px-2 py-1 w-full" value={guide.arrival!.fr!.wifi?.ssid || ''} onChange={e => setGuide({ ...guide, arrival: { ...guide.arrival!, fr: { ...guide.arrival!.fr!, wifi: { ...(guide.arrival!.fr!.wifi || { password: '' }), ssid: e.target.value } } } })} />
</label>
<label className="text-sm">Wi‑Fi Password
<input className="border rounded px-2 py-1 w-full" value={guide.arrival!.fr!.wifi?.password || ''} onChange={e => setGuide({ ...guide, arrival: { ...guide.arrival!, fr: { ...guide.arrival!.fr!, wifi: { ...(guide.arrival!.fr!.wifi || { ssid: '' }), password: e.target.value } } } })} />
</label>
</div>
<div className="mt-3 text-sm">Jeton d'accès (option) — requis pour afficher le code porte :
<input className="border rounded px-2 py-1 w-full mt-1" placeholder="ex: A1B2C3" value={token} onChange={e => setToken(e.target.value)} />
</div>
</fieldset>


<button onClick={save} disabled={saving} className="rounded-lg px-4 py-2 border bg-black text-white disabled:opacity-60">
{saving ? 'Enregistrement...' : 'Publier le guide'}
</button>
{msg && <div className="text-sm mt-2">{msg}</div>}
</div>


{/* RIGHT: Live Preview */}
<div className="border rounded-2xl overflow-hidden">
<TravelerGuide property={guide} baseUrl={baseUrl} defaultLang="fr" />
</div>
</div>
);
}
