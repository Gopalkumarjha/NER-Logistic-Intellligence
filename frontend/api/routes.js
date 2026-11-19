export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const fromLat = Number(req.query?.fromLat), fromLon = Number(req.query?.fromLon);
  const toLat = Number(req.query?.toLat), toLon = Number(req.query?.toLon);
  if (![fromLat, fromLon, toLat, toLon].every(Number.isFinite)) return res.status(400).json({ error: 'Valid origin and destination coordinates are required.' });
  const requestedMode = String(req.query?.travelMode || 'car').toLowerCase();
  const travelMode = ({ car: 'car', bike: 'bicycle', foot: 'pedestrian' })[requestedMode];
  if (!travelMode) return res.status(400).json({ error: 'Choose car, bike, or foot for road routing.' });

  const key = process.env.TOMTOM_API_KEY || process.env.TOMTOM_KEY || process.env.TOMTOM_API;
  if (!key) return res.status(503).json({ error: 'TomTom routing is not configured.' });

  try {
    const locations = `${fromLat},${fromLon}:${toLat},${toLon}`;
    const url = new URL(`https://api.tomtom.com/routing/1/calculateRoute/${locations}/json`);
    url.searchParams.set('key', key);
    if (travelMode === 'car') url.searchParams.set('maxAlternatives', '2');
    url.searchParams.set('routeType', 'fastest');
    url.searchParams.set('traffic', travelMode === 'car' ? 'true' : 'false');
    url.searchParams.set('travelMode', travelMode);
    url.searchParams.set('routeRepresentation', 'polyline');
    const response = await fetch(url, { signal: AbortSignal.timeout(12000) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error('TomTom routing failed:', response.status, data?.error?.description || data?.detailedError?.message || 'upstream error');
      return res.status(response.status === 401 || response.status === 403 ? 502 : 503).json({ error: 'TomTom route service is unavailable for this key or request.' });
    }
    const routes = (data.routes || []).map((route) => {
      const points = (route.legs || []).flatMap((leg) => leg.points || []);
      const summary = route.summary || {};
      return {
        coordinates: points.map((point) => [point.latitude, point.longitude]),
        distanceKm: (summary.lengthInMeters / 1000).toFixed(1),
        durationMin: Math.round(summary.travelTimeInSeconds / 60),
        trafficDelayMin: travelMode === 'car' ? Math.round((summary.trafficDelayInSeconds || 0) / 60) : 0,
        source: `TomTom ${requestedMode === 'bike' ? 'bicycle' : requestedMode} routing`,
      };
    }).filter((route) => route.coordinates.length > 1);
    if (!routes.length) return res.status(502).json({ error: 'TomTom returned no usable routes.' });
    return res.status(200).json({ routes, source: 'TomTom Routing' });
  } catch (error) {
    console.error('TomTom routing request failed:', error.message);
    return res.status(503).json({ error: 'TomTom route service could not be reached.' });
  }
}
