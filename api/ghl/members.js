// api/ghl/members.js
// GET /api/ghl/members
// Returns all active members for the Member Directory
// Checks GHL subscriptions for active status, returns contact details

const { verifyToken } = require('../_middleware/auth');

const GHL_BASE = 'https://services.leadconnectorhq.com';

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { valid, error } = verifyToken(req);
  if (!valid) return res.status(401).json({ error });

  const headers = {
    Authorization: `Bearer ${process.env.GHL_API_KEY}`,
    'Content-Type': 'application/json',
    'Version': '2021-07-28',
  };

  // Fetch all active subscriptions
  let allSubscriptions = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const subRes = await fetch(
      `${GHL_BASE}/payments/subscriptions?altId=${process.env.GHL_LOCATION_ID}&altType=location&limit=100&page=${page}`,
      { headers }
    );
    const rawText = await subRes.text();
    console.log('GHL subscriptions status:', subRes.status);
    console.log('GHL subscriptions response:', rawText);
    const subData = rawText ? JSON.parse(rawText) : {};
    const subs = subData.data || subData.subscriptions || subData.list || [];
    const filtered = subs.filter(s => (s.status === 'active' || s.status === 'trialing') && s.liveMode === true);
    allSubscriptions = [...allSubscriptions, ...filtered];
    hasMore = subs.length === 100;
    page++;
  }

  // Get unique contact IDs from active subscriptions
  const activeContactIds = [...new Set(allSubscriptions.map(s => s.contactId).filter(Boolean))];

  // Fetch contact details for each active member
  const memberPromises = activeContactIds.map(async (contactId) => {
    try {
      const r = await fetch(`${GHL_BASE}/contacts/${contactId}`, { headers });
      if (!r.ok) return null;
      const data = await r.json();
      const c = data.contact || data;

      // Skip admin email
      if (c.email?.toLowerCase() === process.env.ADMIN_EMAIL?.toLowerCase()) return null;

      // GHL v2 returns custom fields as an array: [{id, value, fieldKey}]
      const customFields = c.customFields || c.customField || [];

      const customFields = c.customFields || c.customField || [];
      const getCustomField = (id) => {
        const field = Array.isArray(customFields) ? customFields.find(f => f.id === id) : null;
        return field?.value || '';
      };

      return {
        id: contactId,
        firstName: c.firstName || firstName,
        lastName: c.lastName || lastName,
        phone: c.phone || sub.contactPhone || '',
        email: c.email || sub.contactEmail || '',
        jobTitle: getCustomField('fHdccyRA0BZvyw98iNYq'),
        company: getCustomField('pEyjPQ34MBI1ERIwDTq6'),
      };
      
    } catch {
      return null;
    }
  });

  const members = (await Promise.all(memberPromises)).filter(Boolean);

  // Sort alphabetically by last name
  members.sort((a, b) => a.lastName.localeCompare(b.lastName));

  return res.status(200).json({ members });
};
