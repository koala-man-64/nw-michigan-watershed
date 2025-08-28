import React, { useEffect, useState, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import Papa from 'papaparse';
import 'leaflet/dist/leaflet.css';

/**
 * Leaflet default icon fix.
 *
 * When bundling Leaflet with Webpack/Vite the default icon paths can
 * become undefined.  Here we explicitly configure the default icon
 * URLs once at module scope so they are applied to all markers that
 * don't specify a custom icon.  See:
 * https://github.com/PaulLeCam/react-leaflet/issues/453
 */
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: require('leaflet/dist/images/marker-icon-2x.png'),
  iconUrl: require('leaflet/dist/images/marker-icon.png'),
  shadowUrl: require('leaflet/dist/images/marker-shadow.png'),
});

/**
 * Custom icon used for all map markers.  You can adjust the colors by
 * changing the URL or provide two icons: one for selected markers and
 * one for unselected markers.
 */
const salmonIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png',
  shadowUrl: require('leaflet/dist/images/marker-shadow.png'),
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

/**
 * SetMapBounds
 * ------------
 * This helper component calls `fitBounds` on the map instance whenever
 * the provided `bounds` prop changes.  It must be a child of
 * MapContainer so that `useMap` can access the map instance.
 */
function SetMapBounds({ bounds }) {
  const map = useMap();
  useEffect(() => {
    if (bounds && bounds.isValid()) {
      map.fitBounds(bounds);
    }
  }, [map, bounds]);
  return null;
}

/**
 * Constants for Azure Blob Storage used by the map.  Keeping these at
 * module scope means they are not recreated on each render.  If the
 * SAS token expires, update it here.
 */
const STORAGE_ACCOUNT = 'nwmiwsstorageaccount';
const CONTAINER_NAME = 'nwmiws';
const SAS_TOKEN = 'sv=2024-11-04&ss=bfqt&srt=sco&sp=rwdlacupiytfx&se=2055-03-28T12:14:21Z&st=2025-03-28T04:14:21Z&spr=https&sig=c2vDu7jiNSYQ2FTY5Dr9VEB7G%2BR8wVEHnveaXwNFE5k%3D';

/**
 * MapPanel
 * --------
 * Displays an interactive Leaflet map with markers for each location
 * loaded from an Azure‑hosted CSV.  When a marker is clicked the
 * provided `onMarkerClick` callback is invoked with the location name,
 * allowing the parent to toggle its selected state.  Selected markers
 * are highlighted via opacity and could be styled differently by
 * supplying separate icons.
 *
 * Props:
 *  - selectedSites: string[]
 *      Names of the currently selected locations.  Used to style
 *      markers and determine whether bounds should be fit to all
 *      locations.
 *  - selectedParameters: string[]
 *      Currently unused but available for future enhancements (e.g.
 *      filtering water quality info shown in the popup).
 *  - onMarkerClick: (name: string) => void
 *      Called when the user clicks a marker.  Typically updates
 *      selectedSites in the parent component.
 */
function MapPanel({ selectedSites = [], selectedParameters, onMarkerClick }) {
  const [allLocations, setAllLocations] = useState([]);
  const [waterData, setWaterData] = useState([]);

  // Fetch locations exactly once.  The CSV is expected to contain
  // columns such as `name`/`Location`, `latitude`/`Latitude`, and
  // `longitude`/`Longitude`.  Additional columns are optional but
  // parsed for display in the popup.
  useEffect(() => {
    const url = `https://${STORAGE_ACCOUNT}.blob.core.windows.net/${CONTAINER_NAME}/locations.csv?${SAS_TOKEN}`;
    fetch(url)
      .then((response) => response.text())
      .then((csvText) => {
        Papa.parse(csvText, {
          header: true,
          skipEmptyLines: true,
          complete: (result) => {
            const locations = result.data
              .map((row) => ({
                name: row.name || row.Location,
                lat: parseFloat(row.latitude) || parseFloat(row.Latitude),
                lng: parseFloat(row.longitude) || parseFloat(row.Longitude),
                avg_depth: row.avg_depth_ft ? `${parseInt(row.avg_depth_ft, 10).toLocaleString()} ft` : 'N/A',
                max_depth: row.max_depth_ft ? `${parseInt(row.max_depth_ft, 10).toLocaleString()} ft` : 'N/A',
                size: row.surface_area_acres ? `${parseInt(row.surface_area_acres, 10).toLocaleString()} acres` : 'N/A',
                description: row.description || 'No description available.',
              }))
              .filter((loc) => !isNaN(loc.lat) && !isNaN(loc.lng));
            setAllLocations(locations);
          },
        });
      })
      .catch((error) => {
        console.error('Error loading locations CSV:', error);
      });
  }, []);

  // Fetch water quality data exactly once.  The resulting data is not
  // currently displayed but could be used to augment the popup or
  // filter markers based on selected parameters.
  useEffect(() => {
    const waterUrl = `https://${STORAGE_ACCOUNT}.blob.core.windows.net/${CONTAINER_NAME}/water_quality_data.csv?${SAS_TOKEN}`;
    fetch(waterUrl)
      .then((response) => response.text())
      .then((csvText) => {
        Papa.parse(csvText, {
          header: true,
          skipEmptyLines: true,
          complete: (result) => {
            setWaterData(result.data);
          },
        });
      })
      .catch((error) => {
        console.error('Error loading water quality CSV:', error);
      });
  }, []);

  /**
   * Compute the map bounds.  If no sites are selected the map will
   * automatically fit the bounds of all locations.  Otherwise we
   * return null and let the default centre/zoom take over.  This
   * computation is memoised so that it only re‑runs when the
   * dependencies change.
   */
  const bounds = useMemo(() => {
    if (selectedSites && selectedSites.length === 0 && allLocations.length > 0) {
      return L.latLngBounds(allLocations.map((loc) => [loc.lat, loc.lng]));
    }
    return null;
  }, [selectedSites, allLocations]);

  // Default centre and zoom when no bounds can be calculated.  If
  // bounds is provided MapContainer will ignore these values and
  // centre/zoom based on the bounds instead.
  const defaultCenter = [42.5, -86.0];
  const defaultZoom = 8;

  return (
    <MapContainer
      style={{ height: '100%' }}
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
        return (
          <Marker
            key={loc.name}
            position={[loc.lat, loc.lng]}
            opacity={isSelected ? 1.0 : 0.5}
            icon={salmonIcon}
            eventHandlers={{
              click: () => {
                if (onMarkerClick) {
                  onMarkerClick(loc.name);
                }
              },
              mouseover: (e) => e.target.openPopup(),
              mouseout: (e) => e.target.closePopup(),
            }}
          >
            <Popup>
              <div>
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
              </div>
            </Popup>
          </Marker>
        );
      })}
    </MapContainer>
  );
}

export default MapPanel;
