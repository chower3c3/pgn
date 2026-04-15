// api/auth/set-password.js
// POST /api/auth/set-password
// Body: { token, password }
// Called when a new member clicks the setup link in their welcome email

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

  // Find user by setup token
  const { data: user, error } = await supabase
    .from('users')
    .select('*')
    .eq('setup_token', token)
    .single();

  if (error || !user) return res.status(400).json({ error: 'Invalid or expired setup link. Please contact golf@pittsburghgolfnetwork.com.' });

  // Check token expiry (48 hours)
  if (user.setup_token_expiry && new Date(user.setup_token_expiry) < new Date()) {
    return res.status(400).json({ error: 'This setup link has expired. Please contact golf@pittsburghgolfnetwork.com for a new one.' });
  }

  const hash = await bcrypt.hash(password, 12);

  const { error: updateError } = await supabase
    .from('users')
    .update({
      password_hash: hash,
      setup_token: null,
      setup_token_expiry: null,
    })
    .eq('id', user.id);

  if (updateError) return res.status(500).json({ error: 'Failed to set password. Please try again.' });

  return res.status(200).json({ success: true, message: 'Password set successfully. You can now log in.' });
};
