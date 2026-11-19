const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

export async function fetchNearbyFacilities(lat, lon, radiusMeters = 8000) {
  const params = new URLSearchParams({ lat: String(lat), lon: String(lon), radius: String(radiusMeters) });
  let response;
  try {
    response = await fetch(`${API_URL}/facilities?${params.toString()}`);
  } catch {
    throw new Error('Could not reach the facility search service. Check your connection and retry.');
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `Facility search failed (${response.status}). Please retry.`);
  }
  return {
    hospitals: Array.isArray(data.hospitals) ? data.hospitals : [],
    police: Array.isArray(data.police) ? data.police : [],
  };
}

