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
import {
  AZURE_MAPS_TILESET_OPTIONS,
  DEFAULT_AZURE_MAPS_TILESET_ID,
  normalizeAzureMapsTilesetId,
} from "./map/azureMapsTilesets";
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

function MapPanel({ selectedSites = [], onMarkerClick }) {
  const [allLocations, setAllLocations] = useState([]);
  const [isBaseLayerReady, setIsBaseLayerReady] = useState(false);
  const [mapError, setMapError] = useState("");
  const [selectedTilesetId, setSelectedTilesetId] = useState(DEFAULT_AZURE_MAPS_TILESET_ID);
  const markerRefs = useRef(new Map());
  const closeTimeouts = useRef(new Map());

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

  const handleTilesetChange = useCallback((event) => {
    setIsBaseLayerReady(false);
    setMapError("");
    setSelectedTilesetId(normalizeAzureMapsTilesetId(event.target.value));
  }, []);

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
      <div className="map-panel-toolbar">
        <div className="filter-dropdown map-panel-select-group">
          <label htmlFor="map-basemap-select">Basemap</label>
          <select
            id="map-basemap-select"
            className="year-select map-style-select"
            value={selectedTilesetId}
            onChange={handleTilesetChange}
          >
            {AZURE_MAPS_TILESET_OPTIONS.map(({ label, value }) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>

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
            tilesetId={selectedTilesetId}
          />
          <MapTileWarmController
            isBaseLayerReady={isBaseLayerReady}
            tilesetId={selectedTilesetId}
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
                    clearPendingClose(loc.name);
                    e.target.openPopup();
                  },
                  mouseout: () => scheduleClose(loc.name),
                }}
              >
                <Popup>
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
