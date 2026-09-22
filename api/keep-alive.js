export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;

  try {
    const response = await fetch(`${url}/rest/v1/keep_alive?select=id&limit=1`, {
      headers: { apikey: key },
    });
    const data = await response.json();

    if (!response.ok) {
      console.error("Keep-alive query failed:", data);
      return res.status(500).json({ ok: false, data });
    }

    return res.status(200).json({ ok: true, data, at: new Date().toISOString() });
  } catch (err) {
    console.error("Keep-alive error:", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
