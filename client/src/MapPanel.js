import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import marker2x from "leaflet/dist/images/marker-icon-2x.png";
import marker from "leaflet/dist/images/marker-icon.png";
import shadow from "leaflet/dist/images/marker-shadow.png";
import PropTypes from "prop-types";

/** Leaflet default icon fix */
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: marker2x,
  iconUrl: marker,
  shadowUrl: shadow,
});

/** Explicit colored marker icons */
const redIcon = new L.Icon({
  iconUrl:
    "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png",
  shadowUrl: shadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

const greenIcon = new L.Icon({
  iconUrl:
    "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-green.png",
  shadowUrl: shadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

const POPUP_CLOSE_DELAY_MS = 200;

function SetMapBounds({ bounds }) {
  const map = useMap();
  useEffect(() => {
    if (bounds && bounds.isValid()) {
      map.fitBounds(bounds);
    }
  }, [map, bounds]);
  return null;
}
SetMapBounds.propTypes = {
  bounds: PropTypes.object,
};

function MapPanel({ selectedSites = [], onMarkerClick, locations = [], loadError = null }) {
  const popupCloseTimersRef = useRef(new Map());

  const clearPopupCloseTimer = useCallback((siteName) => {
    const timerId = popupCloseTimersRef.current.get(siteName);
    if (timerId != null) {
      window.clearTimeout(timerId);
      popupCloseTimersRef.current.delete(siteName);
    }
  }, []);

  const schedulePopupClose = useCallback((siteName, closePopup) => {
    clearPopupCloseTimer(siteName);
    const timerId = window.setTimeout(() => {
      popupCloseTimersRef.current.delete(siteName);
      closePopup();
    }, POPUP_CLOSE_DELAY_MS);
    popupCloseTimersRef.current.set(siteName, timerId);
  }, [clearPopupCloseTimer]);

  useEffect(() => () => {
    popupCloseTimersRef.current.forEach((timerId) => window.clearTimeout(timerId));
    popupCloseTimersRef.current.clear();
  }, []);
  const allLocations = useMemo(() => (
    Array.isArray(locations) ? locations : []
  ), [locations]);

  // Compute bounds if no selection
  const bounds = useMemo(() => {
    if (selectedSites && selectedSites.length === 0 && allLocations.length > 0) {
      return L.latLngBounds(allLocations.map((loc) => [loc.lat, loc.lng]));
    }
    return null;
  }, [selectedSites, allLocations]);

  const defaultCenter = [42.5, -86.0];
  const defaultZoom = 8;

  return (
    <div style={{ position: "relative", display: "flex", flex: 1, minHeight: 0 }}>
      {loadError && (
        <div
          role="alert"
          style={{
            position: "absolute",
            top: 12,
            left: 12,
            right: 12,
            zIndex: 500,
            padding: 12,
            borderRadius: 8,
            background: "#fff4e5",
            border: "1px solid #f0b429",
            color: "#8a4b08",
          }}
        >
          {loadError}
        </div>
      )}

      <MapContainer
        style={{ flex: 1, height: "100%", width: "100%" }}
        center={bounds ? undefined : defaultCenter}
        zoom={bounds ? undefined : defaultZoom}
        scrollWheelZoom
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution="&copy; OpenStreetMap contributors"
        />
        {bounds && <SetMapBounds bounds={bounds} />}

        {allLocations.map((loc) => {
          const isSelected = selectedSites.includes(loc.name);
          const icon = isSelected ? greenIcon : redIcon;
          return (
            <Marker
              key={loc.name}
              position={[loc.lat, loc.lng]}
              icon={icon}
              eventHandlers={{
                click: () => onMarkerClick && onMarkerClick(loc.name),
                mouseover: (e) => {
                  clearPopupCloseTimer(loc.name);
                  e.target.openPopup();
                },
                mouseout: (e) => {
                  schedulePopupClose(loc.name, () => e.target.closePopup());
                },
              }}
            >
              <Popup
                interactive
                eventHandlers={{
                  mouseover: () => clearPopupCloseTimer(loc.name),
                  mouseout: (e) => {
                    schedulePopupClose(loc.name, () => e.target.close());
                  },
                }}
              >
                <div>
                  <h3>{loc.name}</h3>
                  <p>
                    <strong>Size:</strong> {loc.size}
                  </p>
                  <p>
                    <strong>Max Depth:</strong> {loc.maxDepth}
                  </p>
                  <p>
                    <strong>Average Depth:</strong> {loc.avgDepth}
                  </p>
                  <p>
                    <strong>Description:</strong> {loc.description}
                  </p>
                  <p>
                    <strong>Website:</strong>{" "}
                    {loc.href ? (
                      <a
                        href={loc.href}
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
    </div>
  );
}

MapPanel.propTypes = {
  selectedSites: PropTypes.arrayOf(PropTypes.string).isRequired,
  onMarkerClick: PropTypes.func.isRequired,
  locations: PropTypes.arrayOf(PropTypes.shape({
    name: PropTypes.string.isRequired,
    lat: PropTypes.number.isRequired,
    lng: PropTypes.number.isRequired,
    size: PropTypes.string,
    maxDepth: PropTypes.string,
    avgDepth: PropTypes.string,
    description: PropTypes.string,
    url: PropTypes.string,
    href: PropTypes.string,
  })),
  loadError: PropTypes.string,
};

export default MapPanel;
