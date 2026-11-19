export default function handler(_req, res) {
  res.status(200).json({
    ok: true,
    telegramConfigured: Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_IDS),
    tomtomConfigured: Boolean(process.env.TOMTOM_API_KEY || process.env.TOMTOM_KEY || process.env.TOMTOM_API),
    mongoConfigured: Boolean(process.env.MONGO_URI || process.env.MONGODB_URI),
  });
}
