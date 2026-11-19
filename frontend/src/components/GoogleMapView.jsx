import React, { useEffect, useRef, useState } from 'react';

const DEFAULT_CENTER = { lat: 25.7, lng: 91.8 };
let googleMapsPromise;

function loadGoogleMaps(key) {
  if (window.google?.maps) return Promise.resolve(window.google.maps);
  if (!googleMapsPromise) {
    googleMapsPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector('script[data-google-maps-api]');
      if (existing) {
        existing.addEventListener('load', () => resolve(window.google.maps), { once: true });
        existing.addEventListener('error', () => reject(new Error('Google Maps failed to load.')), { once: true });
        return;
      }
      const script = document.createElement('script');
      script.dataset.googleMapsApi = 'true';
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&loading=async&v=weekly`;
      script.async = true;
      script.onerror = () => reject(new Error('Google Maps failed to load.'));
      script.onload = () => window.google?.maps
        ? resolve(window.google.maps)
        : reject(new Error('Google Maps JavaScript API is unavailable.'));
      document.head.appendChild(script);
    });
  }
  return googleMapsPromise;
}

function toLatLng(point) {
  return Array.isArray(point) ? { lat: Number(point[0]), lng: Number(point[1]) } : { lat: Number(point.lat), lng: Number(point.lon) };
}

function trafficLineSegments(route, points) {
  if (!route?.length || !points?.length) return [];
  const nearestIndex = (point) => {
    let nearest = 0;
    let distance = Infinity;
    route.forEach(([lat, lon], index) => {
      const nextDistance = (lat - point.lat) ** 2 + (lon - point.lon) ** 2;
      if (nextDistance < distance) { distance = nextDistance; nearest = index; }
    });
    return nearest;
  };
  return points.slice(0, -1).flatMap((start, index) => {
    const end = points[index + 1];
    if (![start, end].every((point) => point.traffic && Number.isFinite(point.traffic.currentSpeed) && Number.isFinite(point.traffic.freeFlowSpeed) && point.traffic.freeFlowSpeed > 0)) return [];
    const first = nearestIndex(start);
    const last = nearestIndex(end);
    if (last <= first) return [];
    const ratio = ((start.traffic.currentSpeed / start.traffic.freeFlowSpeed) + (end.traffic.currentSpeed / end.traffic.freeFlowSpeed)) / 2;
    return [{ path: route.slice(first, last + 1).map(toLatLng), ratio,
      color: ratio >= 0.8 ? '#16a34a' : ratio >= 0.5 ? '#eab308' : '#dc2626',
      status: ratio >= 0.8 ? 'Low traffic · moving freely' : ratio >= 0.5 ? 'Moderate traffic · slower than usual' : 'High traffic · congested',
      currentSpeed: (start.traffic.currentSpeed + end.traffic.currentSpeed) / 2,
      freeFlowSpeed: (start.traffic.freeFlowSpeed + end.traffic.freeFlowSpeed) / 2 }];
  });
}

function popupContent(lines, action) {
  const root = document.createElement('div');
  root.style.cssText = 'font:14px/1.5 Arial,sans-serif;max-width:260px;color:#172033';
  lines.filter(Boolean).forEach((line, index) => {
    if (index) root.appendChild(document.createElement('br'));
    const text = document.createElement('span');
    text.textContent = line;
    root.appendChild(text);
  });
  const actions = Array.isArray(action) ? action : (action ? [action] : []);
  actions.forEach((item) => {
    root.appendChild(document.createElement('br'));
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = item.label;
    button.style.cssText = 'margin-top:6px;padding:5px 8px;cursor:pointer';
    button.addEventListener('click', item.onClick);
    root.appendChild(button);
  });
  return root;
}

export default function GoogleMapView(props) {
  const { userPosition, routeCoords, fromMarker, toMarker, incidents, isDisrupted,
    altRouteCoords, facilities, safeRouteCoords, trafficPoints = [], onRemoveIncident,
    onResolveIncident, onLoadError } = props;
  const mapElement = useRef(null);
  const mapRef = useRef(null);
  const [map, setMap] = useState(null);
  const [mapStyle, setMapStyle] = useState('roadmap');
  const [loadError, setLoadError] = useState('');
  const onLoadErrorRef = useRef(onLoadError);
  onLoadErrorRef.current = onLoadError;

  useEffect(() => {
    let cancelled = false;
    loadGoogleMaps(import.meta.env.VITE_GOOGLE_MAPS_API_KEY)
      .then((maps) => {
        if (cancelled || !mapElement.current) return;
        mapRef.current = new maps.Map(mapElement.current, {
          center: userPosition ? toLatLng(userPosition) : DEFAULT_CENTER,
          zoom: 8,
          mapTypeId: 'roadmap',
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          clickableIcons: false,
          gestureHandling: 'greedy',
        });
        setMap(mapRef.current);
        window.gm_authFailure = () => {
          if (!cancelled) {
            setLoadError('Google Maps API key rejected. Check Maps JavaScript API, billing, and Vercel domain restrictions.');
            onLoadErrorRef.current?.();
          }
        };
      })
      .catch((error) => {
        if (cancelled) return;
        setLoadError(error.message || 'Google Maps could not be loaded.');
        onLoadErrorRef.current?.();
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (map) map.setMapTypeId(mapStyle);
  }, [map, mapStyle]);

  useEffect(() => {
    if (!map || !window.google?.maps) return undefined;
    const maps = window.google.maps;
    const overlays = [];
    const infoWindow = new maps.InfoWindow();
    const marker = (point, label, color, title, lines, action) => {
      if (!point || !Number.isFinite(point.lat) || !Number.isFinite(point.lng)) return;
      const item = new maps.Marker({
        map, position: point, title, label: { text: label, color: '#fff', fontWeight: '700', fontSize: '13px' },
        icon: { path: maps.SymbolPath.CIRCLE, scale: label.length > 1 ? 16 : 14, fillColor: color, fillOpacity: 1, strokeColor: '#fff', strokeWeight: 2 },
      });
      item.addListener('click', () => {
        infoWindow.setContent(popupContent(lines, action));
        infoWindow.open({ map, anchor: item });
      });
      overlays.push(item);
    };
    const line = (path, color, weight = 6, opacity = 0.95, onClick) => {
      if (!path?.length) return;
      const item = new maps.Polyline({ map, path: path.map(toLatLng), strokeColor: color, strokeOpacity: opacity, strokeWeight: weight, clickable: !!onClick, geodesic: true });
      if (onClick) item.addListener('click', (event) => {
        infoWindow.setContent(popupContent(onClick));
        infoWindow.setPosition(event.latLng);
        infoWindow.open({ map });
      });
      overlays.push(item);
    };

    const segments = trafficLineSegments(routeCoords, trafficPoints);
    if (routeCoords?.length) {
      line(routeCoords, segments.length ? '#cbd5e1' : (isDisrupted ? '#ef4444' : '#3b82f6'), segments.length ? 9 : 6);
      segments.forEach((segment) => line(segment.path, segment.color, 7, 0.98, [
        segment.status,
        `Estimated speed: ${Math.round(segment.currentSpeed)} km/h`,
        `Free-flow speed: ${Math.round(segment.freeFlowSpeed)} km/h`,
        `Speed vs free flow: ${Math.round(segment.ratio * 100)}%`,
      ]));
    }
    if (altRouteCoords?.length) line(altRouteCoords, '#22c55e', 6, 0.95);
    if (safeRouteCoords?.length) line(safeRouteCoords, '#16a34a', 7, 0.98);
    if (userPosition) marker(toLatLng(userPosition), '📍', '#2563eb', 'You are here', ['You are here']);
    if (fromMarker) marker(toLatLng(fromMarker), 'A', '#16a34a', `Start: ${fromMarker.displayName}`, [`Start: ${fromMarker.displayName}`]);
    if (toMarker) marker(toLatLng(toMarker), 'B', '#dc2626', `Destination: ${toMarker.displayName}`, [`Destination: ${toMarker.displayName}`]);
    (incidents || []).filter((item) => item.verificationStatus !== 'resolved').forEach((incident) => {
      const status = incident.verificationStatus === 'verified' ? 'Verified report' : 'Unverified community report';
      const actions = [];
      if (onResolveIncident) actions.push({ label: 'Suggest resolved (GPS + proof)', onClick: () => onResolveIncident(incident) });
      if (incident.canDelete && onRemoveIncident) actions.push({ label: 'Remove my report', onClick: () => onRemoveIncident(incident) });
      marker(toLatLng(incident), '⚠', incident.severity === 'High' ? '#dc2626' : incident.severity === 'Low' ? '#ca8a04' : '#ea580c', `${incident.type} — ${incident.severity}`, [incident.type, `${incident.severity} severity`, incident.description, status], actions);
    });
    (facilities?.hospitals || []).forEach((hospital) => marker(toLatLng(hospital), '🏥', '#0284c7', hospital.name, [hospital.name, `${hospital.distanceKm} km away`, hospital.phone ? `Phone: ${hospital.phone}` : '']));
    (facilities?.police || []).forEach((station) => marker(toLatLng(station), '🚓', '#334155', station.name, [station.name, `${station.distanceKm} km away`, station.phone ? `Phone: ${station.phone}` : '']));

    const boundsPoints = [...(routeCoords || []), ...(safeRouteCoords || []), ...(altRouteCoords || [])].map(toLatLng);
    if (boundsPoints.length) {
      const bounds = new maps.LatLngBounds();
      boundsPoints.forEach((point) => bounds.extend(point));
      map.fitBounds(bounds, 48);
    } else if (userPosition) {
      map.panTo(toLatLng(userPosition));
      map.setZoom(14);
    }
    return () => overlays.forEach((overlay) => overlay.setMap(null));
  }, [map, userPosition, routeCoords, fromMarker, toMarker, incidents, isDisrupted, altRouteCoords, facilities, safeRouteCoords, trafficPoints, onRemoveIncident, onResolveIncident]);

  return (
    <div className="google-map-wrap">
      <div ref={mapElement} className="google-map-canvas" aria-label="Google map" />
      <div className="google-map-style-picker" role="group" aria-label="Map style">
        <button type="button" aria-pressed={mapStyle === 'roadmap'} className={mapStyle === 'roadmap' ? 'active' : ''} onClick={() => setMapStyle('roadmap')}>Road</button>
        <button type="button" aria-pressed={mapStyle === 'hybrid'} className={mapStyle === 'hybrid' ? 'active' : ''} onClick={() => setMapStyle('hybrid')}>Satellite</button>
      </div>
      {trafficLineSegments(routeCoords, trafficPoints).length > 0 && <div className="google-traffic-legend"><b>TomTom live traffic</b><span>🟢 Low · moving freely</span><span>🟡 Moderate · slower</span><span>🔴 High · congested</span><small>Click a colored route section for speed details</small></div>}
      {loadError && <div className="google-map-error" role="status">{loadError}</div>}
    </div>
  );
}
