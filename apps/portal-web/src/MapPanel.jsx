import React, { useCallback, useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import marker2x from "leaflet/dist/images/marker-icon-2x.png";
import marker from "leaflet/dist/images/marker-icon.png";
import shadow from "leaflet/dist/images/marker-shadow.png";
import PropTypes from "prop-types";
import { fetchSites } from "./api/platformApi";
import { MAP_MARKER_ASSETS } from "./config/dataSources";
import AzureMapsBaseLayer from "./map/AzureMapsBaseLayer";
import MapTileWarmController from "./map/MapTileWarmController";
import { useRuntimeConfig } from "./runtime/runtimeConfigContext";

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

const redIcon = createMarkerIcon(MAP_MARKER_ASSETS.default);
const greenIcon = createMarkerIcon(MAP_MARKER_ASSETS.selected);
const POPUP_CLOSE_DELAY_MS = 220;

function normalizeLocation(row = {}) {
  const urlField = row.url || row.website || "";

  return {
    name: String(row.name || "").trim(),
    lat: Number.parseFloat(row.latitude),
    lng: Number.parseFloat(row.longitude),
    avg_depth:
      row.avgDepthFt != null ? `${Number.parseFloat(row.avgDepthFt).toLocaleString()} ft` : "N/A",
    max_depth:
      row.maxDepthFt != null ? `${Number.parseFloat(row.maxDepthFt).toLocaleString()} ft` : "N/A",
    size:
      row.surfaceAreaAcres != null
        ? `${Number.parseFloat(row.surfaceAreaAcres).toLocaleString()} acres`
        : "N/A",
    description: row.description || "No description available.",
    url: String(urlField).trim(),
  };
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function buildPopupContent(loc) {
  const contactMarkup = loc.url
    ? `<a href="${escapeHtml(
        /^https?:\/\//i.test(loc.url) ? loc.url : `https://${loc.url}`
      )}" target="_blank" rel="noopener noreferrer">${escapeHtml(loc.url)}</a>`
    : "<em>Published site contact not available.</em>";

  return `
    <div class="map-site-popup-body" data-popup-body="site">
      <h3>${escapeHtml(loc.name)}</h3>
      <p><strong>Size:</strong> ${escapeHtml(loc.size)}</p>
      <p><strong>Max Depth:</strong> ${escapeHtml(loc.max_depth)}</p>
      <p><strong>Average Depth:</strong> ${escapeHtml(loc.avg_depth)}</p>
      <p><strong>Description:</strong> ${escapeHtml(loc.description)}</p>
      <p><strong>Contact Information:</strong> ${contactMarkup}</p>
    </div>
  `;
}

function MapPanel({ selectedSites = [], onMarkerClick }) {
  const { endpoints, map } = useRuntimeConfig();
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markerLayerRef = useRef(null);
  const markerRefs = useRef(new Map());
  const closeTimeouts = useRef(new Map());
  const popupCleanupRefs = useRef(new Map());
  const resizeObserverRef = useRef(null);
  const [allLocations, setAllLocations] = useState([]);
  const [isBaseLayerReady, setIsBaseLayerReady] = useState(false);
  const [mapError, setMapError] = useState("");
  const [mapInstance, setMapInstance] = useState(null);

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

  useEffect(() => {
    return () => {
      closeTimeouts.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
      closeTimeouts.current.clear();
      popupCleanupRefs.current.forEach((cleanup) => cleanup?.());
      popupCleanupRefs.current.clear();
      resizeObserverRef.current?.disconnect?.();
      resizeObserverRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) {
      return undefined;
    }

    const leafletMap = L.map(containerRef.current, {
      center: map.center,
      fadeAnimation: false,
      maxZoom: map.maxZoom,
      minZoom: map.minZoom,
      scrollWheelZoom: true,
      zoom: map.zoom,
    });

    mapRef.current = leafletMap;
    setMapInstance(leafletMap);
    markerLayerRef.current = L.layerGroup().addTo(leafletMap);
    leafletMap.invalidateSize();

    const invalidateSize = () => {
      leafletMap.invalidateSize();
    };

    if (typeof ResizeObserver === "function") {
      resizeObserverRef.current = new ResizeObserver(invalidateSize);
      resizeObserverRef.current.observe(containerRef.current);
    } else {
      window.addEventListener("resize", invalidateSize);
      resizeObserverRef.current = {
        disconnect: () => window.removeEventListener("resize", invalidateSize),
      };
    }

    return () => {
      resizeObserverRef.current?.disconnect?.();
      resizeObserverRef.current = null;
      leafletMap.remove();
      mapRef.current = null;
      markerLayerRef.current = null;
    };
  }, [map.center, map.maxZoom, map.minZoom, map.zoom]);

  useEffect(() => {
    if (!mapInstance) {
      return undefined;
    }

    mapInstance.setView(map.center, map.zoom, { animate: false });
    mapInstance.setMinZoom(map.minZoom);
    mapInstance.setMaxZoom(map.maxZoom);
    return undefined;
  }, [map.center, map.maxZoom, map.minZoom, map.zoom, mapInstance]);

  const handleBaseLayerStatus = useCallback(({ state, message }) => {
    if (state === "loading") {
      setIsBaseLayerReady(false);
      setMapError("");
      return;
    }

    if (state === "error") {
      setIsBaseLayerReady(false);
      setMapError(
        message ||
          "Basemap unavailable. Site markers remain available, but the background map could not be loaded."
      );
      return;
    }

    if (state === "ready") {
      setIsBaseLayerReady(true);
      setMapError("");
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    fetchSites(endpoints.sites)
      .then((rows) => {
        if (cancelled) {
          return;
        }

        const locations = rows
          .map(normalizeLocation)
          .filter((loc) => loc.name && Number.isFinite(loc.lat) && Number.isFinite(loc.lng));
        setAllLocations(locations);
      })
      .catch((error) => {
        console.error("Error loading sites:", error);
      });

    return () => {
      cancelled = true;
    };
  }, [endpoints.sites]);

  useEffect(() => {
    if (!mapInstance || !markerLayerRef.current) {
      return undefined;
    }

    markerLayerRef.current.clearLayers();
    popupCleanupRefs.current.forEach((cleanup) => cleanup?.());
    popupCleanupRefs.current.clear();
    markerRefs.current.clear();

    allLocations.forEach((loc) => {
      const markerIcon = selectedSites.includes(loc.name) ? greenIcon : redIcon;
      const markerInstance = L.marker([loc.lat, loc.lng], { icon: markerIcon });

      markerInstance.bindPopup(buildPopupContent(loc), {
        autoPan: false,
        className: "map-site-popup",
        closeButton: true,
        keepInView: false,
        offset: [0, 0],
      });
      markerInstance.on("click", () => onMarkerClick?.(loc.name));
      markerInstance.on("mouseover", () => {
        clearPendingClose(loc.name);
        markerInstance.openPopup();
      });
      markerInstance.on("mouseout", () => {
        scheduleClose(loc.name);
      });
      markerInstance.on("popupopen", () => {
        const popupElement = markerInstance.getPopup()?.getElement();
        const popupBody = popupElement?.querySelector("[data-popup-body='site']");
        if (!popupBody) {
          return;
        }

        const handleEnter = () => clearPendingClose(loc.name);
        const handleLeave = () => scheduleClose(loc.name);
        popupBody.addEventListener("mouseenter", handleEnter);
        popupBody.addEventListener("mouseleave", handleLeave);
        popupCleanupRefs.current.set(loc.name, () => {
          popupBody.removeEventListener("mouseenter", handleEnter);
          popupBody.removeEventListener("mouseleave", handleLeave);
        });
      });
      markerInstance.on("popupclose", () => {
        popupCleanupRefs.current.get(loc.name)?.();
        popupCleanupRefs.current.delete(loc.name);
        clearPendingClose(loc.name);
      });

      markerInstance.addTo(markerLayerRef.current);
      markerRefs.current.set(loc.name, markerInstance);
    });

    return () => {
      markerLayerRef.current?.clearLayers();
    };
  }, [allLocations, mapInstance, onMarkerClick, selectedSites]);

  useEffect(() => {
    markerRefs.current.forEach((markerInstance, siteName) => {
      markerInstance.setIcon(selectedSites.includes(siteName) ? greenIcon : redIcon);
    });
  }, [selectedSites]);

  return (
    <div className="map-panel">
      <div
        className="map-panel-canvas"
        ref={containerRef}
        role="region"
        aria-label="Monitoring site map"
      />

      {mapInstance ? (
        <>
          <AzureMapsBaseLayer
            map={mapInstance}
            onStatusChange={handleBaseLayerStatus}
            tilesetId={map.tilesetId}
          />
          <MapTileWarmController
            isBaseLayerReady={isBaseLayerReady}
            map={mapInstance}
            tilesetId={map.tilesetId}
          />
        </>
      ) : null}

      {mapError ? (
        <div className="map-panel-status" role="alert">
          <strong>Basemap unavailable.</strong> {mapError}
        </div>
      ) : null}
    </div>
  );
}

MapPanel.propTypes = {
  selectedSites: PropTypes.arrayOf(PropTypes.string).isRequired,
  onMarkerClick: PropTypes.func.isRequired,
};

export default MapPanel;
