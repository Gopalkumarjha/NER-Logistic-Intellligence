const API_URL = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:5000/api' : '/api');

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

function reporterId() {
  let id = localStorage.getItem('nerIncidentReporterId');
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem('nerIncidentReporterId', id);
  }
  return id;
}

function ownedIncidentIds() {
  try { return JSON.parse(localStorage.getItem('nerOwnedIncidentIds') || '[]'); } catch { return []; }
}

function rememberOwnedIncident(id) {
  const ids = new Set(ownedIncidentIds());
  ids.add(String(id));
  localStorage.setItem('nerOwnedIncidentIds', JSON.stringify([...ids]));
}

// GET all incidents. Returns [] on any failure so the map never breaks.
export async function fetchIncidents() {
  try {
    const res = await fetch(`${API_URL}/incidents`);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `Failed to load incidents (${res.status}).`);
    }
    const data = await res.json();
    const owned = new Set(ownedIncidentIds());
    return (data.incidents || []).map((incident) => ({ ...incident, canDelete: owned.has(String(incident._id)) }));
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
      body: JSON.stringify({ ...payload, reporterId: reporterId() }),
    });
  } catch (e) {
    throw new Error('Cannot reach backend server. Is it running?');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || 'Failed to submit incident report.');
  }
  rememberOwnedIncident(data.incident._id);
  return { ...data.incident, canDelete: true };
}

export async function removeIncident(incidentId) {
  if (!ownedIncidentIds().includes(String(incidentId))) throw new Error('Only the device that submitted this report can remove it.');
  const res = await fetch(`${API_URL}/incidents?id=${encodeURIComponent(incidentId)}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reporterId: reporterId() }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Could not remove incident report.');
  localStorage.setItem('nerOwnedIncidentIds', JSON.stringify(ownedIncidentIds().filter((id) => String(id) !== String(incidentId))));
  return true;
}
