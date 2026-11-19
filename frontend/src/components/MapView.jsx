import React, { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, ZoomControl, useMap } from 'react-leaflet';
import L from 'leaflet';

// Modern flat divIcon markers (no external PNG marker images needed => no broken-icon risk)
function badgeIcon(emoji, bg, size = 30, ring = false) {
  return L.divIcon({
    className: 'custom-div-icon',
    html: `<div class="marker-badge ${ring ? 'marker-badge-ring' : ''}" style="background:${bg};width:${size}px;height:${size}px;font-size:${size * 0.52}px;">${emoji}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
  });
}

const userIcon = badgeIcon('📍', '#2563eb', 30, true);
const fromIcon = badgeIcon('A', '#16a34a', 28);
const toIcon = badgeIcon('B', '#dc2626', 28);

const incidentIcons = {
  Low: badgeIcon('⚠', '#ca8a04', 26),
  Medium: badgeIcon('⚠', '#ea580c', 28),
  High: badgeIcon('⚠', '#dc2626', 32),
};

const hospitalIcon = badgeIcon('🏥', '#0ea5e9', 28);
const policeIcon = badgeIcon('🚓', '#1e293b', 28);

// Road tiles use OSM directly so the map appears without waiting on a serverless
// tile proxy. Satellite imagery still uses our TomTom proxy to keep the key private.
function BaseTileLayer({ mapStyle }) {
  return (
    <>
      <TileLayer
        url={mapStyle === 'road'
          ? 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
          : '/api/satellite/{z}/{x}/{y}.jpg'}
        attribution={mapStyle === 'road'
          ? '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          : '&copy; TomTom | Satellite imagery &copy; Maxar'}
        maxZoom={19}
        keepBuffer={3}
        updateWhenIdle
        updateWhenZooming={false}
      />
      {!import.meta.env.DEV && mapStyle === 'satellite' && (
        <TileLayer url="/api/satellite-overlay/{z}/{x}/{y}.png" maxZoom={19} />
      )}
    </>
  );
}

function MapStylePicker({ mapStyle, setMapStyle }) {
  return (
    <div className="leaflet-top leaflet-left map-style-control">
      <div className="map-style-picker" role="group" aria-label="Map style">
        <button type="button" aria-pressed={mapStyle === 'road'} className={mapStyle === 'road' ? 'active' : ''} onClick={() => setMapStyle('road')}>
          <span className="map-style-icon">▱</span> Road
        </button>
        <button type="button" aria-pressed={mapStyle === 'satellite'} className={mapStyle === 'satellite' ? 'active' : ''} onClick={() => setMapStyle('satellite')}>
          <span className="map-style-icon">▧</span> Satellite
        </button>
      </div>
    </div>
  );
}

function ScaleControl() {
  const map = useMap();
  useEffect(() => {
    const control = L.control.scale({ position: 'bottomleft', imperial: false });
    control.addTo(map);
    return () => control.remove();
  }, [map]);
  return null;
}

function RecenterMap({ position }) {
  const map = useMap();
  useEffect(() => {
    if (position) {
      map.flyTo(position, 10, { duration: 1 });
    }
  }, [position]);
  return null;
}

function FitBounds({ coordinates }) {
  const map = useMap();
  useEffect(() => {
    if (coordinates && coordinates.length > 0) {
      const bounds = L.latLngBounds(coordinates);
      map.fitBounds(bounds, { padding: [50, 50] });
    }
  }, [coordinates]);
  return null;
}

// Default center: between Shillong and Guwahati
const DEFAULT_CENTER = [25.7, 91.8];

function nearestRouteIndex(route, point) {
  let nearest = 0;
  let distance = Infinity;
  route.forEach(([lat, lon], index) => {
    const d = (lat - point.lat) ** 2 + (lon - point.lon) ** 2;
    if (d < distance) { distance = d; nearest = index; }
  });
  return nearest;
}

function trafficLineSegments(route, points) {
  if (!route?.length || !points?.length) return [];
  return points.slice(0, -1).flatMap((start, i) => {
    const end = points[i + 1];
    if (![start, end].every((point) => point.traffic && Number.isFinite(point.traffic.currentSpeed) && Number.isFinite(point.traffic.freeFlowSpeed) && point.traffic.freeFlowSpeed > 0)) return [];
    const startIndex = nearestRouteIndex(route, start);
    const endIndex = nearestRouteIndex(route, end);
    if (endIndex <= startIndex) return [];
    const ratio = ((start.traffic.currentSpeed / start.traffic.freeFlowSpeed) + (end.traffic.currentSpeed / end.traffic.freeFlowSpeed)) / 2;
    const status = ratio >= 0.8 ? 'Low traffic · moving freely' : ratio >= 0.5 ? 'Moderate traffic · slower than usual' : 'High traffic · congested';
    const color = ratio >= 0.8 ? '#16a34a' : ratio >= 0.5 ? '#eab308' : '#dc2626';
    return [{ positions: route.slice(startIndex, endIndex + 1), color, ratio, status,
      currentSpeed: (start.traffic.currentSpeed + end.traffic.currentSpeed) / 2,
      freeFlowSpeed: (start.traffic.freeFlowSpeed + end.traffic.freeFlowSpeed) / 2 }];
  });
}

export default function MapView({
  userPosition, routeCoords, fromMarker, toMarker, incidents,
  isDisrupted, altRouteCoords, facilities, safeRouteCoords, trafficPoints = [], onRemoveIncident, onResolveIncident
}) {
  const [mapStyle, setMapStyle] = React.useState('road');
  const coloredSegments = trafficLineSegments(routeCoords, trafficPoints);
  return (
    <MapContainer center={DEFAULT_CENTER} zoom={8} scrollWheelZoom={true} zoomControl={false}>
      <BaseTileLayer mapStyle={mapStyle} />
      <MapStylePicker mapStyle={mapStyle} setMapStyle={setMapStyle} />
      {coloredSegments.length > 0 && <div className="traffic-legend" aria-label="TomTom traffic line legend"><b>TomTom live traffic</b><span>🟢 Low · moving freely</span><span>🟡 Moderate · slower</span><span>🔴 High · congested</span><span>⚪ Gray · no sample data</span><small>Click a colored route section for its sampled speed</small></div>}
      <ZoomControl position="topright" />
      <ScaleControl />

      {userPosition && (
        <>
          <Marker position={userPosition} icon={userIcon}>
            <Popup>📍 You are here</Popup>
          </Marker>
          {!routeCoords && <RecenterMap position={userPosition} />}
        </>
      )}

      {fromMarker && (
        <Marker position={[fromMarker.lat, fromMarker.lon]} icon={fromIcon}>
          <Popup>🟢 Start: {fromMarker.displayName}</Popup>
        </Marker>
      )}

      {toMarker && (
        <Marker position={[toMarker.lat, toMarker.lon]} icon={toIcon}>
          <Popup>🔴 Destination: {toMarker.displayName}</Popup>
        </Marker>
      )}

      {routeCoords && routeCoords.length > 0 && (
        <>
          <Polyline
            positions={routeCoords}
            pathOptions={{
              color: coloredSegments.length ? '#cbd5e1' : (isDisrupted ? '#ef4444' : '#3b82f6'),
              weight: coloredSegments.length ? 9 : 6,
              opacity: 0.95,
              lineCap: 'round',
              lineJoin: 'round',
            }}
          />
          <FitBounds coordinates={altRouteCoords || routeCoords} />
        </>
      )}

      {coloredSegments.map((segment, index) => (
        <Polyline key={`traffic-line-${index}`} positions={segment.positions} pathOptions={{ color: segment.color, weight: 7, opacity: 0.98, lineCap: 'round', lineJoin: 'round' }}>
          <Popup>
            <b>{segment.status}</b><br />
            Estimated between TomTom sample points<br />
            Current speed: {Math.round(segment.currentSpeed)} km/h<br />
            Free-flow speed: {Math.round(segment.freeFlowSpeed)} km/h<br />
            Speed vs free flow: {Math.round(segment.ratio * 100)}%
          </Popup>
        </Polyline>
      ))}

      {altRouteCoords && altRouteCoords.length > 0 && (
        <Polyline
          positions={altRouteCoords}
          pathOptions={{
            color: '#22c55e',
            weight: 6,
            opacity: 0.95,
            dashArray: '12, 10',
            lineCap: 'round',
          }}
        />
      )}

      {incidents && incidents.filter((inc) => inc.verificationStatus !== 'resolved').map((inc) => (
        <Marker
          key={inc._id}
          position={[inc.lat, inc.lon]}
          icon={incidentIcons[inc.severity] || incidentIcons.Medium}
        >
          <Popup>
            <b>{inc.type}</b> — {inc.severity} severity<br />
            {inc.description && <>{inc.description}<br /></>}
            <span style={{ fontSize: '11px', color: '#666' }}>
              {inc.verificationStatus === 'verified' ? 'Verified' : 'Unverified community report'} · {inc.createdAt ? new Date(inc.createdAt).toLocaleString() : 'time unavailable'}<br />
              Resolution proof: {inc.resolutionCount || 0}/2 nearby confirmations
            </span>
            {onResolveIncident && <><br /><button type="button" onClick={() => onResolveIncident(inc)}>Suggest resolved (GPS + proof)</button></>}
            {inc.canDelete && onRemoveIncident && <><br /><button type="button" onClick={() => onRemoveIncident(inc)}>Remove my report</button></>}
          </Popup>
        </Marker>
      ))}

      {facilities && facilities.hospitals && facilities.hospitals.map((h) => (
        <Marker key={h.id} position={[h.lat, h.lon]} icon={hospitalIcon}>
          <Popup>
            🏥 <b>{h.name}</b><br />
            {h.distanceKm} km away{h.phone ? <><br />📞 {h.phone}</> : ''}
          </Popup>
        </Marker>
      ))}

      {facilities && facilities.police && facilities.police.map((p) => (
        <Marker key={p.id} position={[p.lat, p.lon]} icon={policeIcon}>
          <Popup>
            🚓 <b>{p.name}</b><br />
            {p.distanceKm} km away{p.phone ? <><br />📞 {p.phone}</> : ''}
          </Popup>
        </Marker>
      ))}

      {safeRouteCoords && safeRouteCoords.length > 0 && (
        <>
          <Polyline
            positions={safeRouteCoords}
            pathOptions={{ color: '#22c55e', weight: 6, opacity: 0.95, dashArray: '12, 10', lineCap: 'round' }}
          />
          <FitBounds coordinates={safeRouteCoords} />
        </>
      )}
    </MapContainer>
  );
}
