import React from 'react';
import GuideAdminForm from '../../editor/GuideAdminForm';


async function loadGuide(slug: string) {
try {
const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || ''}/guides/${slug}.json`, { cache: 'no-store' });
if (!res.ok) return null;
return await res.json();
} catch { return null; }
}


export default async function Page({ params }: { params: { slug: string } }) {
const initial = await loadGuide(params.slug);
return (
<div>
<div className="max-w-6xl mx-auto p-6">
<h1 className="text-2xl font-semibold mb-4">Éditer « {params.slug} »</h1>
</div>
<GuideAdminForm initial={initial || undefined} />
</div>
);
}
