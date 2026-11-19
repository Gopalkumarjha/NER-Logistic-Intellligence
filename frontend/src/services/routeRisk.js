// Incident types that affect route risk / disruption (per Phase 5 spec)
const ROUTE_AFFECTING_TYPES = ['Landslide', 'Flood', 'Accident', 'Road Block', 'Damaged Road', 'Fallen Tree', 'Traffic'];

// Distance (km) within which an incident is considered "on/near the route"
const PROXIMITY_RADIUS_KM = 5;

// Max points sampled along a route polyline for proximity checks (perf guard)
const MAX_SAMPLE_POINTS = 80;

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

function sampleRoute(coords, maxPoints) {
  if (!coords || coords.length <= maxPoints) return coords || [];
  const step = Math.ceil(coords.length / maxPoints);
  const out = [];
  for (let i = 0; i < coords.length; i += step) out.push(coords[i]);
  return out;
}

// Find incidents (of relevant types) located within PROXIMITY_RADIUS_KM of the route
export function findNearbyIncidents(routeCoords, incidents, radiusKm = PROXIMITY_RADIUS_KM) {
  if (!routeCoords || routeCoords.length === 0 || !incidents || incidents.length === 0) {
    return [];
  }
  const sampled = sampleRoute(routeCoords, MAX_SAMPLE_POINTS);
  const nearby = [];

  for (const inc of incidents) {
    if (inc.verificationStatus === 'resolved') continue;
    if (!ROUTE_AFFECTING_TYPES.includes(inc.type)) continue;
    const isNear = sampled.some(
      ([lat, lon]) => haversineKm(lat, lon, inc.lat, inc.lon) <= radiusKm
    );
    if (isNear) nearby.push(inc);
  }
  return nearby;
}

// Convert nearby incidents into a risk score contribution + disruption flag + reasons
export function incidentRiskContribution(nearbyIncidents) {
  let score = 0;
  let hasHighSeverity = false;
  const reasons = [];

  for (const inc of nearbyIncidents) {
    if (inc.severity === 'High') {
      score += 30;
      hasHighSeverity = true;
      reasons.push(`🔴 HIGH severity ${inc.type} reported near route`);
    } else if (inc.severity === 'Medium') {
      score += 15;
      reasons.push(`🟠 MEDIUM severity ${inc.type} reported near route`);
    } else {
      score += 6;
      reasons.push(`🟡 LOW severity ${inc.type} reported near route`);
    }
  }

  return {
    score: Math.min(50, score), // cap incident contribution
    hasHighSeverity,
    reasons,
  };
}

// Even a one-point improvement qualifies; never advertise an equal/higher-risk route as safer.
export const SAFER_ROUTE_THRESHOLD = 1;

// Compare route geometry, not total distance: distinct roads can have nearly equal lengths.
export function isSameRoute(routeA, routeB) {
  if (!routeA || !routeB) return false;
  const a = routeA.coordinates;
  const b = routeB.coordinates;
  if (!Array.isArray(a) || !Array.isArray(b) || !a.length || !b.length) {
    return Math.abs(parseFloat(routeA.distanceKm) - parseFloat(routeB.distanceKm)) < 0.1;
  }
  const samples = Array.from({ length: 11 }, (_, i) => a[Math.round((a.length - 1) * i / 10)]);
  let closeCount = 0;
  for (const [lat, lon] of samples) {
    const nearestKm = Math.min(...b.map(([otherLat, otherLon]) => {
      const dLat = (otherLat - lat) * Math.PI / 180;
      const dLon = (otherLon - lon) * Math.PI / 180;
      const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat * Math.PI / 180) * Math.cos(otherLat * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
      return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
    }));
    if (nearestKm <= 0.15) closeCount++;
  }
  return closeCount / samples.length >= 0.85;
}
