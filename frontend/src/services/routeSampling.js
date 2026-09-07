// Samples evenly-distributed coordinate points along an OSRM route polyline.
// Route coordinates are expected as an array of [lat, lon] pairs (the same shape
// returned by services/api.js getRoute()/getRoutes()).
//
// This is a pure geometry helper — it does not fetch anything or touch risk/OSRM
// logic itself. Intended for later use by route-level weather/traffic sampling.

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

function isValidCoord(c) {
  return (
    Array.isArray(c) &&
    c.length === 2 &&
    typeof c[0] === 'number' &&
    typeof c[1] === 'number' &&
    !isNaN(c[0]) &&
    !isNaN(c[1])
  );
}

/**
 * Returns `numPoints` evenly spaced [lat, lon] points along the route, measured by
 * cumulative distance (not just array index), so points are spread evenly in space
 * even if the underlying OSRM geometry has uneven point density.
 *
 * @param {Array<[number, number]>} routeCoordinates - OSRM route coordinates ([lat, lon] pairs).
 * @param {number} numPoints - desired number of sample points (default 5). Always includes
 *   the route's start and end. Values < 2 are treated as 2.
 * @returns {Array<[number, number]>} sampled points, or [] for invalid/empty input.
 */
export function sampleRoutePoints(routeCoordinates, numPoints = 5) {
  if (!Array.isArray(routeCoordinates) || routeCoordinates.length === 0) {
    return [];
  }

  const coords = routeCoordinates.filter(isValidCoord);
  if (coords.length === 0) {
    return [];
  }

  // Single-point "route" — nothing to distribute, just return it.
  if (coords.length === 1) {
    return [coords[0]];
  }

  const targetCount = Math.max(2, Math.floor(numPoints) || 2);

  // Build cumulative distance along the route so we can place samples by
  // actual spatial spacing rather than raw array index.
  const cumulative = [0];
  for (let i = 1; i < coords.length; i++) {
    const [lat1, lon1] = coords[i - 1];
    const [lat2, lon2] = coords[i];
    cumulative.push(cumulative[i - 1] + haversineKm(lat1, lon1, lat2, lon2));
  }
  const totalDistance = cumulative[cumulative.length - 1];

  // Degenerate case: all points effectively at the same location.
  if (totalDistance === 0) {
    return [coords[0], coords[coords.length - 1]];
  }

  const samples = [];
  for (let i = 0; i < targetCount; i++) {
    const targetDist = (totalDistance * i) / (targetCount - 1);

    // Find the segment containing targetDist and interpolate within it.
    let segIndex = 0;
    while (segIndex < cumulative.length - 1 && cumulative[segIndex + 1] < targetDist) {
      segIndex++;
    }

    if (segIndex >= coords.length - 1) {
      samples.push(coords[coords.length - 1]);
      continue;
    }

    const segStartDist = cumulative[segIndex];
    const segEndDist = cumulative[segIndex + 1];
    const segLength = segEndDist - segStartDist;
    const t = segLength === 0 ? 0 : (targetDist - segStartDist) / segLength;

    const [lat1, lon1] = coords[segIndex];
    const [lat2, lon2] = coords[segIndex + 1];
    const lat = lat1 + (lat2 - lat1) * t;
    const lon = lon1 + (lon2 - lon1) * t;
    samples.push([lat, lon]);
  }

  // Ensure exact start/end (avoids floating-point drift at the boundaries).
  samples[0] = coords[0];
  samples[samples.length - 1] = coords[coords.length - 1];

  return samples;
}
