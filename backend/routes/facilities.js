
import express from 'express';

const router = express.Router();
const OVERPASS_ENDPOINTS = [
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass-api.de/api/interpreter',
];

function haversineKm(lat1, lon1, lat2, lon2) {
  const radius = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function parseElements(elements, lat, lon, amenity) {
  return elements
    .filter((element) => element.tags?.amenity === amenity)
    .map((element) => {
      const facilityLat = element.type === 'node' ? element.lat : element.center?.lat;
      const facilityLon = element.type === 'node' ? element.lon : element.center?.lon;
      if (facilityLat == null || facilityLon == null) return null;

      return {
        id: `${element.type}-${element.id}`,
        name: element.tags?.name || 'Unnamed facility',
        phone: element.tags?.phone || element.tags?.['contact:phone'] || null,
        lat: facilityLat,
        lon: facilityLon,
        distanceKm: Math.round(haversineKm(lat, lon, facilityLat, facilityLon) * 10) / 10,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, 5);
}

async function queryOverpass(query) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  const requests = OVERPASS_ENDPOINTS.map(async (endpoint) => {
    const url = `${endpoint}?data=${encodeURIComponent(query)}`;
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'NER-Logistics-Intelligence/1.0',
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Overpass returned HTTP ${response.status}`);
    }

    const data = await response.json();
    if (!Array.isArray(data.elements)) {
      throw new Error('Overpass returned an invalid response');
    }
    return data.elements;
  });

  try {
    return await Promise.any(requests);
  } finally {
    clearTimeout(timeout);
    controller.abort();
  }
}

// GET /api/facilities?lat=<lat>&lon=<lon>&radius=8000
router.get('/', async (req, res) => {
  const lat = Number(req.query.lat);
  const lon = Number(req.query.lon);
  const radius = Number(req.query.radius ?? 8000);

  if (
    !Number.isFinite(lat) || lat < -90 || lat > 90 ||
    !Number.isFinite(lon) || lon < -180 || lon > 180 ||
    !Number.isFinite(radius) || radius < 500 || radius > 15000
  ) {
    return res.status(400).json({ error: 'Valid latitude, longitude, and search radius are required.' });
  }

  const query = `
    [out:json][timeout:15];
    (
      node["amenity"="hospital"](around:${radius},${lat},${lon});
      way["amenity"="hospital"](around:${radius},${lat},${lon});
      node["amenity"="police"](around:${radius},${lat},${lon});
      way["amenity"="police"](around:${radius},${lat},${lon});
    );
    out center tags;
  `;

  try {
    const elements = await queryOverpass(query);
    return res.json({
      hospitals: parseElements(elements, lat, lon, 'hospital'),
      police: parseElements(elements, lat, lon, 'police'),
    });
  } catch (error) {
    console.warn('Nearby facilities lookup failed:', error.message);
    return res.status(503).json({
      error: 'Nearby facility data is temporarily unavailable. Please try again shortly.',
    });
  }
});

export default router;
