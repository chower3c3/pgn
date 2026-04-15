// api/auth/provision-member.js
// POST /api/auth/provision-member
// Called by a GHL Workflow when a new subscription becomes Active
// GHL Workflow: Trigger = Subscription Active → Action = Inbound Webhook → this URL
// Body sent from GHL: { contactId, email, firstName, lastName }

const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Optional: Verify a shared secret from GHL to prevent abuse
  const secret = req.headers['x-pgn-secret'];
  if (process.env.GHL_WEBHOOK_SECRET && secret !== process.env.GHL_WEBHOOK_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { contactId, email, firstName, lastName } = req.body;
  if (!contactId || !email) return res.status(400).json({ error: 'contactId and email required' });

  const normalizedEmail = email.toLowerCase().trim();

  // Check if user already exists (e.g. reactivation)
  const { data: existing } = await supabase
    .from('users')
    .select('id, password_hash')
    .eq('email', normalizedEmail)
    .single();

  if (existing?.password_hash) {
    // Member already has a password — just ensure contactId is current
    await supabase
      .from('users')
      .update({ ghl_contact_id: contactId })
      .eq('email', normalizedEmail);
    return res.status(200).json({ success: true, message: 'Existing member updated' });
  }

  // Generate setup token
  const setupToken = crypto.randomBytes(32).toString('hex');
  const setupExpiry = new Date(Date.now() + 1000 * 60 * 60 * 48); // 48 hours

  if (existing) {
    // Update existing record (re-activation without password)
    await supabase
      .from('users')
      .update({
        ghl_contact_id: contactId,
        setup_token: setupToken,
        setup_token_expiry: setupExpiry.toISOString(),
      })
      .eq('email', normalizedEmail);
  } else {
    // Create new user record
    const { error } = await supabase.from('users').insert({
      email: normalizedEmail,
      ghl_contact_id: contactId,
      setup_token: setupToken,
      setup_token_expiry: setupExpiry.toISOString(),
    });
    if (error) return res.status(500).json({ error: 'Failed to create user record' });
  }

  const setupUrl = `https://pittsburghgolfnetwork.com/members?setup=${setupToken}`;

  // Trigger GHL workflow to send the welcome/setup email
  // GHL: Create a workflow with Inbound Webhook trigger → Email action
  // Email template should include {{custom_values.setup_url}} or similar
  if (process.env.GHL_WELCOME_WEBHOOK_URL) {
    await fetch(process.env.GHL_WELCOME_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: normalizedEmail,
        firstName,
        lastName,
        setupUrl,
        contactId,
      }),
    });
  }

  return res.status(200).json({ success: true, message: 'Member provisioned', setupUrl });
};
