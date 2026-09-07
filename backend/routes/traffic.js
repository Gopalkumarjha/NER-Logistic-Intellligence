import express from 'express';
import { getTrafficData } from '../services/trafficProvider.js';

const router = express.Router();

// GET /api/traffic?lat=<lat>&lon=<lon>
// Returns real TomTom traffic flow data only. Never returns mock/random data —
// responds { available: false } if the API key is missing or the upstream call fails.
router.get('/', async (req, res) => {
  const { lat, lon } = req.query;

  if (lat === undefined || lon === undefined || isNaN(lat) || isNaN(lon)) {
    return res.status(400).json({ error: 'Valid lat and lon query parameters are required.' });
  }

  const data = await getTrafficData(parseFloat(lat), parseFloat(lon));
  res.json(data);
});

export default router;
