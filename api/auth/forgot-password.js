// api/auth/forgot-password.js
// POST /api/auth/forgot-password
// Body: { email }
// Checks GHL active status, then triggers a reset email via GHL webhook

const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function isActiveMember(email) {
  const res = await fetch(
    `https://rest.gohighlevel.com/v1/contacts/search?email=${encodeURIComponent(email)}`,
    { headers: { Authorization: `Bearer ${process.env.GHL_API_KEY}` } }
  );
  const data = await res.json();
  const contacts = data.contacts || [];
  if (!contacts.length) return false;

  const subRes = await fetch(
    `https://rest.gohighlevel.com/v1/payments/subscriptions?locationId=${process.env.GHL_LOCATION_ID}&contactId=${contacts[0].id}`,
    { headers: { Authorization: `Bearer ${process.env.GHL_API_KEY}` } }
  );
  const subData = await subRes.json();
  const subs = subData.subscriptions || subData.list || [];
  return subs.some(s => s.status === 'active' || s.status === 'trialing');
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email required' });

  const normalizedEmail = email.toLowerCase().trim();

  // Always return success to prevent email enumeration
  const successMsg = { success: true, message: 'If an active account exists for that email, a reset link has been sent.' };

  let { data: user } = await supabase
  .from('users')
  .select('*')
  .eq('email', normalizedEmail)
  .maybeSingle();

  // If user doesn't exist yet but is an active/trialing member, create their record
  if (!user) {
    // Look up their GHL contact ID first
    const contactRes = await fetch(
      `https://services.leadconnectorhq.com/contacts/?locationId=${process.env.GHL_LOCATION_ID}&email=${encodeURIComponent(normalizedEmail)}`,
      { headers: { 
        Authorization: `Bearer ${process.env.GHL_API_KEY}`,
        'Content-Type': 'application/json',
        'Version': '2021-07-28',
      }}
    );
    const contactData = await contactRes.json();
    const contacts = contactData.contacts || [];
    if (!contacts.length) return res.status(200).json(successMsg);
    
    const { error: insertError } = await supabase.from('users').insert({
      email: normalizedEmail,
      ghl_contact_id: contacts[0].id,
    });
    if (insertError) return res.status(200).json(successMsg);
  
    // Re-fetch the newly created user
    const { data: newUser } = await supabase
      .from('users')
      .select('*')
      .eq('email', normalizedEmail)
      .maybeSingle();
    user = newUser;
  }
  
  if (!user) return res.status(200).json(successMsg);
  const active = normalizedEmail === process.env.ADMIN_EMAIL?.toLowerCase()
    ? true
    : await isActiveMember(normalizedEmail);

  if (!active) return res.status(200).json(successMsg);

  const token = crypto.randomBytes(32).toString('hex');
  const expiry = new Date(Date.now() + 1000 * 60 * 60); // 1 hour

  await supabase
    .from('users')
    .update({ reset_token: token, reset_token_expiry: expiry.toISOString() })
    .eq('email', normalizedEmail);

  const resetUrl = `https://pittsburghgolfnetwork.com/members?reset=${token}`;

  // Send via GHL workflow webhook — POST to a GHL inbound webhook you create
  // GHL: Automation > Workflows > New > Inbound Webhook trigger
  // The workflow sends an email to {{contact.email}} with the reset link
  if (process.env.GHL_RESET_WEBHOOK_URL) {
    await fetch(process.env.GHL_RESET_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: normalizedEmail, resetUrl }),
    });
  }

  return res.status(200).json(successMsg);
};
