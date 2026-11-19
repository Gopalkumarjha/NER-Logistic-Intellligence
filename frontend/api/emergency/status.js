export default function handler(_req, res) {
  const configured = Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_IDS);
  res.status(200).json({ telegramConfigured: configured, smsConfigured: configured });
}
