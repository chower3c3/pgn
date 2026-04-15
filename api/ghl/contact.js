// api/ghl/contact.js
// GET  /api/ghl/contact         → returns logged-in user's contact data from GHL
// PATCH /api/ghl/contact        → updates editable fields in GHL

const { verifyToken } = require('../_middleware/auth');

const GHL_BASE = 'https://rest.gohighlevel.com/v1';

const EDITABLE_FIELDS = [
  'phone',
  'email',
  'jobTitle',
  'company',
  'golf_handicap_score_range',
  'industry',
  'if_other_please_specify_your_industry',
  'current_business_focus',
  'if_other_please_specify_your_business_focus',
  'what_type_of_connection_would_be_most_valuable_to_you_right_now',
  'are_there_any_specific_industries_or_roles_youd_love_to_be_paired_with',
  'what_is_your_biggest_current_business_challenge_and_which_industry_or_professional_role_would_you_most_like_to_connect_with_for_advice_brainstorming',
  'are_there_any_specific_pgn_members_you_would_like_to_reconnect_with_or_meet_for_the_first_time',
];

module.exports = async function handler(req, res) {
  const { valid, user, error } = verifyToken(req);
  if (!valid) return res.status(401).json({ error });

  const contactId = user.contactId;
  if (!contactId) return res.status(400).json({ error: 'No contact ID in token' });

  const headers = {
    Authorization: `Bearer ${process.env.GHL_API_KEY}`,
    'Content-Type': 'application/json',
    'Version': '2021-07-28',
  };

  // ── GET ──
  if (req.method === 'GET') {
    const r = await fetch(`${GHL_BASE}/contacts/${contactId}`, { headers });
    if (!r.ok) return res.status(r.status).json({ error: 'Failed to fetch contact from GHL' });
    const data = await r.json();
    const c = data.contact || data;

    // Map GHL fields to our schema
    const contact = {
      firstName: c.firstName,
      lastName: c.lastName,
      phone: c.phone,
      email: c.email,
      jobTitle: c.jobTitle || c.customField?.job_title,
      company: c.companyName || c.company,
      // Custom fields — GHL returns them in customField object keyed by field key
      golf_handicap_score_range: c.customField?.golf_handicap_score_range || '',
      industry: c.customField?.industry || '',
      if_other_please_specify_your_industry: c.customField?.if_other_please_specify_your_industry || '',
      current_business_focus: c.customField?.current_business_focus || '',
      if_other_please_specify_your_business_focus: c.customField?.if_other_please_specify_your_business_focus || '',
      what_type_of_connection_would_be_most_valuable_to_you_right_now: c.customField?.what_type_of_connection_would_be_most_valuable_to_you_right_now || '',
      are_there_any_specific_industries_or_roles_youd_love_to_be_paired_with: c.customField?.are_there_any_specific_industries_or_roles_youd_love_to_be_paired_with || '',
      what_is_your_biggest_current_business_challenge_and_which_industry_or_professional_role_would_you_most_like_to_connect_with_for_advice_brainstorming: c.customField?.what_is_your_biggest_current_business_challenge_and_which_industry_or_professional_role_would_you_most_like_to_connect_with_for_advice_brainstorming || '',
      are_there_any_specific_pgn_members_you_would_like_to_reconnect_with_or_meet_for_the_first_time: c.customField?.are_there_any_specific_pgn_members_you_would_like_to_reconnect_with_or_meet_for_the_first_time || '',
    };

    return res.status(200).json({ contact });
  }

  // ── PATCH ──
  if (req.method === 'PATCH') {
    const updates = req.body;

    // Whitelist — only allow editable fields
    const filtered = {};
    const customFields = {};

    for (const key of Object.keys(updates)) {
      if (!EDITABLE_FIELDS.includes(key)) continue;

      // Standard GHL contact fields
      if (['phone', 'email', 'jobTitle', 'company'].includes(key)) {
        if (key === 'company') filtered.companyName = updates[key];
        else filtered[key] = updates[key];
      } else {
        // Custom fields
        customFields[key] = updates[key];
      }
    }

    const payload = { ...filtered };
    if (Object.keys(customFields).length) {
      payload.customField = customFields;
    }

    const r = await fetch(`${GHL_BASE}/contacts/${contactId}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(payload),
    });

    if (!r.ok) {
      const errData = await r.json().catch(() => ({}));
      return res.status(r.status).json({ error: 'Failed to update contact in GHL', details: errData });
    }

    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
