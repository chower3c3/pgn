// api/announcements.js
// GET    /api/announcements         → all announcements sorted by last_edited_date desc
// POST   /api/announcements         → admin: create
// PATCH  /api/announcements?id=...  → admin: update
// DELETE /api/announcements?id=...  → admin: delete

const { createClient } = require('@supabase/supabase-js');
const { verifyToken } = require('./_middleware/auth');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

module.exports = async function handler(req, res) {
  const { valid, user, error } = verifyToken(req);
  if (!valid) return res.status(401).json({ error });

  // ── GET ──
  if (req.method === 'GET') {
    const { data, error: dbError } = await supabase
      .from('announcements')
      .select('*')
      .order('last_edited_date', { ascending: false });

    if (dbError) return res.status(500).json({ error: 'Failed to fetch announcements' });
    return res.status(200).json({ announcements: data });
  }

  // ── ADMIN ONLY below ──
  if (!user.isAdmin) return res.status(403).json({ error: 'Admin access required' });

  // ── POST (create) ──
  if (req.method === 'POST') {
    const { title, body } = req.body;
    if (!title || !body) return res.status(400).json({ error: 'Title and body required' });

    const now = new Date().toISOString();
    const { data, error: insertError } = await supabase
      .from('announcements')
      .insert({ title, body, posted_date: now, last_edited_date: now })
      .select()
      .single();

    if (insertError) return res.status(500).json({ error: 'Failed to create announcement' });
    return res.status(201).json({ announcement: data });
  }

  // ── PATCH (update) ──
  if (req.method === 'PATCH') {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'Announcement ID required' });

    const { title, body } = req.body;
    const { data, error: updateError } = await supabase
      .from('announcements')
      .update({ title, body, last_edited_date: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (updateError) return res.status(500).json({ error: 'Failed to update announcement' });
    return res.status(200).json({ announcement: data });
  }

  // ── DELETE ──
  if (req.method === 'DELETE') {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'Announcement ID required' });

    const { error: deleteError } = await supabase.from('announcements').delete().eq('id', id);
    if (deleteError) return res.status(500).json({ error: 'Failed to delete announcement' });
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
