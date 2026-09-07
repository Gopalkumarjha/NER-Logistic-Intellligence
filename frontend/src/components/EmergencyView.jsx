import React, { useState, useEffect } from 'react';
import MapView from './MapView.jsx';
import ErrorBoundary from './ErrorBoundary.jsx';
import { fetchNearbyFacilities } from '../services/overpass.js';
import { getRoutes } from '../services/api.js';
import { findNearbyIncidents, incidentRiskContribution } from '../services/routeRisk.js';
import { getSosStatus, sendSosSms } from '../services/emergency.js';
import './EmergencyView.css';

export default function EmergencyView({ incidents }) {
  const [userPos, setUserPos] = useState(null);
  const [locAccuracy, setLocAccuracy] = useState(null);
  const [locError, setLocError] = useState('');
  const [locLoading, setLocLoading] = useState(true);

  const [facilities, setFacilities] = useState(null);
  const [facilitiesLoading, setFacilitiesLoading] = useState(false);
  const [facilitiesError, setFacilitiesError] = useState('');

  const [nearbyHazards, setNearbyHazards] = useState([]);

  const [safeRoute, setSafeRoute] = useState(null); // { coordinates, distanceKm, durationMin, targetName, targetType }
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState('');

  const [sosActive, setSosActive] = useState(false);
  const [sosStatus, setSosStatus] = useState('idle'); // idle | sending | success | error
  const [sosMessage, setSosMessage] = useState('');
  const [smsConfigured, setSmsConfigured] = useState(null); // null = unknown yet

  // Check once (non-blocking, never crashes UI) whether the backend can send real SOS SMS
  useEffect(() => {
    getSosStatus().then((s) => setSmsConfigured(s.smsConfigured));
  }, []);

  // Get current GPS location as soon as Emergency Mode opens. This is the ONLY
  // geolocation request in Emergency Mode — userPos is the single source of
  // truth used both for the "Location locked" banner and for SOS.
  useEffect(() => {
    setLocLoading(true);
    if (!navigator.geolocation) {
      setLocError('Geolocation not supported on this device. Enter your location in Normal Mode instead.');
      setLocLoading(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserPos([pos.coords.latitude, pos.coords.longitude]);
        setLocAccuracy(typeof pos.coords.accuracy === 'number' ? pos.coords.accuracy : null);
        setLocLoading(false);
      },
      () => {
        setLocError('Location permission denied. Emergency Mode needs GPS access to find nearby help.');
        setLocLoading(false);
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }, []);

  // Once we have a location: fetch nearby facilities (Overpass) — only refetch if location changes
  useEffect(() => {
    if (!userPos) return;
    setFacilitiesLoading(true);
    setFacilitiesError('');
    fetchNearbyFacilities(userPos[0], userPos[1])
      .then((data) => setFacilities(data))
      .catch((err) => setFacilitiesError(err.message || 'Could not load nearby hospitals/police.'))
      .finally(() => setFacilitiesLoading(false));
  }, [userPos]);

  // Recompute nearby hazards whenever location or the incident list changes (cheap, local calc)
  useEffect(() => {
    if (!userPos) return;
    const hazards = findNearbyIncidents([userPos, userPos], incidents, 10);
    setNearbyHazards(hazards);
  }, [userPos, incidents]);

  // Sends the SAME already-locked userPos shown in the banner above — never
  // requests geolocation again and never introduces a second location state.
  const handleSendSos = async () => {
    setSosActive(true);
    if (!userPos) {
      setSosStatus('error');
      setSosMessage('Cannot send SOS — your GPS location is unavailable.');
      return;
    }
    setSosStatus('sending');
    setSosMessage('');
    try {
      await sendSosSms({
        latitude: userPos[0],
        longitude: userPos[1],
        timestamp: new Date().toISOString(),
        ...(locAccuracy != null ? { accuracy: locAccuracy } : {}),
      });
      setSosStatus('success');
      setSosMessage('✅ SOS SMS sent successfully');
    } catch (err) {
      setSosStatus('error');
      setSosMessage(`⚠️ SOS SMS could not be sent — ${err.message}`);
    }
  };

  const handleNavigateTo = async (facility, type) => {
    if (!userPos) return;
    setRouteLoading(true);
    setRouteError('');
    setSafeRoute(null);
    try {
      const candidates = await getRoutes(userPos, [facility.lat, facility.lon], { alternatives: true });

      // Pick the candidate with fewest nearby high-risk incidents (safest, not just shortest)
      let best = candidates[0];
      let bestHazardScore = Infinity;
      for (const c of candidates) {
        const nearby = findNearbyIncidents(c.coordinates, incidents);
        const { score } = incidentRiskContribution(nearby);
        if (score < bestHazardScore) {
          bestHazardScore = score;
          best = c;
        }
      }

      setSafeRoute({
        ...best,
        targetName: facility.name,
        targetType: type,
      });
    } catch (err) {
      setRouteError(err.message || 'Could not calculate a route to this facility.');
    } finally {
      setRouteLoading(false);
    }
  };

  return (
    <div className="emergency-shell">
      <div className="emergency-sidebar">
        <div className="emergency-status-banner">
          🚨 EMERGENCY MODE ACTIVE
          <div className="emergency-status-sub">
            {locLoading && 'Acquiring GPS location...'}
            {!locLoading && userPos && `📍 Location locked: ${userPos[0].toFixed(4)}, ${userPos[1].toFixed(4)}`}
            {!locLoading && !userPos && '⚠️ Location unavailable'}
          </div>
        </div>

        <button
          className={`sos-btn ${sosActive ? 'sos-active' : ''}`}
          onClick={handleSendSos}
          disabled={sosStatus === 'sending' || !userPos}
        >
          {sosStatus === 'sending' ? '📡 Sending SOS...' : '🚨 Send SOS SMS'}
        </button>

        {smsConfigured === false && sosStatus === 'idle' && (
          <div className="sos-hint">
            SMS provider not configured on this server — SOS will report an error until configured. Call buttons below always work.
          </div>
        )}

        {sosStatus !== 'idle' && (
          <div className={`sos-note ${sosStatus}`}>
            {sosStatus === 'sending' && '📡 Sending SOS SMS with your current location...'}
            {sosStatus === 'success' && sosMessage}
            {sosStatus === 'error' && sosMessage}
            <div className="sos-disclaimer">
              This does <b>not</b> automatically call emergency services. Use the Call buttons for a direct phone call.
            </div>
            <button className="sos-dismiss" onClick={() => setSosStatus('idle')}>Dismiss</button>
          </div>
        )}

        {locError && <div className="error-box">⚠️ {locError}</div>}

        <div className="panel">
          <h3>🏥 Nearby Hospitals</h3>
          {facilitiesLoading && <div className="status-placeholder">🔄 Searching nearby hospitals...</div>}
          {facilitiesError && <div className="error-box">⚠️ {facilitiesError}</div>}
          {facilities && facilities.hospitals.length === 0 && !facilitiesLoading && (
            <div className="status-placeholder">No hospitals found within range.</div>
          )}
          {facilities && facilities.hospitals.map((h) => (
            <div className="facility-card" key={h.id}>
              <div className="facility-name">{h.name}</div>
              <div className="facility-dist">{h.distanceKm} km away</div>
              <div className="facility-actions">
                {h.phone ? (
                  <a className="fac-btn call" href={`tel:${h.phone}`}>📞 Call</a>
                ) : (
                  <span className="fac-btn disabled">📞 No number</span>
                )}
                <button className="fac-btn nav" onClick={() => handleNavigateTo(h, 'Hospital')}>
                  🧭 Navigate
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="panel">
          <h3>🚓 Nearby Police Stations</h3>
          {facilitiesLoading && <div className="status-placeholder">🔄 Searching nearby police stations...</div>}
          {facilities && facilities.police.length === 0 && !facilitiesLoading && (
            <div className="status-placeholder">No police stations found within range.</div>
          )}
          {facilities && facilities.police.map((p) => (
            <div className="facility-card" key={p.id}>
              <div className="facility-name">{p.name}</div>
              <div className="facility-dist">{p.distanceKm} km away</div>
              <div className="facility-actions">
                {p.phone ? (
                  <a className="fac-btn call" href={`tel:${p.phone}`}>📞 Call</a>
                ) : (
                  <span className="fac-btn disabled">📞 No number</span>
                )}
                <button className="fac-btn nav" onClick={() => handleNavigateTo(p, 'Police Station')}>
                  🧭 Navigate
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="panel">
          <h3>⚠️ Nearby Hazards</h3>
          {nearbyHazards.length === 0 && (
            <div className="status-placeholder">No reported hazards near your location.</div>
          )}
          {nearbyHazards.map((inc) => (
            <div className="hazard-row" key={inc._id}>
              <span>{inc.type} — {inc.severity}</span>
            </div>
          ))}
        </div>

        {routeLoading && <div className="status-placeholder">🔄 Calculating safest route...</div>}
        {routeError && <div className="error-box">⚠️ {routeError}</div>}
        {safeRoute && (
          <div className="panel safe-route-panel">
            <h3>🟢 Safest Route to {safeRoute.targetType}</h3>
            <div className="facility-name">{safeRoute.targetName}</div>
            <div className="ri-row"><span>Distance</span><b>{safeRoute.distanceKm} km</b></div>
            <div className="ri-row"><span>ETA</span><b>{safeRoute.durationMin} min</b></div>
          </div>
        )}
      </div>

      <div className="emergency-map-area">
        <ErrorBoundary>
          <MapView
            userPosition={userPos}
            facilities={facilities}
            incidents={incidents}
            safeRouteCoords={safeRoute?.coordinates || null}
          />
        </ErrorBoundary>
      </div>
    </div>
  );
}
