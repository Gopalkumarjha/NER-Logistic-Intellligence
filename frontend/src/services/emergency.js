const API_URL = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:5000/api' : '/api');

// Checks (without exposing credentials) whether the backend can send Telegram SOS.
export async function getSosStatus() {
  try {
    const res = await fetch(`${API_URL}/emergency/status`);
    if (!res.ok) return { smsConfigured: false, telegramConfigured: false };
    return await res.json();
  } catch (e) {
    return { smsConfigured: false, telegramConfigured: false };
  }
}

// Sends a real Telegram SOS via the backend, using the already-locked location the
// caller passes in — this function never requests geolocation itself.
// Accepts { latitude, longitude, timestamp, accuracy? }.
// Throws on any failure — caller must not claim success unless this resolves.
export async function sendSosSms({ latitude, longitude, timestamp, accuracy }) {
  let res;
  try {
    res = await fetch(`${API_URL}/emergency/sos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        latitude,
        longitude,
        timestamp: timestamp || new Date().toISOString(),
        ...(accuracy != null ? { accuracy } : {}),
      }),
    });
  } catch (e) {
    throw new Error('Cannot reach the SOS service.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'SOS SMS could not be sent.');
  }
  return data;
}
