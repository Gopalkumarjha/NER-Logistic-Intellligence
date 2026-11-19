
const ENDPOINTS = ['https://overpass.private.coffee/api/interpreter', 'https://overpass-api.de/api/interpreter'];

function distanceKm(lat1, lon1, lat2, lon2) {
  const r = 6371, rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad, dLon = (lon2 - lon1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * r * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const lat = Number(req.query.lat), lon = Number(req.query.lon), radius = Number(req.query.radius || 8000);
  if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lon) || lon < -180 || lon > 180 || !Number.isFinite(radius) || radius < 500 || radius > 15000) {
    return res.status(400).json({ error: 'Valid latitude, longitude, and search radius are required.' });
  }
  const query = `[out:json][timeout:15];(node["amenity"="hospital"](around:${radius},${lat},${lon});way["amenity"="hospital"](around:${radius},${lat},${lon});node["amenity"="police"](around:${radius},${lat},${lon});way["amenity"="police"](around:${radius},${lat},${lon}););out center tags;`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const results = await Promise.any(ENDPOINTS.map(async (endpoint) => {
      const response = await fetch(`${endpoint}?data=${encodeURIComponent(query)}`, { headers: { Accept: 'application/json' }, signal: controller.signal });
      if (!response.ok) throw new Error(`Overpass HTTP ${response.status}`);
      const data = await response.json();
      if (!Array.isArray(data.elements)) throw new Error('Invalid Overpass response');
      return data.elements;
    }));
    const facilities = (amenity) => results.filter((e) => e.tags?.amenity === amenity).map((e) => {
      const fLat = e.type === 'node' ? e.lat : e.center?.lat, fLon = e.type === 'node' ? e.lon : e.center?.lon;
      if (fLat == null || fLon == null) return null;
      return { id: `${e.type}-${e.id}`, name: e.tags.name || 'Unnamed facility', phone: e.tags.phone || e.tags['contact:phone'] || null, lat: fLat, lon: fLon, distanceKm: Math.round(distanceKm(lat, lon, fLat, fLon) * 10) / 10 };
    }).filter(Boolean).sort((a, b) => a.distanceKm - b.distanceKm).slice(0, 5);
    return res.status(200).json({ hospitals: facilities('hospital'), police: facilities('police') });
  } catch (error) {
    console.warn('Nearby facilities lookup failed:', error.message);
    return res.status(503).json({ error: 'Nearby facility data is temporarily unavailable. Please try again shortly.' });
  } finally { clearTimeout(timer); controller.abort(); }
}
