const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

export const INCIDENT_TYPES = [
  'Landslide',
  'Flood',
  'Accident',
  'Road Block',
  'Damaged Road',
  'Fallen Tree',
  'Traffic',
  'Other',
];

export const SEVERITY_LEVELS = ['Low', 'Medium', 'High'];

// GET all incidents. Returns [] on any failure so the map never breaks.
export async function fetchIncidents() {
  try {
    const res = await fetch(`${API_URL}/incidents`);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `Failed to load incidents (${res.status}).`);
    }
    const data = await res.json();
    return data.incidents || [];
  } catch (err) {
    if (err.message.includes('Failed to fetch')) {
      throw new Error('Cannot reach backend server. Is it running?');
    }
    throw err;
  }
}

// POST a new incident report
export async function reportIncident(payload) {
  let res;
  try {
    res = await fetch(`${API_URL}/incidents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    throw new Error('Cannot reach backend server. Is it running?');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || 'Failed to submit incident report.');
  }
  return data.incident;
}
