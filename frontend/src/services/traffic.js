// Route-specific traffic integration. Uses the existing backend GET /api/traffic
// endpoint (which wraps TomTom Traffic Flow API) — the TomTom API key never touches
// the frontend, only the backend base URL (VITE_API_URL) is used here, same as
// every other service in this project.
//
// Never generates mock/random traffic data: every point's result is either a real
// value returned by the backend or an explicit "unavailable" marker.

import { sampleRoutePoints } from './routeSampling.js';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

// Fetch real traffic data for a single point via the backend. Never throws —
// resolves to { available: false } on any network/API failure so callers can
// aggregate safely without per-point try/catch.
async function fetchTrafficPoint(lat, lon) {
  try {
    const res = await fetch(`${API_URL}/traffic?lat=${lat}&lon=${lon}`);
    if (!res.ok) {
      return { available: false };
    }
    const data = await res.json();
    return data && typeof data.available === 'boolean' ? data : { available: false };
  } catch (e) {
    return { available: false };
  }
}

/**
 * Samples points along the given OSRM route and fetches real traffic data for each
 * from the backend /api/traffic endpoint, then aggregates the results.
 *
 * @param {Array<[number, number]>} routeCoordinates - OSRM route coordinates ([lat, lon] pairs).
 * @param {number} numPoints - number of points to sample along the route (default 5).
 * @returns {Promise<{
 *   available: boolean,
 *   points: Array<{ lat: number, lon: number, traffic: object|null }>,
 *   sampledCount: number,
 *   successCount: number,
 *   averageCurrentSpeed: number|null,
 *   averageFreeFlowSpeed: number|null,
 *   congestionRatio: number|null   // currentSpeed / freeFlowSpeed averaged across points with data; lower = more congested
 * }>}
 */
export async function getRouteTraffic(routeCoordinates, numPoints = 5) {
  const samples = sampleRoutePoints(routeCoordinates, numPoints);

  if (!samples || samples.length === 0) {
    return {
      available: false,
      points: [],
      sampledCount: 0,
      successCount: 0,
      averageCurrentSpeed: null,
      averageFreeFlowSpeed: null,
      congestionRatio: null,
    };
  }

  const results = await Promise.all(
    samples.map(([lat, lon]) => fetchTrafficPoint(lat, lon))
  );

  const points = results.map((traffic, i) => {
    const [lat, lon] = samples[i];
    return {
      lat,
      lon,
      traffic: traffic && traffic.available ? traffic : null,
    };
  });

  const withData = points.filter((p) => p.traffic !== null);
  const successCount = withData.length;

  if (successCount === 0) {
    return {
      available: false,
      points,
      sampledCount: samples.length,
      successCount: 0,
      averageCurrentSpeed: null,
      averageFreeFlowSpeed: null,
      congestionRatio: null,
    };
  }

  const totalCurrent = withData.reduce((sum, p) => sum + (p.traffic.currentSpeed ?? 0), 0);
  const totalFreeFlow = withData.reduce((sum, p) => sum + (p.traffic.freeFlowSpeed ?? 0), 0);
  const averageCurrentSpeed = totalCurrent / successCount;
  const averageFreeFlowSpeed = totalFreeFlow / successCount;
  const congestionRatio =
    averageFreeFlowSpeed > 0 ? averageCurrentSpeed / averageFreeFlowSpeed : null;

  return {
    available: true,
    points,
    sampledCount: samples.length,
    successCount,
    averageCurrentSpeed,
    averageFreeFlowSpeed,
    congestionRatio,
  };
}
