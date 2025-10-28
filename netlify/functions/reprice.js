/const { createClient } = require('@supabase/supabase-js');
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE;

exports.handler = async (event) => {
  try {
    if (!url || !key)
      return { statusCode: 500, body: 'Missing env' };

    const sb = createClient(url, key);
    const qs = event.queryStringParameters || {};
    const property_id = qs.property_id;
    const days = parseInt(qs.days || '90');
    if (!property_id)
      return { statusCode: 400, body: 'property_id required' };

    // 1️⃣ Load property data
    const { data: props, error: errProp } = await sb
      .from('properties')
      .select('*')
      .eq('id', property_id)
      .maybeSingle();
    if (errProp || !props) throw errProp || new Error('Property not found');

    const base = Number(props.base_rate || 0);
    const min = Number(props.min_rate || base * 0.8);
    const max = Number(props.max_rate || base * 1.4);
    const weekday = props.weekday_multipliers || {};

    // 2️⃣ Load modifiers
    const { data: occ } = await sb
      .from('occupancy_stats')
      .select('occupancy_pct')
      .eq('property_id', property_id)
      .order('as_of', { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: seasons } = await sb
      .from('seasons')
      .select('start_date,end_date,multiplier')
      .eq('property_id', property_id);

    const { data: events } = await sb
      .from('calendar_events')
      .select('date,multiplier')
      .eq('city', props.city || '')
      .gte('date', new Date().toISOString().slice(0, 10));

    // 3️⃣ Prepare the price list
    const start = new Date();
    const rows = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      const stay_date = d.toISOString().slice(0, 10);
      const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()];

      let mult = Number(weekday[wd] || 1);

      // Season
      if (seasons && seasons.length) {
        for (const s of seasons) {
          if (stay_date >= s.start_date && stay_date <= s.end_date) {
            mult *= Number(s.multiplier || 1);
          }
        }
      }

      // Event
      if (events && events.length) {
        for (const ev of events) {
          if (ev.date === stay_date) mult *= Number(ev.multiplier || 1);
        }
      }

      // Occupancy factor
      const occFactor = occ ? (1 + ((occ.occupancy_pct - 50) / 100) * 0.2) : 1;
      mult *= occFactor;

      // Compute price and clamp between min/max
      let price = Math.round(base * mult);
      if (price < min) price = min;
      if (price > max) price = max;

      rows.push({ property_id, stay_date, price });
    }

    // 4️⃣ Upsert into nightly_prices
    const { error: errUp } = await sb
      .from('nightly_prices')
      .upsert(rows, { onConflict: 'property_id,stay_date' });
    if (errUp) throw errUp;

    return { statusCode: 200, body: JSON.stringify({ ok: true, updated: rows.length }) };
  } catch (e) {
    return { statusCode: 500, body: `reprice error: ${e.message || e}` };
  }
};

