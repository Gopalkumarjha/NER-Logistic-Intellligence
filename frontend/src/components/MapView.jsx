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

// Base tile layer: public OpenStreetMap raster tiles. No API key or token
// required.
function BaseTileLayer() {
  return (
    <TileLayer
      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      maxZoom={19}
    />
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

export default function MapView({
  userPosition, routeCoords, fromMarker, toMarker, incidents,
  isDisrupted, altRouteCoords, facilities, safeRouteCoords
}) {
  return (
    <MapContainer center={DEFAULT_CENTER} zoom={8} scrollWheelZoom={true} zoomControl={false}>
      <BaseTileLayer />
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
              color: isDisrupted ? '#ef4444' : '#3b82f6',
              weight: 6,
              opacity: 0.9,
              lineCap: 'round',
              lineJoin: 'round',
            }}
          />
          <FitBounds coordinates={altRouteCoords || routeCoords} />
        </>
      )}

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

      {incidents && incidents.map((inc) => (
        <Marker
          key={inc._id}
          position={[inc.lat, inc.lon]}
          icon={incidentIcons[inc.severity] || incidentIcons.Medium}
        >
          <Popup>
            <b>{inc.type}</b> — {inc.severity} severity<br />
            {inc.description && <>{inc.description}<br /></>}
            <span style={{ fontSize: '11px', color: '#666' }}>
              {new Date(inc.createdAt).toLocaleString()}
            </span>
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
