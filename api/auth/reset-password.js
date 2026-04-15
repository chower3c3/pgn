// api/auth/reset-password.js
// POST /api/auth/reset-password
// Body: { token, password }

const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { token, password } = req.body;
  if (!token || !password) return res.status(400).json({ error: 'Token and password required' });
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

  const { data: user, error } = await supabase
    .from('users')
    .select('*')
    .eq('reset_token', token)
    .single();

  if (error || !user) return res.status(400).json({ error: 'Invalid or expired reset link.' });

  if (user.reset_token_expiry && new Date(user.reset_token_expiry) < new Date()) {
    return res.status(400).json({ error: 'This reset link has expired. Please request a new one.' });
  }

  const hash = await bcrypt.hash(password, 12);

  await supabase
    .from('users')
    .update({ password_hash: hash, reset_token: null, reset_token_expiry: null })
    .eq('id', user.id);

  return res.status(200).json({ success: true, message: 'Password reset successfully. You can now log in.' });
};
