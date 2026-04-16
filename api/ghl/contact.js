// api/ghl/contact.js
// GET  /api/ghl/contact         → returns logged-in user's contact data from GHL
// PATCH /api/ghl/contact        → updates editable fields in GHL

const { verifyToken } = require('../_middleware/auth');

const GHL_BASE = 'https://services.leadconnectorhq.com';

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
    const getCustomField = (id) => {
      const fields = c.customFields || [];
      const field = Array.isArray(fields) ? fields.find(f => f.id === id) : null;
      return field?.value || '';
    };
    console.log('Contact data keys:', Object.keys(c));
    console.log('Contact customFields:', JSON.stringify(c.customFields));

    // Map GHL fields to our schema
    const contact = {
      firstName: c.firstName,
      lastName: c.lastName,
      phone: c.phone,
      email: c.email,
      jobTitle: getCustomField('fHdccyRA0BZvyw98iNYq'),
      company: getCustomField('pEyjPQ34MBI1ERIwDTq6'),
      golf_handicap_score_range: getCustomField('7X05SdowBrXCOAg23Baq'),
      industry: getCustomField('ReLu70opgG0HY5Hp97wd'),
      if_other_please_specify_your_industry: getCustomField('WK4jmgZXLsR6KcTyxeQl'),
      current_business_focus: getCustomField('Tyjh4Qsr8nRfCawR0znk'),
      if_other_please_specify_your_business_focus: getCustomField('lHJ9mzFVcrnFIa7pKHJc'),
      what_type_of_connection_would_be_most_valuable_to_you_right_now: getCustomField('RZ4OiRdekfTg2Ykd57v8'),
      are_there_any_specific_industries_or_roles_youd_love_to_be_paired_with: getCustomField('Iy7cOl6YdNx3PdtUmEZv'),
      what_is_your_biggest_current_business_challenge_and_which_industry_or_professional_role_would_you_most_like_to_connect_with_for_advice_brainstorming: getCustomField('6PP2OEh4cKrTOKPt8H0e'),
      are_there_any_specific_pgn_members_you_would_like_to_reconnect_with_or_meet_for_the_first_time: getCustomField('0HImqDCm9pTDRg5hRCeq'),
    };

    return res.status(200).json({ contact });
  }

  // ── PATCH ──
  if (req.method === 'PATCH') {
    const updates = req.body;

    // Whitelist — only allow editable fields
    const filtered = {};
        const customFields = {};
    
        const fieldKeyToId = {
          golf_handicap_score_range: '7X05SdowBrXCOAg23Baq',
          industry: 'ReLu70opgG0HY5Hp97wd',
          if_other_please_specify_your_industry: 'WK4jmgZXLsR6KcTyxeQl',
          current_business_focus: 'Tyjh4Qsr8nRfCawR0znk',
          if_other_please_specify_your_business_focus: 'lHJ9mzFVcrnFIa7pKHJc',
          what_type_of_connection_would_be_most_valuable_to_you_right_now: 'RZ4OiRdekfTg2Ykd57v8',
          are_there_any_specific_industries_or_roles_youd_love_to_be_paired_with: 'Iy7cOl6YdNx3PdtUmEZv',
          what_is_your_biggest_current_business_challenge_and_which_industry_or_professional_role_would_you_most_like_to_connect_with_for_advice_brainstorming: '6PP2OEh4cKrTOKPt8H0e',
          are_there_any_specific_pgn_members_you_would_like_to_reconnect_with_or_meet_for_the_first_time: '0HImqDCm9pTDRg5hRCeq',
        };
    
        for (const key of Object.keys(updates)) {
          if (!EDITABLE_FIELDS.includes(key)) continue;
    
          if (key === 'phone') filtered.phone = updates[key];
          else if (key === 'email') filtered.email = updates[key];
          else if (key === 'jobTitle') filtered.job_title = updates[key];
          else if (key === 'company') filtered.companyName = updates[key];
          else {
            const fieldId = fieldKeyToId[key];
            if (fieldId) customFields[fieldId] = updates[key];
          }
        }
    
        const payload = { ...filtered };
        if (Object.keys(customFields).length) {
          payload.customFields = Object.entries(customFields).map(([id, value]) => ({ id, value }));
        }

    const r = await fetch(`${GHL_BASE}/contacts/${contactId}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(payload),
    });

    if (!r.ok) {
      const errText = await r.text().catch(() => '');
      console.log('GHL update error:', errText);
      return res.status(r.status).json({ error: 'Failed to update contact in GHL', details: errText });
    }

    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
