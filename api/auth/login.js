// api/auth/login.js
// POST /api/auth/login
// Body: { email, password }
// Returns: { token, user: { email, name, subscriptionType, contactId } }

const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function checkGHLActiveStatus(email) {
  // Search contacts by email in GHL
  const contactRes = await fetch(
    `https://rest.gohighlevel.com/v1/contacts/search?email=${encodeURIComponent(email)}`,
    {
      headers: {
        Authorization: `Bearer ${process.env.GHL_API_KEY}`,
        'Content-Type': 'application/json',
      },
    }
  );
  const contactData = await contactRes.json();
  const contacts = contactData.contacts || [];
  if (!contacts.length) return { active: false, contact: null, subscriptionType: null };

  const contact = contacts[0];

  // Check subscriptions for this contact
  const subRes = await fetch(
    `https://rest.gohighlevel.com/v1/payments/subscriptions?locationId=${process.env.GHL_LOCATION_ID}&contactId=${contact.id}`,
    {
      headers: {
        Authorization: `Bearer ${process.env.GHL_API_KEY}`,
        'Content-Type': 'application/json',
      },
    }
  );
  const subData = await subRes.json();
  const subscriptions = subData.subscriptions || subData.list || [];

  const activeSub = subscriptions.find(s => s.status === 'active');
  if (!activeSub) return { active: false, contact, subscriptionType: null };

  // Determine subscription type from product name
  const productName = (activeSub.product?.name || activeSub.planName || '').toLowerCase();
  let subscriptionType = 'monthly';
  if (productName.includes('annual')) subscriptionType = 'annual';
  else if (productName.includes('season')) subscriptionType = 'season_pass';

  return {
    active: true,
    contact,
    subscriptionType,
    subscription: activeSub,
  };
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  const normalizedEmail = email.toLowerCase().trim();

  // Check if admin
  const isAdmin = normalizedEmail === process.env.ADMIN_EMAIL?.toLowerCase();

  // Look up user in Supabase
  const { data: user, error } = await supabase
    .from('users')
    .select('*')
    .eq('email', normalizedEmail)
    .single();

  if (error || !user) return res.status(401).json({ error: 'Invalid email or password' });
  if (!user.password_hash) return res.status(401).json({ error: 'Password not set. Please check your email for setup link.' });

  const passwordMatch = await bcrypt.compare(password, user.password_hash);
  if (!passwordMatch) return res.status(401).json({ error: 'Invalid email or password' });

  // Admin bypasses GHL subscription check
  if (!isAdmin) {
    const { active, contact, subscriptionType, subscription } = await checkGHLActiveStatus(normalizedEmail);
    if (!active) {
      return res.status(403).json({ error: 'Your membership is not currently active. Please contact golf@pittsburghgolfnetwork.com.' });
    }

    // Update last login
    await supabase.from('users').update({ last_login: new Date().toISOString() }).eq('email', normalizedEmail);

    const token = jwt.sign(
      {
        email: normalizedEmail,
        contactId: user.ghl_contact_id,
        subscriptionType,
        isAdmin: false,
        name: `${contact.firstName || ''} ${contact.lastName || ''}`.trim(),
      },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    return res.status(200).json({
      token,
      user: {
        email: normalizedEmail,
        name: `${contact.firstName || ''} ${contact.lastName || ''}`.trim(),
        contactId: user.ghl_contact_id,
        subscriptionType,
        isAdmin: false,
      },
    });
  }

  // Admin login
  await supabase.from('users').update({ last_login: new Date().toISOString() }).eq('email', normalizedEmail);

  const token = jwt.sign(
    { email: normalizedEmail, isAdmin: true, name: 'Admin' },
    process.env.JWT_SECRET,
    { expiresIn: '8h' }
  );

  return res.status(200).json({
    token,
    user: { email: normalizedEmail, name: 'Admin', isAdmin: true },
  });
};
