import React, { useState, useEffect, useRef } from 'react';
import Navbar from './components/Navbar.jsx';
import Sidebar from './components/Sidebar.jsx';
import MapView from './components/MapView.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import IncidentForm from './components/IncidentForm.jsx';
import EmergencyView from './components/EmergencyView.jsx';

import {
  geocodeLocation,
  getRoute,
  getRoutes,
  formatDuration
} from './services/api.js';

import { fetchIncidents } from './services/incidents.js';
import { isSameRoute, SAFER_ROUTE_THRESHOLD } from './services/routeRisk.js';
import { evaluateRouteRisk } from './services/routeRiskEngine.js';
import { predictMLRisk, buildMLFeatures } from './services/mlRisk.js';

import './App.css';

export default function App() {
  const [mode, setMode] = useState('normal');

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

  const [userPosition, setUserPosition] = useState(null);
  const [userCoordsForRoute, setUserCoordsForRoute] = useState(null);

  const [locStatus, setLocStatus] = useState('');

  const [mapError, setMapError] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [routeInfo, setRouteInfo] = useState(null);
  const [routeCoords, setRouteCoords] = useState(null);

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
          noAlternativeFound: true
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

        noAlternativeFound: !saferFound
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

    if (isRefreshingRef.current) return;

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

      if (
        userCoordsForRoute &&
        from.startsWith('My Location')
      ) {
        fromResolved = {
          lat: userCoordsForRoute[0],
          lon: userCoordsForRoute[1],
          displayName: 'My Current Location'
        };
      } else {
        fromResolved =
          await geocodeLocation(from);
      }

      // -----------------------------------------------------
      // RESOLVE DESTINATION
      // -----------------------------------------------------

      const toResolved =
        await geocodeLocation(to);

      setFromMarker(fromResolved);
      setToMarker(toResolved);

      // -----------------------------------------------------
      // GET ROUTE
      // -----------------------------------------------------

      const route = await getRoute(
        [
          fromResolved.lat,
          fromResolved.lon
        ],

        [
          toResolved.lat,
          toResolved.lon
        ]
      );

      setRouteCoords(
        route.coordinates
      );

      setRouteInfo({
        distance:
          `${route.distanceKm} km`,

        eta:
          formatDuration(
            route.durationMin
          )
      });

      setLoading(false);

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
      setError(
        err.message ||
        'Something went wrong while finding the route.'
      );

      setLoading(false);
      setWeatherLoading(false);
    }
  };

  // ---------------------------------------------------------
  // UI
  // ---------------------------------------------------------

  return (
    <ErrorBoundary>
      <div className="app-shell">

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

              locStatus={locStatus}

              routeInfo={routeInfo}

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

            onSubmitted={(incident) =>
              setIncidents((prev) => [
                incident,
                ...prev
              ])
            }
          />
        )}

      </div>
    </ErrorBoundary>
  );
}