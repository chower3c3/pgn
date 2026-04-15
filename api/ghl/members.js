// api/ghl/members.js
// GET /api/ghl/members
// Returns all active members for the Member Directory
// Checks GHL subscriptions for active status, returns contact details

const { verifyToken } = require('../_middleware/auth');

const GHL_BASE = 'https://rest.gohighlevel.com/v1';

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { valid, error } = verifyToken(req);
  if (!valid) return res.status(401).json({ error });

  const headers = {
    Authorization: `Bearer ${process.env.GHL_API_KEY}`,
    'Content-Type': 'application/json',
  };

  // Fetch all active subscriptions
  let allSubscriptions = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const subRes = await fetch(
      `${GHL_BASE}/payments/subscriptions?locationId=${process.env.GHL_LOCATION_ID}&status=active&limit=100&page=${page}`,
      { headers }
    );
    const subData = await subRes.json();
    const subs = subData.subscriptions || subData.list || [];
    allSubscriptions = [...allSubscriptions, ...subs];
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

      return {
        id: c.id,
        firstName: c.firstName || '',
        lastName: c.lastName || '',
        phone: c.phone || '',
        email: c.email || '',
        jobTitle: c.jobTitle || c.customField?.job_title || '',
        company: c.companyName || c.company || '',
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
