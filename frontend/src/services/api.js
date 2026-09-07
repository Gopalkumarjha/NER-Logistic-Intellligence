const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const OSRM_URL = 'https://router.project-osrm.org/route/v1/driving';

// Geocode a place name to [lat, lon] using Nominatim
export async function geocodeLocation(query) {
  const url = `${NOMINATIM_URL}?q=${encodeURIComponent(query)}&format=json&limit=1`;
  let res;
  try {
    res = await fetch(url, {
      headers: { 'Accept-Language': 'en' },
    });
  } catch (e) {
    throw new Error('Network error while searching location. Check your internet connection.');
  }
  if (!res.ok) {
    throw new Error(`Location search failed (${res.status}). Try again.`);
  }
  const data = await res.json();
  if (!data || data.length === 0) {
    throw new Error(`Could not find location: "${query}". Try a more specific name.`);
  }
  return {
    lat: parseFloat(data[0].lat),
    lon: parseFloat(data[0].lon),
    displayName: data[0].display_name,
  };
}

// Get driving route(s) between two [lat, lon] points using OSRM.
// Pass { alternatives: true } to request multiple candidate routes (for Phase 5 safer-route comparison).
export async function getRoutes(fromCoords, toCoords, { alternatives = false } = {}) {
  // OSRM expects lon,lat order
  const coordsStr = `${fromCoords[1]},${fromCoords[0]};${toCoords[1]},${toCoords[0]}`;
  const altParam = alternatives ? '&alternatives=true' : '';
  const url = `${OSRM_URL}/${coordsStr}?overview=full&geometries=geojson${altParam}`;

  let res;
  try {
    res = await fetch(url);
  } catch (e) {
    throw new Error('Network error while fetching route. Check your internet connection.');
  }
  if (!res.ok) {
    throw new Error(`Routing service failed (${res.status}). Try again.`);
  }
  const data = await res.json();
  if (!data.routes || data.routes.length === 0) {
    throw new Error('No route found between these locations.');
  }

  return data.routes.map((route) => ({
    coordinates: route.geometry.coordinates.map(([lon, lat]) => [lat, lon]),
    distanceKm: (route.distance / 1000).toFixed(1),
    durationMin: Math.round(route.duration / 60),
  }));
}

// Get a single driving route (used by Phase 2/3 flows)
export async function getRoute(fromCoords, toCoords) {
  const routes = await getRoutes(fromCoords, toCoords, { alternatives: false });
  return routes[0];
}

// Format minutes into human-readable "Xh Ym"
export function formatDuration(mins) {
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h ${m}m`;
}
