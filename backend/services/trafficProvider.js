/**
 * TomTom Traffic Flow API provider. Reads the API key ONLY from process.env — never
 * hardcoded, never exposed to the frontend. Returns real traffic data only; if the
 * key is missing or the upstream API fails for any reason, the caller receives
 * { available: false } — no mock/random/fake traffic values are ever generated here.
 */

const TOMTOM_FLOW_URL = 'https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/10/json';

export function isTrafficConfigured() {
  return !!process.env.TOMTOM_API_KEY;
}

// Fetches real-time traffic flow for a point from TomTom.
// Resolves to { available: false } on any missing config or upstream failure —
// never throws, never fabricates data.
export async function getTrafficData(lat, lon) {
  const apiKey = process.env.TOMTOM_API_KEY;

  if (!apiKey) {
    return { available: false };
  }

  const url = `${TOMTOM_FLOW_URL}?point=${lat},${lon}&key=${apiKey}`;

  let res;
  try {
    res = await fetch(url);
  } catch (e) {
    return { available: false };
  }

  if (!res.ok) {
    return { available: false };
  }

  let data;
  try {
    data = await res.json();
  } catch (e) {
    return { available: false };
  }

  const seg = data && data.flowSegmentData;
  if (!seg) {
    return { available: false };
  }

  return {
    available: true,
    currentSpeed: seg.currentSpeed,
    freeFlowSpeed: seg.freeFlowSpeed,
    currentTravelTime: seg.currentTravelTime,
    freeFlowTravelTime: seg.freeFlowTravelTime,
    confidence: seg.confidence,
    roadClosure: !!seg.roadClosure,
  };
}
