const WEATHER_URL = 'https://api.open-meteo.com/v1/forecast';

import { sampleRoutePoints } from './routeSampling.js';

// WMO weather codes -> human readable condition
const WEATHER_CODES = {
  0: 'Clear sky',
  1: 'Mainly clear',
  2: 'Partly cloudy',
  3: 'Overcast',
  45: 'Fog',
  48: 'Depositing rime fog',
  51: 'Light drizzle',
  53: 'Moderate drizzle',
  55: 'Dense drizzle',
  56: 'Light freezing drizzle',
  57: 'Dense freezing drizzle',
  61: 'Slight rain',
  63: 'Moderate rain',
  65: 'Heavy rain',
  66: 'Light freezing rain',
  67: 'Heavy freezing rain',
  71: 'Slight snow fall',
  73: 'Moderate snow fall',
  75: 'Heavy snow fall',
  77: 'Snow grains',
  80: 'Slight rain showers',
  81: 'Moderate rain showers',
  82: 'Violent rain showers',
  85: 'Slight snow showers',
  86: 'Heavy snow showers',
  95: 'Thunderstorm',
  96: 'Thunderstorm with slight hail',
  99: 'Thunderstorm with heavy hail',
};

// Fetch current weather for a given lat/lon using Open-Meteo (free, no API key)
export async function getWeather(lat, lon) {
  const url = `${WEATHER_URL}?latitude=${lat}&longitude=${lon}&current=temperature_2m,precipitation,wind_speed_10m,weather_code&timezone=auto`;

  let res;
  try {
    res = await fetch(url);
  } catch (e) {
    throw new Error('Network error while fetching weather. Check your internet connection.');
  }
  if (!res.ok) {
    throw new Error(`Weather service failed (${res.status}). Try again.`);
  }
  const data = await res.json();
  if (!data.current) {
    throw new Error('Weather data unavailable for this location.');
  }

  const c = data.current;
  return {
    temperature: c.temperature_2m,
    precipitation: c.precipitation,
    windSpeed: c.wind_speed_10m,
    weatherCode: c.weather_code,
    condition: WEATHER_CODES[c.weather_code] || 'Unknown',
  };
}

// Fetch real weather along an entire route (not just the destination) using
// routeSampling.js to pick evenly-spaced points along the actual OSRM geometry,
// then querying Open-Meteo for each sampled point.
//
// Never mocks/generates weather — every point's weather is either a real Open-Meteo
// result or explicitly marked unavailable (error) if that single fetch failed.
// A per-point failure does not fail the whole route; only an empty/invalid route
// (no sample points at all) yields an empty result set.
//
// Returned shape is intended for later use by a route-specific risk engine:
// {
//   points: [
//     { lat, lon, weather: {temperature, precipitation, windSpeed, weatherCode, condition} | null, error?: string }
//   ],
//   sampledCount: number,
//   successCount: number
// }
export async function getRouteWeather(routeCoordinates, numPoints = 5) {
  const samples = sampleRoutePoints(routeCoordinates, numPoints);

  if (!samples || samples.length === 0) {
    return { points: [], sampledCount: 0, successCount: 0 };
  }

  const results = await Promise.allSettled(
    samples.map(([lat, lon]) => getWeather(lat, lon))
  );

  const points = results.map((result, i) => {
    const [lat, lon] = samples[i];
    if (result.status === 'fulfilled') {
      return { lat, lon, weather: result.value };
    }
    return {
      lat,
      lon,
      weather: null,
      error: result.reason?.message || 'Weather unavailable for this point.',
    };
  });

  const successCount = points.filter((p) => p.weather !== null).length;

  return { points, sampledCount: samples.length, successCount };
}

// Combine weather + road/terrain/accessibility factors into a 0-100 risk score.
// Terrain/road/accessibility are prototype/synthetic factors (NER hill terrain assumption)
// since real road-condition datasets are not freely available for this demo.
export function calculateRiskScore(weather, { terrainFactor = 20, incidentFactor = 0 } = {}) {
  const reasons = [];
  let score = 0;

  // Rainfall / precipitation contribution (0-35)
  if (weather.precipitation >= 20) {
    score += 35;
    reasons.push('Heavy rainfall detected — high landslide/flood potential');
  } else if (weather.precipitation >= 5) {
    score += 20;
    reasons.push('Moderate rainfall — slippery road conditions likely');
  } else if (weather.precipitation > 0) {
    score += 8;
    reasons.push('Light rainfall — minor visibility/traction impact');
  }

  // Wind speed contribution (0-15)
  if (weather.windSpeed >= 40) {
    score += 15;
    reasons.push('High wind speed — risk for two-wheelers and light vehicles');
  } else if (weather.windSpeed >= 20) {
    score += 8;
    reasons.push('Moderate winds — drive with caution');
  }

  // Severe weather code contribution (0-20)
  const severeCodes = [65, 67, 75, 82, 86, 95, 96, 99];
  const moderateCodes = [63, 73, 81, 45, 48];
  if (severeCodes.includes(weather.weatherCode)) {
    score += 20;
    reasons.push(`Severe weather: ${weather.condition}`);
  } else if (moderateCodes.includes(weather.weatherCode)) {
    score += 10;
    reasons.push(`Adverse weather: ${weather.condition}`);
  }

  // Terrain factor (NER hill/mountain roads) — synthetic baseline (0-20)
  score += terrainFactor;
  if (terrainFactor >= 15) {
    reasons.push('Hilly/mountainous terrain (NER region) — prototype terrain factor');
  }

  // Incident factor — added in later phases (kept at 0 for Phase 3)
  score += incidentFactor;

  score = Math.min(100, Math.round(score));

  let level = 'LOW';
  if (score > 60) level = 'HIGH';
  else if (score > 30) level = 'MEDIUM';

  if (reasons.length === 0) {
    reasons.push('Clear weather and stable conditions');
  }

  return { score, level, reasons };
}
