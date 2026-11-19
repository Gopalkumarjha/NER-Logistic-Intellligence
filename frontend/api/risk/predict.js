export default function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const f = req.body || {};
  const rainfall = Math.max(0, Number(f.rainfall) || 0), wind = Math.max(0, Number(f.wind_speed) || 0);
  const terrain = Math.max(0, Math.min(100, Number(f.terrain_risk) || 0));
  const incidents = Math.max(0, Number(f.incident_count) || 0);
  const score = Math.min(100, Math.round(terrain * 0.45 + Math.min(100, rainfall * 5) * 0.25 + Math.min(100, wind * 2) * 0.1 + Math.min(100, incidents * 10) * 0.2));
  res.status(200).json({ risk_score: score, risk_level: score >= 70 ? 'High' : score >= 40 ? 'Medium' : 'Low', prediction_reason: 'Prototype estimate from submitted weather, terrain, and incident inputs.', data_source: 'heuristic prototype' });
}
