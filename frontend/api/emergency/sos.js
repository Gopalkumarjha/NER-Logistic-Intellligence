export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const ids = (process.env.TELEGRAM_CHAT_IDS || '').split(',').map((id) => id.trim()).filter(Boolean);
  if (!token || !ids.length) return res.status(503).json({ error: 'Telegram bot is not configured.' });
  const { latitude, longitude, timestamp } = req.body || {};
  if (!Number.isFinite(Number(latitude)) || !Number.isFinite(Number(longitude))) return res.status(400).json({ error: 'A valid SOS location is required.' });
  const maps = `https://maps.google.com/?q=${encodeURIComponent(`${latitude},${longitude}`)}`;
  const message = `🚨 NER SmartRoute Emergency Alert\nI may need immediate assistance.\n📍 Location: ${maps}\n🕒 Time: ${timestamp || new Date().toISOString()}`;
  const results = await Promise.all(ids.map(async (chat_id) => {
    try {
      const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id, text: message }), signal: AbortSignal.timeout(8000) });
      const body = await response.json(); return Boolean(response.ok && body.ok);
    } catch { return false; }
  }));
  if (!results.some(Boolean)) return res.status(502).json({ error: 'Telegram did not accept the SOS message. Check the bot token, chat ID, and that each recipient started the bot.' });
  return res.status(200).json({ success: true, delivered: results.filter(Boolean).length });
}
