export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const z = Number(req.query.z), x = Number(req.query.x);
  const y = Number(String(req.query.y || '').replace(/\.png$/i, ''));
  if (![z, x, y].every(Number.isInteger) || z < 0 || z > 19 || x < 0 || y < 0 || x >= 2 ** z || y >= 2 ** z) {
    return res.status(400).json({ error: 'Invalid road map tile coordinates.' });
  }
  const key = process.env.TOMTOM_API_KEY || process.env.TOMTOM_KEY || process.env.TOMTOM_API;
  if (!key) return res.status(503).json({ error: 'TomTom API key is not configured.' });
  const url = new URL(`https://api.tomtom.com/map/1/tile/basic/main/${z}/${x}/${y}.png`);
  url.searchParams.set('key', key); url.searchParams.set('view', 'IN'); url.searchParams.set('language', 'en-US');
  try {
    const upstream = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!upstream.ok) return res.status(upstream.status === 401 ? 502 : upstream.status).json({ error: 'Road map tiles are temporarily unavailable.' });
    const image = Buffer.from(await upstream.arrayBuffer());
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400');
    return res.status(200).send(image);
  } catch {
    return res.status(502).json({ error: 'Road map tiles are temporarily unavailable.' });
  }
}
