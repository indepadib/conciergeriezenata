import React from 'react';
import GuideAdminForm from '../editor/GuideAdminForm';


export default function Page() {
return (
<div>
<div className="max-w-6xl mx-auto p-6">
<h1 className="text-2xl font-semibold mb-4">Nouveau Guide</h1>
</div>
<GuideAdminForm />
</div>
);
}
