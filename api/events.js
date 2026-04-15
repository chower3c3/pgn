// api/events.js
// GET    /api/events         → returns upcoming events (filtered by subscription type)
// POST   /api/events         → admin: create event
// PATCH  /api/events?id=...  → admin: update event
// DELETE /api/events?id=...  → admin: delete event

const { createClient } = require('@supabase/supabase-js');
const { verifyToken } = require('./_middleware/auth');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

function isWinterMonth(dateStr) {
  const month = new Date(dateStr).getMonth() + 1; // 1-12
  return month >= 11 || month <= 3; // Nov, Dec, Jan, Feb, Mar
}

module.exports = async function handler(req, res) {
  const { valid, user, error } = verifyToken(req);
  if (!valid) return res.status(401).json({ error });

  // ── GET ──
  if (req.method === 'GET') {
    const today = new Date().toISOString().split('T')[0];
    const { data: events, error: dbError } = await supabase
      .from('events')
      .select('*')
      .gte('event_date', today)
      .order('event_date', { ascending: true });

    if (dbError) return res.status(500).json({ error: 'Failed to fetch events' });

    // Filter based on subscription type
    // Season Pass cannot see restricted (Nov–Mar) events
    const subscriptionType = user.subscriptionType || 'monthly';
    const isSeasonPass = subscriptionType === 'season_pass';

    const filtered = events.filter(evt => {
      if (!evt.restricted) return true; // Everyone sees non-restricted events
      if (isSeasonPass) return false;   // Season Pass excluded from restricted (winter)
      return true;                       // Monthly and Annual see all
    });

    return res.status(200).json({ events: filtered });
  }

  // ── ADMIN ONLY below ──
  if (!user.isAdmin) return res.status(403).json({ error: 'Admin access required' });

  // ── POST (create) ──
  if (req.method === 'POST') {
    const { title, event_date, event_time, location, description, restricted } = req.body;
    if (!title || !event_date) return res.status(400).json({ error: 'Title and date required' });

    const { data, error: insertError } = await supabase
      .from('events')
      .insert({ title, event_date, event_time, location, description, restricted: !!restricted })
      .select()
      .single();

    if (insertError) return res.status(500).json({ error: 'Failed to create event' });
    return res.status(201).json({ event: data });
  }

  // ── PATCH (update) ──
  if (req.method === 'PATCH') {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'Event ID required' });

    const { title, event_date, event_time, location, description, restricted } = req.body;

    const { data, error: updateError } = await supabase
      .from('events')
      .update({ title, event_date, event_time, location, description, restricted: !!restricted, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (updateError) return res.status(500).json({ error: 'Failed to update event' });
    return res.status(200).json({ event: data });
  }

  // ── DELETE ──
  if (req.method === 'DELETE') {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'Event ID required' });

    const { error: deleteError } = await supabase.from('events').delete().eq('id', id);
    if (deleteError) return res.status(500).json({ error: 'Failed to delete event' });
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
