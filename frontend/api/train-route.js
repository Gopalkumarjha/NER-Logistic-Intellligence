const TRANSITOUS_URL = 'https://api.transitous.org/api/v6/plan';

function decodePolyline(encoded, precision = 6) {
  if (!encoded) return [];
  const points = [];
  let index = 0, lat = 0, lon = 0;
  const factor = 10 ** precision;
  const read = () => {
    let value = 0, shift = 0, byte;
    do {
      if (index >= encoded.length) return null;
      byte = encoded.charCodeAt(index++) - 63;
      value |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    return (value & 1) ? ~(value >> 1) : (value >> 1);
  };
  while (index < encoded.length) {
    const latDelta = read();
    const lonDelta = read();
    if (latDelta === null || lonDelta === null) break;
    lat += latDelta;
    lon += lonDelta;
    points.push([lat / factor, lon / factor]);
  }
  return points;
}

function distanceKm(points) {
  const radians = (degrees) => degrees * Math.PI / 180;
  let meters = 0;
  for (let i = 1; i < points.length; i++) {
    const [lat1, lon1] = points[i - 1];
    const [lat2, lon2] = points[i];
    const dLat = radians(lat2 - lat1), dLon = radians(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(dLon / 2) ** 2;
    meters += 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
  return meters / 1000;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const fromLat = Number(req.query?.fromLat), fromLon = Number(req.query?.fromLon);
  const toLat = Number(req.query?.toLat), toLon = Number(req.query?.toLon);
  if (![fromLat, fromLon, toLat, toLon].every(Number.isFinite)) {
    return res.status(400).json({ error: 'Valid origin and destination coordinates are required.' });
  }

  const url = new URL(TRANSITOUS_URL);
  url.searchParams.set('fromPlace', `${fromLat},${fromLon}`);
  url.searchParams.set('toPlace', `${toLat},${toLon}`);
  url.searchParams.set('transitModes', 'RAIL');
  url.searchParams.set('maxTransfers', '4');
  url.searchParams.set('maxTravelTime', '1440');
  url.searchParams.set('detailedLegs', 'true');
  url.searchParams.set('time', new Date().toISOString());
  url.searchParams.set('timetableView', 'false');

  try {
    const upstream = await fetch(url, {
      headers: { 'User-Agent': 'NER Logistics Intelligence/1.0 (https://ner-logistic-intelligence.vercel.app)' },
      signal: AbortSignal.timeout(15000),
    });
    const data = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      console.warn('Transitous journey lookup failed:', upstream.status);
      return res.status(502).json({ error: 'Train timetable service is temporarily unavailable.' });
    }
    const routes = (data.itineraries || []).slice(0, 3).map((itinerary) => {
      const coordinates = (itinerary.legs || []).flatMap((leg) =>
        decodePolyline(leg.legGeometry?.points, leg.legGeometry?.precision || 6)
      );
      return {
        coordinates,
        distanceKm: distanceKm(coordinates).toFixed(1),
        durationMin: Math.max(1, Math.round((itinerary.duration || 0) / 60)),
        transfers: itinerary.transfers || 0,
        source: 'Transitous rail timetable',
      };
    }).filter((route) => route.coordinates.length > 1);

    if (!routes.length) return res.status(404).json({ error: 'No train timetable data is available for these locations right now.' });
    res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=120');
    return res.status(200).json({ routes, source: 'Transitous' });
  } catch (error) {
    console.warn('Transitous journey lookup failed:', error.message);
    return res.status(503).json({ error: 'Train timetable service could not be reached. Please try again later.' });
  }
}
