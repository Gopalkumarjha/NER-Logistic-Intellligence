import React, { useState } from 'react';
import { INCIDENT_TYPES, SEVERITY_LEVELS, reportIncident } from '../services/incidents.js';
import './IncidentForm.css';

export default function IncidentForm({ onClose, onSubmitted }) {
  const [type, setType] = useState(INCIDENT_TYPES[0]);
  const [severity, setSeverity] = useState('Medium');
  const [description, setDescription] = useState('');
  const [lat, setLat] = useState('');
  const [lon, setLon] = useState('');
  const [locStatus, setLocStatus] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleUseMyLocation = () => {
    setLocStatus('Locating...');
    if (!navigator.geolocation) {
      setLocStatus('');
      setError('Geolocation not supported. Enter coordinates manually.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude.toFixed(6));
        setLon(pos.coords.longitude.toFixed(6));
        setLocStatus('Location captured ✅');
        setError('');
      },
      () => {
        setLocStatus('');
        setError('Permission denied. Enter coordinates manually.');
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  const handleSubmit = async () => {
    setError('');
    if (lat === '' || lon === '' || isNaN(Number(lat)) || isNaN(Number(lon))) {
      setError('Please provide a valid location (use "Use My Location" or enter manually).');
      return;
    }
    setSubmitting(true);
    try {
      const incident = await reportIncident({
        type,
        severity,
        description,
        lat: parseFloat(lat),
        lon: parseFloat(lon),
      });
      onSubmitted(incident);
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to submit report.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="incident-modal-overlay" onClick={onClose}>
      <div className="incident-modal" onClick={(e) => e.stopPropagation()}>
        <div className="incident-modal-header">
          <h3>🚧 Report Incident</h3>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>

        <label className="field-label">Incident Type</label>
        <select className="field-input" value={type} onChange={(e) => setType(e.target.value)}>
          {INCIDENT_TYPES.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>

        <label className="field-label">Severity</label>
        <div className="severity-row">
          {SEVERITY_LEVELS.map((s) => (
            <button
              key={s}
              className={`sev-btn sev-${s.toLowerCase()} ${severity === s ? 'active' : ''}`}
              onClick={() => setSeverity(s)}
              type="button"
            >
              {s}
            </button>
          ))}
        </div>

        <label className="field-label">Description (optional)</label>
        <textarea
          className="field-input"
          rows={3}
          placeholder="e.g. Large boulder blocking one lane near NH-6"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />

        <label className="field-label">Location</label>
        <div className="coord-row">
          <input
            className="field-input"
            placeholder="Latitude"
            value={lat}
            onChange={(e) => setLat(e.target.value)}
          />
          <input
            className="field-input"
            placeholder="Longitude"
            value={lon}
            onChange={(e) => setLon(e.target.value)}
          />
        </div>
        <button className="loc-btn" onClick={handleUseMyLocation} type="button">
          📍 Use My Location
        </button>
        {locStatus && <div className="loc-status">{locStatus}</div>}

        {error && <div className="error-box">⚠️ {error}</div>}

        <button className="submit-btn" onClick={handleSubmit} disabled={submitting}>
          {submitting ? 'Submitting...' : 'Submit Report'}
        </button>
      </div>
    </div>
  );
}
