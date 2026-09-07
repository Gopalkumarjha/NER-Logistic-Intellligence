const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function parseElements(elements, lat, lon) {
  return elements
    .map((el) => {
      const elLat = el.type === 'node' ? el.lat : el.center?.lat;
      const elLon = el.type === 'node' ? el.lon : el.center?.lon;
      if (elLat == null || elLon == null) return null;
      const tags = el.tags || {};
      return {
        id: `${el.type}-${el.id}`,
        name: tags.name || 'Unnamed facility',
        phone: tags.phone || tags['contact:phone'] || null,
        lat: elLat,
        lon: elLon,
        distanceKm: Math.round(haversineKm(lat, lon, elLat, elLon) * 10) / 10,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.distanceKm - b.distanceKm);
}

// Fetch nearest hospitals + police stations around a point using Overpass (free, no API key)
export async function fetchNearbyFacilities(lat, lon, radiusMeters = 8000) {
  const query = `
    [out:json][timeout:25];
    (
      node["amenity"="hospital"](around:${radiusMeters},${lat},${lon});
      way["amenity"="hospital"](around:${radiusMeters},${lat},${lon});
      node["amenity"="police"](around:${radiusMeters},${lat},${lon});
      way["amenity"="police"](around:${radiusMeters},${lat},${lon});
    );
    out center tags;
  `;

  let res;
  try {
    res = await fetch(OVERPASS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: query,
    });
  } catch (e) {
    throw new Error('Network error while searching nearby facilities.');
  }
  if (!res.ok) {
    throw new Error(`Facility search failed (${res.status}). Overpass servers may be busy — try again.`);
  }

  const data = await res.json();
  const elements = data.elements || [];

  const hospitalEls = elements.filter((el) => el.tags?.amenity === 'hospital');
  const policeEls = elements.filter((el) => el.tags?.amenity === 'police');

  return {
    hospitals: parseElements(hospitalEls, lat, lon).slice(0, 5),
    police: parseElements(policeEls, lat, lon).slice(0, 5),
  };
}
