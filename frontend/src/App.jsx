import React, { useState, useEffect, useRef } from 'react';
import Navbar from './components/Navbar.jsx';
import Sidebar from './components/Sidebar.jsx';
import MapView from './components/MapView.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import IncidentForm from './components/IncidentForm.jsx';
import EmergencyView from './components/EmergencyView.jsx';

import {
  geocodeLocation,
  getRoutes,
  formatDuration
} from './services/api.js';

import { fetchIncidents, removeIncident, submitResolutionProof } from './services/incidents.js';
import { isSameRoute, SAFER_ROUTE_THRESHOLD } from './services/routeRisk.js';
import { evaluateRouteRisk } from './services/routeRiskEngine.js';
import { predictMLRisk, buildMLFeatures } from './services/mlRisk.js';

import './App.css';

export default function App() {
  const [mode, setMode] = useState('normal');
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const [mobilePlannerOpen, setMobilePlannerOpen] = useState(false);

  useEffect(() => {
    const updateOnline = () => setIsOnline(navigator.onLine);
    window.addEventListener('online', updateOnline);
    window.addEventListener('offline', updateOnline);
    if ('serviceWorker' in navigator && import.meta.env.PROD) navigator.serviceWorker.register('/sw.js').catch(() => {});
    return () => {
      window.removeEventListener('online', updateOnline);
      window.removeEventListener('offline', updateOnline);
    };
  }, []);

  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem('theme') || 'dark';
    } catch {
      return 'dark';
    }
  });

  // ---------------------------------------------------------
  // THEME
  // ---------------------------------------------------------

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);

    try {
      localStorage.setItem('theme', theme);
    } catch {
      // Ignore localStorage errors
    }
  }, [theme]);

  // ---------------------------------------------------------
  // ROUTE STATES
  // ---------------------------------------------------------

  const [from, setFrom] = useState('Shillong, Meghalaya');
  const [to, setTo] = useState('Guwahati, Assam');
  const [travelMode, setTravelMode] = useState('car');

  const [userPosition, setUserPosition] = useState(null);
  const [userCoordsForRoute, setUserCoordsForRoute] = useState(null);

  const [locStatus, setLocStatus] = useState('');

  const [mapError, setMapError] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [routeInfo, setRouteInfo] = useState(null);
  const [routeCoords, setRouteCoords] = useState(null);
  const [routeOptions, setRouteOptions] = useState([]);
  const [routeOptionsLoading, setRouteOptionsLoading] = useState(false);
  const [selectedRouteIndex, setSelectedRouteIndex] = useState(0);

  const [fromMarker, setFromMarker] = useState(null);
  const [toMarker, setToMarker] = useState(null);

  // ---------------------------------------------------------
  // WEATHER
  // ---------------------------------------------------------

  const [weather, setWeather] = useState(null);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [weatherError, setWeatherError] = useState('');

  // ---------------------------------------------------------
  // RISK
  // ---------------------------------------------------------

  const [risk, setRisk] = useState(null);

  // ---------------------------------------------------------
  // INCIDENTS
  // ---------------------------------------------------------

  const [incidents, setIncidents] = useState([]);
  const [incidentsError, setIncidentsError] = useState('');

  const [showIncidentForm, setShowIncidentForm] = useState(false);

  // ---------------------------------------------------------
  // DISRUPTION / ALTERNATIVE ROUTE
  // ---------------------------------------------------------

  const [disruption, setDisruption] = useState(null);

  // ---------------------------------------------------------
  // MACHINE LEARNING
  // ---------------------------------------------------------

  const [mlRisk, setMlRisk] = useState(null);
  const [mlLoading, setMlLoading] = useState(false);
  const [mlError, setMlError] = useState('');

  // ---------------------------------------------------------
  // REAL-TIME REFRESH
  // ---------------------------------------------------------

  const REFRESH_INTERVAL_MS = 60000; // 1 minute

  const routeContextRef = useRef(null);
  const incidentsRef = useRef(incidents);
  const loadingRef = useRef(loading);
  const modeRef = useRef(mode);

  const isRefreshingRef = useRef(false);
  const refreshPendingRef = useRef(false);
  const isMountedRef = useRef(true);

  const findSaferAlternativeRef = useRef(null);

  useEffect(() => {
    incidentsRef.current = incidents;
  }, [incidents]);

  useEffect(() => {
    loadingRef.current = loading;
  }, [loading]);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // ---------------------------------------------------------
  // LOAD INCIDENTS
  // ---------------------------------------------------------

  const loadIncidents = async () => {
    try {
      const data = await fetchIncidents();

      setIncidents(data);
      setIncidentsError('');
    } catch (err) {
      setIncidentsError(
        err.message || 'Could not load incidents.'
      );
    }
  };

  useEffect(() => {
    loadIncidents();
  }, []);

  // ---------------------------------------------------------
  // USE MY LOCATION
  // ---------------------------------------------------------

  const handleUseMyLocation = () => {
    setLocStatus('Locating...');

    if (!navigator.geolocation) {
      setLocStatus('');

      setError(
        'Geolocation not supported. Please enter location manually.'
      );

      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const {
          latitude,
          longitude
        } = pos.coords;

        setUserPosition([
          latitude,
          longitude
        ]);

        setUserCoordsForRoute([
          latitude,
          longitude
        ]);

        setFrom(
          `My Location (${latitude.toFixed(4)}, ${longitude.toFixed(4)})`
        );

        setLocStatus('Location found ✅');
        setError('');
      },

      () => {
        setLocStatus('');

        setError(
          'Permission denied. Enter your location manually below.'
        );
      },

      {
        enableHighAccuracy: true,
        timeout: 8000
      }
    );
  };

  // ---------------------------------------------------------
  // FIND SAFER ALTERNATIVE
  // ---------------------------------------------------------

  const findSaferAlternative = async (
    fromCoords,
    toCoords,
    currentRoute,
    currentRisk,
    currentIsDisrupted
  ) => {
    try {
      const candidates = await getRoutes(
        fromCoords,
        toCoords,
        {
          alternatives: true
        }
      );

      const others = candidates.filter(
        (c) => !isSameRoute(c, currentRoute)
      );

      if (others.length === 0) {
        setDisruption({
          isDisrupted: currentIsDisrupted,
          altRoute: null,
          altRisk: null,
          altInfo: null,
          saferFound: false,
          noAlternativeFound: true,
          noAlternativeReason: 'The routing service returned no distinct alternate road for this trip.'
        });

        return;
      }

      let best = null;
      let bestRisk = null;

      for (const candidate of others) {
        const candidateRisk =
          await evaluateRouteRisk(
            candidate,
            incidentsRef.current,
            {
              terrainFactor: 20
            }
          );

        if (
          !bestRisk ||
          candidateRisk.score < bestRisk.score
        ) {
          best = candidate;
          bestRisk = candidateRisk;
        }
      }

      const riskReduction =
        currentRisk.score - bestRisk.score;

      const saferFound =
        riskReduction >= SAFER_ROUTE_THRESHOLD;

      setDisruption({
        isDisrupted: currentIsDisrupted,

        altRoute: saferFound ? best : null,

        altRisk: saferFound
          ? bestRisk
          : null,

        altInfo: saferFound
          ? {
              distance: `${best.distanceKm} km`,
              eta: formatDuration(best.durationMin)
            }
          : null,

        riskReduction: saferFound
          ? riskReduction
          : 0,

        saferFound,

        noAlternativeFound: !saferFound,
        noAlternativeReason: saferFound ? null : 'Alternate roads were found, but none had a lower estimated risk than the current route.'
      });

    } catch (err) {
      setDisruption({
        isDisrupted: currentIsDisrupted,
        altRoute: null,
        altRisk: null,
        altInfo: null,
        saferFound: false,
        noAlternativeFound: true,

        altError:
          err.message ||
          'Could not fetch alternative route.'
      });
    }
  };

  findSaferAlternativeRef.current =
    findSaferAlternative;

  // ---------------------------------------------------------
  // REAL-TIME ROUTE RISK + WEATHER REFRESH
  // ---------------------------------------------------------

  const refreshRouteRisk = async () => {
    const ctx = routeContextRef.current;

    if (!ctx) return;

    if (!isMountedRef.current) return;

    if (isRefreshingRef.current) {
      refreshPendingRef.current = true;
      return;
    }

    if (loadingRef.current) return;

    if (modeRef.current !== 'normal') return;

    isRefreshingRef.current = true;

    // Show refreshing state in Weather panel
    setWeatherLoading(true);

    try {
      /*
       * Re-evaluate the COMPLETE active route.
       *
       * This fetches fresh:
       * - Route weather
       * - Traffic
       * - Incidents
       * - Risk score
       */
      const updatedRisk =
        await evaluateRouteRisk(
          ctx.route,
          incidentsRef.current,
          {
            terrainFactor: 20
          }
        );

      if (
        !isMountedRef.current ||
        routeContextRef.current !== ctx
      ) {
        return;
      }

      // -----------------------------------------------------
      // UPDATE ROUTE RISK
      // -----------------------------------------------------

      setRisk(updatedRisk);

      // -----------------------------------------------------
      // UPDATE WEATHER FROM ROUTE
      // -----------------------------------------------------

      const routeWeather =
        updatedRisk?.weather?.worstCase || null;

      if (routeWeather) {
        setWeather(routeWeather);
        setWeatherError('');
      } else {
        setWeather(null);
        setWeatherError(
          'Route weather data unavailable.'
        );
      }

      // -----------------------------------------------------
      // CHECK ROUTE SAFETY
      // -----------------------------------------------------

      const routeUnsafe =
        updatedRisk.incidents.hasHighSeverity ||
        updatedRisk.incidents.nearbyCount > 0 ||
        updatedRisk.level === 'HIGH';

      if (routeUnsafe) {
        await findSaferAlternativeRef.current(
          ctx.fromCoords,
          ctx.toCoords,
          ctx.route,
          updatedRisk,
          updatedRisk.incidents.hasHighSeverity
        );
      } else {
        setDisruption(null);
      }

    } catch (err) {
      /*
       * Don't destroy existing UI when a background
       * refresh temporarily fails.
       */
      console.warn(
        'Real-time route refresh failed:',
        err
      );
    } finally {
      if (isMountedRef.current) {
        setWeatherLoading(false);
      }

      isRefreshingRef.current = false;
      if (refreshPendingRef.current && isMountedRef.current) {
        refreshPendingRef.current = false;
        window.setTimeout(() => refreshRouteRisk(), 0);
      }
    }
  };

  // ---------------------------------------------------------
  // ONE-MINUTE AUTO REFRESH
  // ---------------------------------------------------------

  useEffect(() => {
    const intervalId = setInterval(() => {
      refreshRouteRisk();
    }, REFRESH_INTERVAL_MS);

    return () => {
      clearInterval(intervalId);
    };
  }, []);

  // ---------------------------------------------------------
  // FIND ROUTE
  // ---------------------------------------------------------

  const handleFindRoute = async () => {
    if (!from || !to) {
      setError(
        'Please enter both From and To locations.'
      );

      return;
    }

    setError('');
    setLoading(true);

    // Pause real-time refresh until new route is ready
    routeContextRef.current = null;

    // Clear previous route information
    setRouteInfo(null);
    setRouteCoords(null);
    setRouteOptions([]);
    setRouteOptionsLoading(true);
    setSelectedRouteIndex(0);

    setFromMarker(null);
    setToMarker(null);

    // Clear previous weather
    setWeather(null);
    setWeatherLoading(true);
    setWeatherError('');

    // Clear risk
    setRisk(null);

    // Clear disruption
    setDisruption(null);

    // Clear ML
    setMlRisk(null);
    setMlError('');

    try {
      // -----------------------------------------------------
      // RESOLVE FROM LOCATION
      // -----------------------------------------------------

      let fromResolved;
      if (userCoordsForRoute && from.startsWith('My Location')) {
        fromResolved = { lat: userCoordsForRoute[0], lon: userCoordsForRoute[1], displayName: 'My Current Location' };
      } else {
        fromResolved = await geocodeLocation(from);
      }
      const toResolved = await geocodeLocation(to);

      setFromMarker(fromResolved);
      setToMarker(toResolved);

      // -----------------------------------------------------
      // GET ROUTE
      // -----------------------------------------------------

      const candidates = await getRoutes(
        [
          fromResolved.lat,
          fromResolved.lon
        ],

        [
          toResolved.lat,
          toResolved.lon
        ],
        { alternatives: travelMode === 'car', travelMode }
      );
      const route = candidates[0];
      const limitedCandidates = candidates.slice(0, 3);
      setRouteOptions(limitedCandidates.map((candidate, index) => ({ route: candidate, risk: null, index })));
      setRouteOptionsLoading(limitedCandidates.length > 1);

      setRouteCoords(
        route.coordinates
      );

      setRouteInfo({
        distance:
          `${route.distanceKm} km`,

        eta:
          formatDuration(
            route.durationMin
          ),
        detail: travelMode === 'train'
          ? `Rail timetable · ${route.transfers} transfer${route.transfers === 1 ? '' : 's'} · ${route.source}`
          : ''
      });

      setLoading(false);

      if (travelMode === 'train') {
        routeContextRef.current = null;
        setRouteOptions([]);
        setRouteOptionsLoading(false);
        setWeather(null);
        setWeatherLoading(false);
        setWeatherError('');
        setRisk(null);
        setMlRisk(null);
        setMlLoading(false);
        setMlError('');
        return;
      }

      // -----------------------------------------------------
      // SAVE ACTIVE ROUTE
      // -----------------------------------------------------

      const routeContext = {
        fromCoords: [
          fromResolved.lat,
          fromResolved.lon
        ],

        toCoords: [
          toResolved.lat,
          toResolved.lon
        ],

        route
      };

      routeContextRef.current =
        routeContext;

      // -----------------------------------------------------
      // ROUTE RISK
      // -----------------------------------------------------

      let currentRouteRisk = null;

      try {
        currentRouteRisk =
          await evaluateRouteRisk(
            route,
            incidentsRef.current,
            {
              terrainFactor: 20
            }
          );

        setRisk(currentRouteRisk);

        const alternatives = await Promise.all(limitedCandidates.slice(1).map(async (candidate, index) => {
          try {
            const candidateRisk = await evaluateRouteRisk(candidate, incidentsRef.current, { terrainFactor: 20 });
            return { route: candidate, risk: candidateRisk, index: index + 1 };
          } catch {
            return { route: candidate, risk: null, index: index + 1 };
          }
        }));
        setRouteOptions([
          { route, risk: currentRouteRisk, index: 0 },
          ...alternatives,
        ]);
        setRouteOptionsLoading(false);

        // ---------------------------------------------------
        // IMPORTANT:
        // WEATHER IS NOW FROM THE ENTIRE ROUTE,
        // NOT ONLY DESTINATION.
        // ---------------------------------------------------

        const routeWeather =
          currentRouteRisk?.weather?.worstCase ||
          null;

        if (routeWeather) {
          setWeather(routeWeather);
          setWeatherError('');
        } else {
          setWeather(null);

          setWeatherError(
            'Route weather data unavailable.'
          );
        }

      } catch (riskErr) {
        setRouteOptionsLoading(false);
        setWeatherError(
          riskErr.message ||
          'Could not evaluate route weather.'
        );
      } finally {
        setWeatherLoading(false);
      }

      // -----------------------------------------------------
      // MACHINE LEARNING
      // -----------------------------------------------------

      if (currentRouteRisk) {
        setMlLoading(true);

        try {
          /*
           * Use route weather first.
           * Destination weather is NO LONGER used.
           */
          const mlWeatherSource =
            currentRouteRisk?.weather?.worstCase || {};

          const mlFeatures =
            buildMLFeatures(
              mlWeatherSource,
              currentRouteRisk.incidents.items,
              65
            );

          const mlResult =
            await predictMLRisk(
              mlFeatures
            );

          setMlRisk(mlResult);

        } catch (mlErr) {
          setMlError(
            mlErr.message ||
            'ML prediction unavailable.'
          );
        } finally {
          setMlLoading(false);
        }

        // ---------------------------------------------------
        // CHECK ROUTE SAFETY
        // ---------------------------------------------------

        const routeUnsafe =
          currentRouteRisk.incidents.hasHighSeverity ||
          currentRouteRisk.incidents.nearbyCount > 0 ||
          currentRouteRisk.level === 'HIGH';

        if (routeUnsafe) {
          await findSaferAlternative(
            [
              fromResolved.lat,
              fromResolved.lon
            ],

            [
              toResolved.lat,
              toResolved.lon
            ],

            route,
            currentRouteRisk,

            currentRouteRisk.incidents.hasHighSeverity
          );
        } else {
          setDisruption(null);
        }
      }

    } catch (err) {
      setRouteOptionsLoading(false);
      setError(
        err.message ||
        'Something went wrong while finding the route.'
      );

      setLoading(false);
      setWeatherLoading(false);
    }
  };

  const handleSelectRouteOption = (option) => {
    if (!option?.risk) return;
    setSelectedRouteIndex(option.index);
    setRouteCoords(option.route.coordinates);
    setRouteInfo({ distance: `${option.route.distanceKm} km`, eta: formatDuration(option.route.durationMin) });
    setRisk(option.risk);
    setWeather(option.risk.weather?.worstCase || null);
    setWeatherError(option.risk.weather?.available ? '' : 'Route weather data unavailable.');
    const current = routeContextRef.current;
    if (current) routeContextRef.current = { ...current, route: option.route };
    setDisruption(null);
  };

  // ---------------------------------------------------------
  // UI
  // ---------------------------------------------------------

  const handleIncidentSubmitted = (incident) => {
    const updated = [incident, ...incidentsRef.current];
    incidentsRef.current = updated;
    setIncidents(updated);
    if (routeContextRef.current) window.setTimeout(() => refreshRouteRisk(), 150);
  };

  const handleRemoveIncident = async (incident) => {
    if (!incident?.canDelete || !window.confirm('Remove your incident report? This cannot be undone.')) return;
    try {
      await removeIncident(incident._id);
      const updated = incidentsRef.current.filter((item) => String(item._id) !== String(incident._id));
      incidentsRef.current = updated;
      setIncidents(updated);
      setIncidentsError('');
      if (routeContextRef.current) window.setTimeout(() => refreshRouteRisk(), 150);
    } catch (err) {
      setIncidentsError(err.message || 'Could not remove report.');
    }
  };

  const handleResolveIncident = async (incident) => {
    const proof = window.prompt('Explain why this incident is resolved (at least 20 characters). Your GPS must be within 5 km. A second nearby person must confirm.');
    if (proof == null) return;
    if (proof.trim().length < 20 || proof.trim().length > 500) {
      window.alert('Please enter a proof note between 20 and 500 characters.');
      return;
    }
    if (!navigator.geolocation) {
      window.alert('This browser cannot verify your location.');
      return;
    }
    try {
      const position = await new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 10000 }));
      const result = await submitResolutionProof(incident._id, {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        proof: proof.trim(),
      });
      const updated = incidentsRef.current.map((item) => String(item._id) === String(incident._id) ? { ...item, ...result } : item);
      incidentsRef.current = updated;
      setIncidents(updated);
      window.alert(result.verificationStatus === 'resolved'
        ? 'Incident marked resolved. It has been removed from the active map and route-risk calculation.'
        : `Proof saved (${result.resolutionCount}/2). One more nearby person must confirm before it is marked resolved.`);
      if (routeContextRef.current) window.setTimeout(() => refreshRouteRisk(), 150);
    } catch (err) {
      window.alert(err.code ? 'Could not verify location. Allow location access and try again.' : (err.message || 'Could not submit resolution proof.'));
    }
  };

  return (
    <ErrorBoundary>
      <div className="app-shell">

        {!isOnline && <div className="offline-banner" role="status" aria-live="polite">Offline — cached map tiles may appear; routes, incidents and live traffic/weather may be unavailable or stale.</div>}

        <Navbar
          mode={mode}
          setMode={setMode}
          theme={theme}
          setTheme={setTheme}
        />

        {mode === 'emergency' ? (

          <ErrorBoundary>
            <EmergencyView
              incidents={incidents}
            />
          </ErrorBoundary>

        ) : (

          <div className="app-body">

            <Sidebar
              className={`mobile-planner-sheet ${mobilePlannerOpen ? 'open' : 'closed'}`}
              from={from}
              to={to}

              setFrom={setFrom}
              setTo={setTo}

              onUseMyLocation={
                handleUseMyLocation
              }

              onFindRoute={
                handleFindRoute
              }

              travelMode={travelMode}
              setTravelMode={setTravelMode}

              locStatus={locStatus}

              routeInfo={routeInfo}
              routeOptions={routeOptions}
              routeOptionsLoading={routeOptionsLoading}
              selectedRouteIndex={selectedRouteIndex}
              onSelectRoute={(option) => { handleSelectRouteOption(option); setMobilePlannerOpen(false); }}

              loading={loading}

              error={error}

              weather={weather}
              weatherLoading={weatherLoading}
              weatherError={weatherError}

              risk={risk}

              disruption={disruption}

              mlRisk={mlRisk}
              mlLoading={mlLoading}
              mlError={mlError}
            />

            <div className="map-area">

              <button className={`mobile-planner-toggle ${mobilePlannerOpen ? 'open' : ''}`} aria-expanded={mobilePlannerOpen} onClick={() => setMobilePlannerOpen((open) => !open)}>
                {mobilePlannerOpen ? '✕ Close planner' : '☰ Route & risk'}
              </button>

              {mapError && (
                <div className="map-error-overlay">
                  ⚠️ {mapError}
                </div>
              )}

              {incidentsError && (
                <div
                  className="map-error-overlay"
                  style={{
                    top: mapError ? 60 : 16
                  }}
                >
                  ⚠️ {incidentsError}
                </div>
              )}

              {loading && (
                <div className="map-loading-overlay">
                  🔄 Fetching route from OSRM…
                </div>
              )}

              <button
                className="report-fab"
                onClick={() =>
                  setShowIncidentForm(true)
                }
              >
                🚧 Report Incident
              </button>

              <ErrorBoundary>
                <MapView
                  userPosition={userPosition}

                  routeCoords={routeCoords}

                  fromMarker={fromMarker}
                  toMarker={toMarker}

                  incidents={incidents}
                  trafficPoints={risk?.traffic?.points || []}
                  onRemoveIncident={handleRemoveIncident}
                  onResolveIncident={handleResolveIncident}

                  isDisrupted={
                    !!disruption?.isDisrupted
                  }

                  altRouteCoords={
                    disruption?.altRoute
                      ?.coordinates || null
                  }
                />
              </ErrorBoundary>

            </div>
          </div>
        )}

        {/* INCIDENT FORM */}

        {showIncidentForm && (
          <IncidentForm
            onClose={() =>
              setShowIncidentForm(false)
            }

            onSubmitted={handleIncidentSubmitted}
          />
        )}

      </div>
    </ErrorBoundary>
  );
}
