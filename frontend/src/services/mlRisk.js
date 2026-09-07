const ML_API_URL = import.meta.env.VITE_ML_API_URL || 'http://localhost:8001/api';

// Calls the Random Forest ML service. Returns { risk_score, risk_level, prediction_reason, data_source }.
// Throws a friendly error on failure — caller must handle gracefully (never blank screen).
export async function predictMLRisk(features) {
  let res;
  try {
    res = await fetch(`${ML_API_URL}/risk/predict`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(features),
    });
  } catch (e) {
    throw new Error('ML service unreachable. Is the Python service running on port 8001?');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || 'ML prediction failed.');
  }
  return data;
}

// Build the 9-feature payload the ML model expects from weather + nearby-incident data
export function buildMLFeatures(weather, nearbyIncidents, terrainRisk = 65) {
  const landslideCount = nearbyIncidents.filter((i) => i.type === 'Landslide').length;
  const floodCount = nearbyIncidents.filter((i) => i.type === 'Flood').length;
  const damagedRoadCount = nearbyIncidents.filter(
    (i) => i.type === 'Damaged Road' || i.type === 'Road Block'
  ).length;

  // Prototype/synthetic derived scores (no real road-sensor data available for this demo)
  const roadCondition = Math.max(10, 80 - damagedRoadCount * 25);
  const accessibilityScore = Math.max(10, 75 - nearbyIncidents.length * 8);

  return {
    rainfall: weather?.precipitation ?? 0,
    temperature: weather?.temperature ?? 20,
    wind_speed: weather?.windSpeed ?? 0,
    terrain_risk: terrainRisk,
    road_condition: roadCondition,
    incident_count: nearbyIncidents.length,
    landslide_count: landslideCount,
    flood_count: floodCount,
    accessibility_score: accessibilityScore,
  };
}
