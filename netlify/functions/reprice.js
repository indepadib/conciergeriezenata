// netlify/functions/reprice.js
const { createClient } = require('@supabase/supabase-js');

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE;

exports.handler = async (event) => {
  try {
    if (!url || !key) {
      return { statusCode: 500, body: 'Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE' };
    }
    const sb = createClient(url, key);

    // Params
    const qs = event.queryStringParameters || {};
    const propertyId = qs.property_id || null;
    const days = Math.max(1, Math.min(parseInt(qs.days || '365', 10), 540));
    const start = new Date(qs.start || new Date().toISOString().slice(0,10));
    const startDate = new Date(start.getFullYear(), start.getMonth(), start.getDate()); // normalisé

    let props;

    if (slug) {
      const { data, error } = await sb.from('properties').select('*').eq('slug', slug).limit(1).maybeSingle();
      if (error) throw error;
      props = data ? [data] : [];
    } else if (propertyId) {
      const { data, error } = await sb.from('properties').select('*').eq('id', propertyId);
      if (error) throw error;
      props = data || [];
    } else {
      const { data, error } = await sb.from('properties').select('*');
      if (error) throw error;
      props = data || [];
    }
    // Load properties
    let { data: props, error: propsErr } = propertyId
      ? await sb.from('properties').select('*').eq('id', propertyId)
      : await sb.from('properties').select('*');
    if (propsErr) throw propsErr;
    if (!props || props.length === 0) {
      return { statusCode: 200, body: JSON.stringify({ ok: true, updated: 0 }) };
    }

    // Helper weekday from date
    const weekdayKey = (d) => ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getDay()];

    // Iterate properties
    let totalUpserts = 0;

    for (const p of props) {
      // Pull seasons for property (only ranges overlapping window)
      const endDate = new Date(startDate); endDate.setDate(endDate.getDate() + days);
      const { data: seasons, error: sErr } = await sb
        .from('seasons')
        .select('*')
        .eq('property_id', p.id)
        .lte('start_date', endDate.toISOString().slice(0,10))
        .gte('end_date', startDate.toISOString().slice(0,10));
      if (sErr) throw sErr;

      // Pull events per city for the whole window
      const { data: events, error: eErr } = await sb
        .from('calendar_events')
        .select('*')
        .eq('city', p.city || '')
        .gte('date', startDate.toISOString().slice(0,10))
        .lte('date', endDate.toISOString().slice(0,10));
      if (eErr) throw eErr;

      // Occupancy (take latest row)
      const { data: occ, error: oErr } = await sb
        .from('occupancy_stats')
        .select('*')
        .eq('property_id', p.id)
        .order('as_of', { ascending: false })
        .limit(1);
      if (oErr) throw oErr;
      const occPct = occ?.[0]?.occupancy_pct ?? null;

      // Helpers multipliers
      const weekdayMult = (p.weekday_multipliers || {});
      const seasonsMultFor = (iso) => {
        if (!seasons || seasons.length === 0) return 1;
        const d = iso;
        for (const s of seasons) {
          if (d >= s.start_date && d <= s.end_date) return Number(s.multiplier || 1) || 1;
        }
        return 1;
      };
      const eventMultFor = (iso) => {
        if (!events || events.length === 0) return 1;
        for (const ev of events) {
          if (ev.date === iso) return Number(ev.multiplier || 1) || 1;
        }
        return 1;
      };
      const leadTimeMultFor = (daysOut) => {
        if (daysOut < 7) return 1.15;
        if (daysOut < 21) return 1.05;
        if (daysOut > 60) return 0.90;
        return 1.00;
      };
      const occupancyMult = (() => {
        if (occPct == null) return 1.0;
        const n = Number(occPct);
        if (n < 40) return 0.90;
        if (n > 90) return 1.10;
        return 1.00;
      })();

      // Build rows to upsert
      const rows = [];
      for (let i = 0; i < days; i++) {
        const d = new Date(startDate); d.setDate(d.getDate() + i);
        const iso = d.toISOString().slice(0,10);
        const dow = weekdayKey(d);
        const base = Number(p.base_rate);
        const minr = Number(p.min_rate);
        const maxr = Number(p.max_rate);

        const mSeason = seasonsMultFor(iso);
        const mDow = Number(weekdayMult[dow] || 1);
        const daysOut = Math.round((d - new Date()) / 86400000);
        const mLead = leadTimeMultFor(daysOut);
        const mEvent = eventMultFor(iso);

        let price = base * mSeason * mDow * mLead * occupancyMult * mEvent;
        if (minr) price = Math.max(minr, price);
        if (maxr) price = Math.min(maxr, price);
        price = Math.round(price); // arrondir au MAD

        rows.push({ property_id: p.id, stay_date: iso, price });
      }

      // Upsert nightly_prices (ON CONFLICT (property_id, stay_date))
      const { error: upErr } = await sb
        .from('nightly_prices')
        .upsert(rows, { onConflict: 'property_id,stay_date' });
      if (upErr) throw upErr;

      totalUpserts += rows.length;
    }

    return { statusCode: 200, body: JSON.stringify({ ok: true, updated: totalUpserts }) };
  } catch (e) {
    return { statusCode: 500, body: `reprice error: ${e.message || e}` };
  }
};
