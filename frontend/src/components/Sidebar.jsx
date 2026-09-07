import React, { useState } from 'react';
import './Sidebar.css';

function RiskBadge({ level }) {
  const colors = {
    LOW: { bg: '#052e16', border: '#166534', text: '#86efac' },
    MEDIUM: { bg: '#422006', border: '#a16207', text: '#fde047' },
    HIGH: { bg: '#450a0a', border: '#b91c1c', text: '#fca5a5' },
  };
  const c = colors[level] || colors.LOW;
  return (
    <span
      className="risk-badge"
      style={{ background: c.bg, border: `1px solid ${c.border}`, color: c.text }}
    >
      {level}
    </span>
  );
}

export default function Sidebar({
  from, to, setFrom, setTo,
  onUseMyLocation, onFindRoute,
  locStatus, routeInfo, loading, error,
  weather, weatherLoading, weatherError, risk,
  disruption, mlRisk, mlLoading, mlError
}) {
  return (
    <div className="sidebar">
      <div className="panel">
        <h3>Plan Route</h3>

        <label className="field-label">From</label>
        <input
          className="field-input"
          type="text"
          placeholder="e.g. Shillong, Meghalaya"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
        />
        <button className="loc-btn" onClick={onUseMyLocation}>
          📍 Use My Location
        </button>
        {locStatus && <div className="loc-status">{locStatus}</div>}

        <label className="field-label">To</label>
        <input
          className="field-input"
          type="text"
          placeholder="e.g. Guwahati, Assam"
          value={to}
          onChange={(e) => setTo(e.target.value)}
        />

        <button className="find-btn" onClick={onFindRoute} disabled={loading}>
          {loading ? 'Finding Route...' : 'Find Route'}
        </button>

        {error && <div className="error-box">⚠️ {error}</div>}

        {routeInfo && (
          <div className="route-info">
            <div className="ri-row"><span>Distance</span><b>{routeInfo.distance}</b></div>
            <div className="ri-row"><span>ETA</span><b>{routeInfo.eta}</b></div>
          </div>
        )}
      </div>

      <div className="panel">
     <h3>Weather (Route)</h3>
        {weatherLoading && <div className="status-placeholder">🔄 Fetching weather...</div>}
        {weatherError && <div className="error-box">⚠️ {weatherError}</div>}
        {weather && !weatherLoading && (
          <div className="weather-grid">
            <div className="weather-item">
              <span className="w-label">Condition</span>
              <span className="w-value">{weather.condition}</span>
            </div>
            <div className="weather-item">
              <span className="w-label">Temperature</span>
              <span className="w-value">{weather.temperature}°C</span>
            </div>
            <div className="weather-item">
              <span className="w-label">Rainfall</span>
              <span className="w-value">{weather.precipitation} mm</span>
            </div>
            <div className="weather-item">
              <span className="w-label">Wind</span>
              <span className="w-value">{weather.windSpeed} km/h</span>
            </div>
          </div>
        )}
        {!weather && !weatherLoading && !weatherError && (
          <div className="status-placeholder">Find a route to see live weather.</div>
        )}
      </div>

      <div className="panel">
        <h3>Route Risk</h3>
        {risk ? (
          <>
            <div className="risk-header">
              <RiskBadge level={risk.level} />
              <span className="risk-score">{risk.score}/100</span>
            </div>
            <div className="risk-bar-track">
              <div
                className="risk-bar-fill"
                style={{
                  width: `${risk.score}%`,
                  background: risk.level === 'HIGH' ? '#dc2626' : risk.level === 'MEDIUM' ? '#eab308' : '#16a34a',
                }}
              />
            </div>
            <ul className="risk-reasons">
              {risk.reasons.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>

            <div className="ml-divider" />
            <div className="ml-header">
              <span>🌲 AI Prediction (Random Forest)</span>
            </div>
            {mlLoading && <div className="status-placeholder">🔄 Running ML prediction...</div>}
            {mlError && <div className="error-box">⚠️ {mlError}</div>}
            {mlRisk && !mlLoading && (
              <>
                <div className="risk-header">
                  <RiskBadge level={mlRisk.risk_level} />
                  <span className="risk-score">{mlRisk.risk_score}/100</span>
                </div>
                <div className="ml-reason">{mlRisk.prediction_reason}</div>
                <div className="ml-source">📊 {mlRisk.data_source}</div>
              </>
            )}
          </>
        ) : (
          <div className="status-placeholder">Risk score will appear after finding a route.</div>
        )}
      </div>

      {risk && (
        <div className="panel realtime-panel">
          <h3>Real-Time Conditions</h3>

          <div className="rt-row">
            {risk.traffic?.available ? (
              <>
                <div className="rt-label">
                  {(() => {
                    const ratio = risk.traffic.congestionRatio;
                    if (ratio == null) return '🚗 Traffic: Data received';
                    if (ratio >= 0.8) return '🟢 Traffic: Low';
                    if (ratio >= 0.5) return '🟡 Traffic: Moderate';
                    return '🔴 Traffic: Heavy';
                  })()}
                </div>
                <div className="rt-source">Source: TomTom</div>
              </>
            ) : (
              <div className="rt-unavailable">🚗 Traffic data unavailable</div>
            )}
          </div>

          <div className="rt-row">
            {risk.weather?.available ? (
              <>
                <div className="rt-label">🌧️ Weather: {risk.weather.worstCase.condition}</div>
                <div className="rt-source">Source: Open-Meteo</div>
              </>
            ) : (
              <div className="rt-unavailable">🌧️ Weather data unavailable</div>
            )}
          </div>

          <div className="rt-row">
            <div className="rt-label">
              🚧 Incidents: {risk.incidents?.nearbyCount > 0 ? `${risk.incidents.nearbyCount} nearby` : 'None nearby'}
            </div>
            <div className="rt-source">Source: User Reports</div>
          </div>

          <div className="rt-row">
            {(() => {
              const disasterItems = (risk.incidents?.items || []).filter(
                (i) => i.type === 'Flood' || i.type === 'Landslide'
              );
              if (disasterItems.length > 0) {
                return (
                  <>
                    <div className="rt-label">🌊 {disasterItems.length} Flood/Landslide report(s) nearby</div>
                    <div className="rt-source">Source: User Reports</div>
                  </>
                );
              }
              return <div className="rt-unavailable">🌊 Live disaster data unavailable</div>;
            })()}
          </div>
        </div>
      )}

      {disruption && disruption.isDisrupted && (
        <div className="panel disruption-panel">
          <h3>⚠️ Route Disruption Detected</h3>
          <div className="disruption-row current">
            <span>🔴 Current Route</span>
            <b>{risk ? `${risk.level} RISK (${risk.score}/100)` : 'High Risk'}</b>
          </div>

          {disruption.saferFound && disruption.altRoute ? (
            <>
              <div className="disruption-row alt">
                <span>🟢 Safer Alternative</span>
                <b>{disruption.altRisk.level} RISK ({disruption.altRisk.score}/100)</b>
              </div>
              <div className="alt-compare">
                <div className="alt-compare-col">
                  <span className="w-label">Current</span>
                  <span className="w-value">{routeInfo?.distance} · {routeInfo?.eta}</span>
                </div>
                <div className="alt-compare-col">
                  <span className="w-label">Alternative</span>
                  <span className="w-value">{disruption.altInfo.distance} · {disruption.altInfo.eta}</span>
                </div>
              </div>
              <div className="alt-note">
                🟢 Risk reduced by {disruption.riskReduction} points. Alternative drawn on map (dashed green line).
              </div>
            </>
          ) : (
            <div className="alt-note error">
              {disruption.altError || '⚠️ No significantly safer alternative found — current route remains recommended.'}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
