import { useEffect, useMemo, useState } from "react";
import { requireSupabase } from "@/lib/supabaseClient";
import { saveAs } from "file-saver";

type Row = {
  property_id: string;
  name: string | null;
  slug: string | null;
  day: string;        // ISO date
  rate: number;
  source: string | null;
  blocked: boolean | null;
};

export default function PricingViewer() {
  const sb = requireSupabase();

  const today = new Date();
  const toISO = (d: Date) => d.toISOString().slice(0,10);
  const addDays = (d: Date, n: number) => {
    const x = new Date(d); x.setDate(x.getDate() + n); return x;
  };

  const [from, setFrom] = useState(toISO(today));
  const [to, setTo] = useState(toISO(addDays(today, 14)));
  const [weekendDays, setWeekendDays] = useState<number[]>([6,7]); // ISO: 6=Sat,7=Sun
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true); setError(null);
    try {
      const { data, error } = await sb.rpc("pricing_calendar_all", {
        p_from: from,
        p_to: to,
        p_weekend_iso_days: weekendDays
      });
      if (error) throw error;
      setRows(data || []);
    } catch (e: any) {
      setError(e.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); /* auto on mount */ }, []);

  const byProperty = useMemo(() => {
    const map = new Map<string, { name: string; slug?: string | null; items: Row[]; total: number; nights: number; }>();
    for (const r of rows) {
      const key = r.property_id;
      if (!map.has(key)) {
        map.set(key, { name: r.name || "Sans nom", slug: r.slug, items: [], total: 0, nights: 0 });
      }
      const bucket = map.get(key)!;
      bucket.items.push(r);
      if (!r.blocked) {
        bucket.total += Number(r.rate || 0);
        bucket.nights += 1;
      }
    }
    // tri par nom
    return Array.from(map.entries())
      .map(([id, v]) => ({ id, ...v, items: v.items.sort((a,b)=>a.day.localeCompare(b.day)) }))
      .sort((a,b)=>a.name.localeCompare(b.name));
  }, [rows]);

  function exportCSV() {
    // simple CSV (séparateur “;”)
    const header = ["property_id","name","slug","day","rate","source","blocked"];
    const lines = [header.join(";")];
    for (const r of rows) {
      lines.push([
        r.property_id,
        (r.name || "").replaceAll(";"," "),
        (r.slug || "").replaceAll(";"," "),
        r.day,
        String(r.rate ?? ""),
        (r.source || ""),
        String(Boolean(r.blocked))
      ].join(";"));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    saveAs(blob, `pricing_${from}_to_${to}.csv`);
  }

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Pricing – Vue période</h1>

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-sm opacity-80">Du</label>
          <input type="date" value={from} onChange={e=>setFrom(e.target.value)}
            className="border rounded px-3 py-2 bg-white text-black"/>
        </div>
        <div>
          <label className="block text-sm opacity-80">Au</label>
          <input type="date" value={to} onChange={e=>setTo(e.target.value)}
            className="border rounded px-3 py-2 bg-white text-black"/>
        </div>

        <div>
          <label className="block text-sm opacity-80">Week-end (ISO)</label>
          <select multiple
            value={weekendDays.map(String)}
            onChange={(e)=>{
              const opts = Array.from(e.target.selectedOptions).map(o=>Number(o.value));
              setWeekendDays(opts);
            }}
            className="border rounded px-3 py-2 bg-white text-black min-w-[120px] h-[74px]">
            {[1,2,3,4,5,6,7].map(d=>(
              <option key={d} value={d}>
                {d} {d===6?'(Samedi)':d===7?'(Dimanche)':''}
              </option>
            ))}
          </select>
        </div>

        <button
          onClick={load}
          className="px-4 py-2 rounded bg-black text-white">
          {loading ? "Chargement…" : "Actualiser"}
        </button>

        <button
          onClick={exportCSV}
          className="px-4 py-2 rounded border">
          Export CSV
        </button>
      </div>

      {error && <div className="text-red-600 text-sm">{error}</div>}

      {!loading && byProperty.length === 0 && (
        <div className="opacity-70 text-sm">Aucune donnée.</div>
      )}

      <div className="space-y-8">
        {byProperty.map(p=>(
          <div key={p.id} className="border rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="font-semibold">
                {p.name} {p.slug ? <span className="opacity-60">({p.slug})</span> : null}
              </div>
              <div className="text-sm opacity-80">
                {p.nights} nuits • Total {p.total.toFixed(2)}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 pr-4">Date</th>
                    <th className="text-left py-2 pr-4">Prix</th>
                    <th className="text-left py-2 pr-4">Source</th>
                    <th className="text-left py-2 pr-4">Bloqué</th>
                  </tr>
                </thead>
                <tbody>
                  {p.items.map(r=>(
                    <tr key={p.id + r.day} className="border-b last:border-0">
                      <td className="py-2 pr-4">{r.day}</td>
                      <td className="py-2 pr-4">{r.blocked ? "—" : Number(r.rate).toFixed(2)}</td>
                      <td className="py-2 pr-4">{r.source}</td>
                      <td className="py-2 pr-4">{r.blocked ? "Oui" : "Non"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

          </div>
        ))}
      </div>
    </div>
  );
}
