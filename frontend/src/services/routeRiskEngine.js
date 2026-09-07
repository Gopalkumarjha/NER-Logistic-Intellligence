// Route risk engine: evaluates risk for ANY given route geometry (current route,
// OSRM alternative 1, alternative 2, etc.) by combining:
//   - the existing unmodified calculateRiskScore() rule-based formula (weather + terrain)
//   - the existing unmodified incident proximity/severity logic (findNearbyIncidents / incidentRiskContribution)
//   - real route-specific weather sampled along the actual route geometry (getRouteWeather)
//   - real route-specific traffic sampled along the actual route geometry (getRouteTraffic),
//     added on top as an explicit, separate contribution since traffic is not part of
//     the original rule-based formula.
//
// Never generates mock/random weather, traffic, or incident data. If traffic or weather
// data is unavailable for a route, that factor is explicitly marked unavailable and
// omitted from the score rather than guessed.

import { calculateRiskScore, getRouteWeather } from './weather.js';
import { findNearbyIncidents, incidentRiskContribution } from './routeRisk.js';
import { getRouteTraffic } from './traffic.js';

const RISK_LEVEL_HIGH_THRESHOLD = 60;
const RISK_LEVEL_MEDIUM_THRESHOLD = 30;

function levelForScore(score) {
  if (score > RISK_LEVEL_HIGH_THRESHOLD) return 'HIGH';
  if (score > RISK_LEVEL_MEDIUM_THRESHOLD) return 'MEDIUM';
  return 'LOW';
}

// Picks a single representative "worst case" weather reading from the real sampled
// route-weather points, so the existing single-point calculateRiskScore() formula can
// be reused unchanged. Precipitation is the dominant risk driver in that formula, so
// the point with the highest real precipitation is used (wind speed as tie-breaker).
// Returns null if no real weather data is available for the route at all.
function pickWorstCaseWeather(points) {
  const withWeather = (points || []).filter((p) => p.weather);
  if (withWeather.length === 0) return null;

  return withWeather.reduce((worst, p) => {
    if (!worst) return p.weather;
    if (p.weather.precipitation > worst.precipitation) return p.weather;
    if (p.weather.precipitation === worst.precipitation && p.weather.windSpeed > worst.windSpeed) {
      return p.weather;
    }
    return worst;
  }, null);
}

// Traffic is additive on top of the existing formula (which has no traffic concept).
// Only ever computed from real TomTom-backed data; contributes 0 when unavailable.
function computeTrafficContribution(routeTraffic) {
  if (!routeTraffic || !routeTraffic.available) {
    return { score: 0, reasons: [], roadClosureDetected: false };
  }

  const reasons = [];
  let score = 0;

  const ratio = routeTraffic.congestionRatio;
  if (typeof ratio === 'number') {
    if (ratio < 0.4) {
      score += 25;
      reasons.push('Severe traffic congestion detected along route (real-time data)');
    } else if (ratio < 0.7) {
      score += 12;
      reasons.push('Moderate traffic congestion detected along route (real-time data)');
    }
  }

  const roadClosureDetected = (routeTraffic.points || []).some(
    (p) => p.traffic && p.traffic.roadClosure
  );
  if (roadClosureDetected) {
    score += 25;
    reasons.push('Road closure reported by live traffic data along route');
  }

  return { score: Math.min(40, score), reasons, roadClosureDetected };
}

/**
 * Evaluates risk for a single route's actual geometry, combining real route-specific
 * weather, real route-specific traffic, and incident proximity — on top of the existing
 * unmodified rule-based risk formula. Works for any route object of the shape
 * { coordinates, distanceKm, durationMin } (current route or any OSRM alternative).
 *
 * @param {{coordinates: Array<[number,number]>}} route
 * @param {Array} incidents - existing manually-reported incidents (MongoDB documents)
 * @param {{terrainFactor?: number}} options
 * @returns {Promise<object>} risk result — see fields below
 */
export async function evaluateRouteRisk(route, incidents = [], options = {}) {
  const terrainFactor = options.terrainFactor ?? 20;
  const routeCoordinates = (route && route.coordinates) || [];

  // 1. Incident proximity/severity risk — existing logic, unchanged.
  const nearby = findNearbyIncidents(routeCoordinates, incidents || []);
  const incidentResult = incidentRiskContribution(nearby);

  // 2. Real route-specific weather (multiple sampled points along this route's actual geometry).
  let routeWeather = { points: [], sampledCount: 0, successCount: 0 };
  try {
    routeWeather = await getRouteWeather(routeCoordinates);
  } catch (e) {
    routeWeather = { points: [], sampledCount: 0, successCount: 0 };
  }
  const worstCaseWeather = pickWorstCaseWeather(routeWeather.points);
  const weatherAvailable = !!worstCaseWeather;
  const weatherForCalc = worstCaseWeather || { precipitation: 0, windSpeed: 0, weatherCode: 0, condition: 'Unknown' };

  // 3. Real route-specific traffic (multiple sampled points; explicitly unavailable if
  //    TomTom/backend has no data — never guessed).
  let routeTraffic = {
    available: false, points: [], sampledCount: 0, successCount: 0,
    averageCurrentSpeed: null, averageFreeFlowSpeed: null, congestionRatio: null,
  };
  try {
    routeTraffic = await getRouteTraffic(routeCoordinates);
  } catch (e) {
    // keep default unavailable shape
  }
  const trafficContribution = computeTrafficContribution(routeTraffic);

  // 4. Reuse the EXISTING rule-based formula UNCHANGED for weather + terrain + incidents.
  const combinedRisk = calculateRiskScore(weatherForCalc, {
    terrainFactor,
    incidentFactor: incidentResult.score,
  });

  // Isolate the pure weather-only contribution (same unmodified formula, terrain/incident
  // zeroed out) purely so the breakdown can explain how much of the score is weather.
  const weatherOnly = calculateRiskScore(weatherForCalc, { terrainFactor: 0, incidentFactor: 0 });

  // 5. Add real traffic risk on top (not part of the original formula), preserving 0-100 scale.
  const score = Math.min(100, Math.round(combinedRisk.score + trafficContribution.score));
  const level = levelForScore(score);

  const reasons = [
    ...combinedRisk.reasons,
    ...incidentResult.reasons,
    ...trafficContribution.reasons,
  ];
  if (!weatherAvailable) {
    reasons.push('Route weather data unavailable — weather risk omitted for this route');
  }
  if (!routeTraffic.available) {
    reasons.push('Route traffic data unavailable — traffic risk omitted for this route');
  }

  return {
    score,
    level,

    weather: {
      available: weatherAvailable,
      sampledPoints: routeWeather.sampledCount,
      successCount: routeWeather.successCount,
      worstCase: worstCaseWeather, // real Open-Meteo reading used for scoring, or null
      contributionScore: weatherOnly.score,
    },

    traffic: {
      available: routeTraffic.available,
      sampledPoints: routeTraffic.sampledCount,
      successCount: routeTraffic.successCount,
      averageCurrentSpeed: routeTraffic.averageCurrentSpeed,
      averageFreeFlowSpeed: routeTraffic.averageFreeFlowSpeed,
      congestionRatio: routeTraffic.congestionRatio,
      roadClosureDetected: trafficContribution.roadClosureDetected,
      contributionScore: trafficContribution.score,
    },

    incidents: {
      nearbyCount: nearby.length,
      hasHighSeverity: incidentResult.hasHighSeverity,
      contributionScore: incidentResult.score,
      items: nearby,
    },

    breakdown: {
      weatherScore: weatherOnly.score,
      terrainScore: terrainFactor,
      incidentScore: incidentResult.score,
      trafficScore: trafficContribution.score,
      ruleBasedScoreBeforeTraffic: combinedRisk.score,
    },

    dataAvailability: {
      weatherAvailable,
      trafficAvailable: routeTraffic.available,
    },

    reasons,
  };
}
