export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const lat = Number(req.query.lat), lon = Number(req.query.lon);
  const key = process.env.TOMTOM_API_KEY || process.env.TOMTOM_KEY || process.env.TOMTOM_API;
  if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lon) || lon < -180 || lon > 180) return res.status(400).json({ available: false, error: 'Valid lat and lon are required.' });
  if (!key) return res.status(503).json({ available: false, error: 'TomTom API key is not configured.' });
  try {
    const url = new URL(`https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/10/json`);
    url.searchParams.set('point', `${lat},${lon}`); url.searchParams.set('key', key);
    const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) return res.status(response.status === 401 ? 502 : response.status).json({ available: false, error: response.status === 401 ? 'TomTom rejected the API key.' : `TomTom returned ${response.status}.` });
    const data = await response.json(), flow = data.flowSegmentData;
    if (!flow) return res.status(200).json({ available: false });
    return res.status(200).json({ available: true, currentSpeed: flow.currentSpeed, freeFlowSpeed: flow.freeFlowSpeed, confidence: flow.confidence, roadClosure: flow.roadClosure });
  } catch (error) { return res.status(502).json({ available: false, error: 'TomTom traffic service is unavailable.' }); }
}
