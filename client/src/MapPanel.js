import React, { useCallback, useEffect, useRef, useState } from "react";
import { MapContainer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import Papa from "papaparse";
import "leaflet/dist/leaflet.css";
import marker2x from "leaflet/dist/images/marker-icon-2x.png";
import marker from "leaflet/dist/images/marker-icon.png";
import shadow from "leaflet/dist/images/marker-shadow.png";
import PropTypes from "prop-types";
import { DATA_BLOBS, MAP_MARKER_ASSETS, buildDataUrl } from "./config/dataSources";
import { fetchCachedCsvText } from "./utils/csvCache";
import AzureMapsBaseLayer from "./map/AzureMapsBaseLayer";
import MapTileWarmController from "./map/MapTileWarmController";
import { DEFAULT_AZURE_MAPS_TILESET_ID } from "./map/azureMapsTilesets";
import {
  DEFAULT_POPUP_LAYOUT,
  getAdaptivePopupLayout,
} from "./map/popupLayout";
import {
  MAP_DEFAULT_CENTER,
  MAP_DEFAULT_ZOOM,
  MAP_MAX_BOUNDS_VISCOSITY,
  MAP_MAX_ZOOM,
  MAP_MIN_ZOOM,
  NW_MICHIGAN_MAX_BOUNDS,
} from "./map/mapViewport";

/** Leaflet default icon fix */
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: marker2x,
  iconUrl: marker,
  shadowUrl: shadow,
});

function createMarkerIcon(iconUrl) {
  return new L.Icon({
    iconUrl,
    shadowUrl: shadow,
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41],
  });
}

/** Explicit colored marker icons */
const redIcon = createMarkerIcon(MAP_MARKER_ASSETS.default);
const greenIcon = createMarkerIcon(MAP_MARKER_ASSETS.selected);

const POPUP_CLOSE_DELAY_MS = 220;
const MAX_POPUP_LAYOUT_PASSES = 2;
const LIVE_POPUP_LAYOUT_EVENTS = ["move", "moveend", "zoom", "zoomend", "resize"];
const FIXED_TILESET_ID = DEFAULT_AZURE_MAPS_TILESET_ID;

function arePopupLayoutsEqual(left, right) {
  return (
    left?.className === right?.className &&
    left?.offset?.[0] === right?.offset?.[0] &&
    left?.offset?.[1] === right?.offset?.[1] &&
    left?.tipLeft === right?.tipLeft
  );
}

function getPopupOffset(offset) {
  if (Array.isArray(offset)) {
    return [Number(offset[0]) || 0, Number(offset[1]) || 0];
  }

  return [Number(offset?.x) || 0, Number(offset?.y) || 0];
}

function readPopupLayout(popupInstance) {
  const popupElement = popupInstance?.getElement?.();
  const rawTipLeft = popupElement?.style?.getPropertyValue("--map-site-popup-tip-left");
  const parsedTipLeft = Number.parseFloat(rawTipLeft);

  return {
    className: popupInstance?.options?.className || DEFAULT_POPUP_LAYOUT.className,
    offset: getPopupOffset(popupInstance?.options?.offset),
    tipLeft: Number.isFinite(parsedTipLeft) ? parsedTipLeft : DEFAULT_POPUP_LAYOUT.tipLeft,
  };
}

function writePopupLayout(popupInstance, layout) {
  if (!popupInstance) {
    return;
  }

  popupInstance.options.className = layout.className;
  popupInstance.options.offset = L.point(layout.offset);

  const popupElement = popupInstance.getElement?.();
  if (popupElement) {
    if (Number.isFinite(layout.tipLeft)) {
      popupElement.style.setProperty("--map-site-popup-tip-left", `${layout.tipLeft}px`);
    } else {
      popupElement.style.removeProperty("--map-site-popup-tip-left");
    }

    popupElement.className = [
      "leaflet-popup",
      layout.className,
      "leaflet-zoom-animated",
      popupInstance.options.interactive ? "leaflet-interactive" : "",
    ]
      .filter(Boolean)
      .join(" ");
  }
}

function MapPanel({ selectedSites = [], onMarkerClick }) {
  const [allLocations, setAllLocations] = useState([]);
  const [isBaseLayerReady, setIsBaseLayerReady] = useState(false);
  const [mapError, setMapError] = useState("");
  const markerRefs = useRef(new Map());
  const closeTimeouts = useRef(new Map());
  const popupLayoutFrames = useRef(new Map());
  const activePopupRef = useRef({
    mapInstance: null,
    markerInstance: null,
    siteName: "",
  });
  const livePopupLayoutHandlerRef = useRef(null);

  const clearPendingClose = (siteName) => {
    const timeoutId = closeTimeouts.current.get(siteName);
    if (timeoutId) {
      window.clearTimeout(timeoutId);
      closeTimeouts.current.delete(siteName);
    }
  };

  const scheduleClose = (siteName) => {
    clearPendingClose(siteName);
    const timeoutId = window.setTimeout(() => {
      markerRefs.current.get(siteName)?.closePopup();
      closeTimeouts.current.delete(siteName);
    }, POPUP_CLOSE_DELAY_MS);
    closeTimeouts.current.set(siteName, timeoutId);
  };

  const cancelPendingLayout = (siteName) => {
    const frameId = popupLayoutFrames.current.get(siteName);
    if (frameId) {
      window.cancelAnimationFrame(frameId);
      popupLayoutFrames.current.delete(siteName);
    }
  };

  const adjustPopupLayout = (siteName, markerInstance) => {
    const popupInstance = markerInstance?.getPopup?.();
    const popupElement = popupInstance?.getElement?.();
    const mapInstance = markerInstance?._map;
    const mapElement = mapInstance?.getContainer?.();
    const latLng = markerInstance?.getLatLng?.();

    if (!popupInstance || !popupElement || !mapInstance || !mapElement || !latLng) {
      return false;
    }

    const markerPoint = mapInstance.latLngToContainerPoint?.(latLng);
    const mapRect = mapElement.getBoundingClientRect();
    const popupRect = popupElement.getBoundingClientRect();
    const nextLayout = getAdaptivePopupLayout({
      currentLayout: readPopupLayout(popupInstance),
      popupRect,
      mapRect,
      markerScreenPoint:
        markerPoint && Number.isFinite(Number(markerPoint.y))
          ? {
              x: mapRect.left + Number(markerPoint.x || 0),
              y: mapRect.top + Number(markerPoint.y),
            }
          : null,
    });
    const currentLayout = readPopupLayout(popupInstance);

    if (arePopupLayoutsEqual(currentLayout, nextLayout)) {
      return false;
    }

    writePopupLayout(popupInstance, nextLayout);
    popupInstance.update();
    return true;
  };

  const schedulePopupLayoutAdjustment = (siteName, markerInstance, attempt = 0) => {
    cancelPendingLayout(siteName);

    const frameId = window.requestAnimationFrame(() => {
      popupLayoutFrames.current.delete(siteName);
      const layoutChanged = adjustPopupLayout(siteName, markerInstance);

      if (layoutChanged && attempt + 1 < MAX_POPUP_LAYOUT_PASSES) {
        schedulePopupLayoutAdjustment(siteName, markerInstance, attempt + 1);
      }
    });

    popupLayoutFrames.current.set(siteName, frameId);
  };

  const detachLivePopupLayoutTracking = () => {
    const mapInstance = activePopupRef.current.mapInstance;
    const liveHandler = livePopupLayoutHandlerRef.current;
    if (!mapInstance || !liveHandler) {
      livePopupLayoutHandlerRef.current = null;
      return;
    }

    LIVE_POPUP_LAYOUT_EVENTS.forEach((eventName) => {
      mapInstance.off(eventName, liveHandler);
    });
    livePopupLayoutHandlerRef.current = null;
  };

  const clearActivePopupTracking = (siteName) => {
    if (siteName && activePopupRef.current.siteName !== siteName) {
      return;
    }

    cancelPendingLayout(activePopupRef.current.siteName);
    detachLivePopupLayoutTracking();
    activePopupRef.current = {
      mapInstance: null,
      markerInstance: null,
      siteName: "",
    };
  };

  const trackActivePopup = (siteName, markerInstance) => {
    const previousSiteName = activePopupRef.current.siteName;
    const mapInstance = markerInstance?._map || null;
    const nextActivePopup = {
      mapInstance,
      markerInstance: markerInstance || null,
      siteName,
    };
    const previousMapInstance = activePopupRef.current.mapInstance;

    if (previousMapInstance && previousMapInstance !== mapInstance) {
      detachLivePopupLayoutTracking();
    }

    if (previousSiteName && previousSiteName !== siteName) {
      cancelPendingLayout(previousSiteName);
    }

    activePopupRef.current = nextActivePopup;

    if (!mapInstance) {
      return;
    }

    if (!livePopupLayoutHandlerRef.current) {
      livePopupLayoutHandlerRef.current = () => {
        const { markerInstance: activeMarker, siteName: activeSiteName } = activePopupRef.current;
        if (!activeMarker?.isPopupOpen?.() || !activeSiteName) {
          return;
        }

        schedulePopupLayoutAdjustment(activeSiteName, activeMarker);
      };

      LIVE_POPUP_LAYOUT_EVENTS.forEach((eventName) => {
        mapInstance.on(eventName, livePopupLayoutHandlerRef.current);
      });
    }
  };

  useEffect(() => {
    return () => {
      closeTimeouts.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
      closeTimeouts.current.clear();
      popupLayoutFrames.current.forEach((frameId) => window.cancelAnimationFrame(frameId));
      popupLayoutFrames.current.clear();
      detachLivePopupLayoutTracking();
    };
  }, []);

  const handleBaseLayerStatus = useCallback((status) => {
    if (status?.state === "loading") {
      setIsBaseLayerReady(false);
      setMapError("");
      return;
    }

    if (status?.state === "error") {
      setIsBaseLayerReady(false);
      setMapError(
        status.message ||
          "Basemap unavailable. Site markers remain available, but the background map could not be loaded."
      );
      return;
    }

    if (status?.state === "ready") {
      setIsBaseLayerReady(true);
      setMapError("");
    }
  }, []);

  const openPopupForMarker = (siteName, markerInstance) => {
    clearPendingClose(siteName);
    cancelPendingLayout(siteName);

    const popupInstance = markerInstance?.getPopup?.();
    writePopupLayout(popupInstance, DEFAULT_POPUP_LAYOUT);
    popupInstance?.update?.();
    trackActivePopup(siteName, markerInstance);
    markerInstance?.openPopup?.();
    schedulePopupLayoutAdjustment(siteName, markerInstance);
  };

  // Fetch locations once from the shipped static dataset
  useEffect(() => {
    const url = buildDataUrl(DATA_BLOBS.locations);
    let cancelled = false;

    const applyCsvText = (csvText) => {
      Papa.parse(csvText, {
        header: true,
        skipEmptyLines: true,
        complete: (result) => {
          if (cancelled) {
            return;
          }

          const locations = result.data
            .map((row) => {
              const urlField =
                row.url ||
                row.URL ||
                row.link ||
                row.Link ||
                row.website ||
                row.Website ||
                "";

              return {
                name: row.name || row.Location,
                lat: parseFloat(row.latitude) || parseFloat(row.Latitude),
                lng: parseFloat(row.longitude) || parseFloat(row.Longitude),
                avg_depth: row.avg_depth_ft
                  ? `${parseInt(row.avg_depth_ft, 10).toLocaleString()} ft`
                  : "N/A",
                max_depth: row.max_depth_ft
                  ? `${parseInt(row.max_depth_ft, 10).toLocaleString()} ft`
                  : "N/A",
                size: row.surface_area_acres
                  ? `${parseInt(row.surface_area_acres, 10).toLocaleString()} acres`
                  : "N/A",
                description: row.description || "No description available.",
                url: String(urlField).trim(),
              };
            })
            .filter((loc) => !isNaN(loc.lat) && !isNaN(loc.lng));
          setAllLocations(locations);
        },
      });
    };

    fetchCachedCsvText(url, { onFreshText: applyCsvText })
      .then(applyCsvText)
      .catch((error) => {
        console.error("Error loading locations CSV:", error);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="map-panel">
      <div className="map-panel-canvas">
        <MapContainer
          style={{ height: "100%" }}
          center={MAP_DEFAULT_CENTER}
          maxBounds={NW_MICHIGAN_MAX_BOUNDS}
          maxBoundsViscosity={MAP_MAX_BOUNDS_VISCOSITY}
          maxZoom={MAP_MAX_ZOOM}
          minZoom={MAP_MIN_ZOOM}
          zoom={MAP_DEFAULT_ZOOM}
          scrollWheelZoom
        >
          <AzureMapsBaseLayer
            onStatusChange={handleBaseLayerStatus}
            tilesetId={FIXED_TILESET_ID}
          />
          <MapTileWarmController
            isBaseLayerReady={isBaseLayerReady}
            tilesetId={FIXED_TILESET_ID}
          />

          {allLocations.map((loc) => {
            const isSelected = selectedSites.includes(loc.name);
            const icon = isSelected ? greenIcon : redIcon; // green = selected, red = unselected
            return (
              <Marker
                key={loc.name}
                position={[loc.lat, loc.lng]}
                icon={icon}
                ref={(instance) => {
                  if (instance) {
                    markerRefs.current.set(loc.name, instance);
                  } else {
                    markerRefs.current.delete(loc.name);
                  }
                }}
                eventHandlers={{
                  click: () => onMarkerClick && onMarkerClick(loc.name),
                  mouseover: (e) => {
                    openPopupForMarker(loc.name, e.target);
                  },
                  mouseout: () => scheduleClose(loc.name),
                  popupclose: () => clearActivePopupTracking(loc.name),
                }}
              >
                <Popup
                  autoPan={false}
                  className={DEFAULT_POPUP_LAYOUT.className}
                  keepInView={false}
                  offset={DEFAULT_POPUP_LAYOUT.offset}
                >
                  <div
                    onMouseEnter={() => clearPendingClose(loc.name)}
                    onMouseLeave={() => scheduleClose(loc.name)}
                  >
                    <h3>{loc.name}</h3>
                    <p>
                      <strong>Size:</strong> {loc.size}
                    </p>
                    <p>
                      <strong>Max Depth:</strong> {loc.max_depth}
                    </p>
                    <p>
                      <strong>Average Depth:</strong> {loc.avg_depth}
                    </p>
                    <p>
                      <strong>Description:</strong> {loc.description}
                    </p>
                    <p>
                      <strong>Contact Information:</strong>{" "}
                      {loc.url ? (
                        <a
                          href={/^https?:\/\//i.test(loc.url) ? loc.url : `https://${loc.url}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {loc.url}
                        </a>
                      ) : (
                        <em>(add site URL)</em>
                      )}
                    </p>
                  </div>
                </Popup>
              </Marker>
            );
          })}
        </MapContainer>

        {mapError ? (
          <div className="map-panel-status" role="alert">
            <strong>Basemap unavailable.</strong> {mapError}
          </div>
        ) : null}
      </div>
    </div>
  );
}

MapPanel.propTypes = {
  selectedSites: PropTypes.arrayOf(PropTypes.string).isRequired,
  onMarkerClick: PropTypes.func.isRequired,
};

export default MapPanel;
