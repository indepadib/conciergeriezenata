// =============================
try {
const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || ''}/guides/${slug}.json`, {
// Ensure we bypass any ISR cache when developing
next: { revalidate: 0 },
cache: "no-store",
});
if (!res.ok) return null;
const json = await res.json();
return json as PropertyGuide;
} catch (e) {
console.error("fetchGuide error", e);
return null;
}
}


export default async function Page({ params, searchParams }: { params: { slug: string }; searchParams: { token?: string } }) {
const data = await fetchGuide(params.slug);
if (!data) {
return (
<div className="max-w-2xl mx-auto p-8">
<h1 className="text-2xl font-semibold">Guide introuvable</h1>
<p className="text-slate-600 mt-2">Aucun contenu n'a été trouvé pour « {params.slug} ».</p>
</div>
);
}


// Simple token-gating: if a token is set in the JSON, require it via URL (?token=...)
const tokenRequired: string | undefined = (data as any)?.__sensitive?.token;
const provided = searchParams?.token;


// We will clone data and blank out sensitive fields if token mismatch
const sanitized: PropertyGuide = JSON.parse(JSON.stringify(data));
if (tokenRequired && tokenRequired !== provided) {
// Optional: hide door code & notes marked as sensitive
if (sanitized.arrival?.fr) {
sanitized.arrival.fr.doorCode = undefined as any;
}
if (sanitized.arrival?.en) {
sanitized.arrival.en!.doorCode = undefined as any;
}
if (sanitized.arrival?.ar) {
sanitized.arrival.ar!.doorCode = undefined as any;
}
}


return (
<div className="min-h-screen">
<TravelerGuide property={sanitized} baseUrl={process.env.NEXT_PUBLIC_BASE_URL || "https://conciergeriezenata.com"} defaultLang="fr" />
{tokenRequired && tokenRequired !== provided && (
<div className="max-w-5xl mx-auto px-4 -mt-6">
<div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
Code porte masqué. Ajoutez votre jeton d'accès à l'URL : <code>?token=VOTRE_TOKEN</code>
</div>
</div>
)}
</div>
);
}
