import express from 'express';
import {
  sendTelegramMessage,
  isTelegramConfigured
} from '../services/telegramProvider.js';

const router = express.Router();

function buildEmergencyMessage(latitude, longitude, timestamp) {
  const mapsLink = `https://www.google.com/maps?q=${latitude},${longitude}`;

  return (
    `🚨 NER-SmartRoute Emergency Alert\n` +
    `I may need immediate assistance.\n` +
    `📍 Location: ${mapsLink}\n` +
    `🕐 Time: ${timestamp}`
  );
}

// GET /api/emergency/status
router.get('/status', (req, res) => {
  res.json({
    telegramConfigured: isTelegramConfigured()
  });
});

// POST /api/emergency/sos
router.post('/sos', async (req, res) => {
  try {
    const { latitude, longitude, timestamp } = req.body;

    const lat = Number(latitude);
    const lon = Number(longitude);

    const validLat =
      Number.isFinite(lat) && lat >= -90 && lat <= 90;

    const validLon =
      Number.isFinite(lon) && lon >= -180 && lon <= 180;

    if (!validLat || !validLon) {
      return res.status(400).json({
        error: 'Valid latitude and longitude are required.'
      });
    }

    if (!isTelegramConfigured()) {
      return res.status(503).json({
        error: 'Telegram is not configured on the server.'
      });
    }

    const ts = timestamp || new Date().toISOString();

    const message = buildEmergencyMessage(lat, lon, ts);

    const result = await sendTelegramMessage(message);

    res.json({
      success: true,
      messageId: result.messageId || null
    });

  } catch (err) {
    console.error('Telegram SOS Error:', err);

    res.status(502).json({
      error: err.message || 'Failed to send SOS message.'
    });
  }
});

export default router;