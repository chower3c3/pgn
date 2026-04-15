// api/ghl/subscription.js
// GET /api/ghl/subscription
// Returns the current user's subscription type and payment method (last 4 digits)

const { verifyToken } = require('../_middleware/auth');

const GHL_BASE = 'https://rest.gohighlevel.com/v1';

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { valid, user, error } = verifyToken(req);
  if (!valid) return res.status(401).json({ error });

  const contactId = user.contactId;
  if (!contactId) return res.status(400).json({ error: 'No contact ID' });

  const headers = {
    Authorization: `Bearer ${process.env.GHL_API_KEY}`,
    'Content-Type': 'application/json',
    'Version': '2021-07-28',
  };

  const subRes = await fetch(
    `${GHL_BASE}/payments/subscriptions?altId=${process.env.GHL_LOCATION_ID}&altType=location&contactId=${contactId}`,
    { headers }
  );
  const subData = await subRes.json();
  const subs = subData.data || subData.subscriptions || subData.list || [];
  const activeSub = subs.find(s => s.status === 'active');

  if (!activeSub) return res.status(404).json({ error: 'No active subscription found' });

  const productName = activeSub.product?.name || activeSub.planName || '';
  const nameLower = productName.toLowerCase();
  let subscriptionType = 'Monthly';
  if (nameLower.includes('annual')) subscriptionType = 'Annual';
  else if (nameLower.includes('season')) subscriptionType = 'Season Pass';

  // Payment method last 4 — available from Stripe data via GHL
  const last4 = activeSub.paymentMethod?.last4 || activeSub.card?.last4 || null;

  return res.status(200).json({
    subscriptionType,
    productName,
    last4,
    status: activeSub.status,
    nextBillingDate: activeSub.nextBillingDate || activeSub.current_period_end || null,
  });
};
