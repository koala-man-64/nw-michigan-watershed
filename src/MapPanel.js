import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import Papa from 'papaparse';
import 'leaflet/dist/leaflet.css';

// Fix default icon issue in Leaflet with Webpack
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: require('leaflet/dist/images/marker-icon-2x.png'),
  iconUrl: require('leaflet/dist/images/marker-icon.png'),
  shadowUrl: require('leaflet/dist/images/marker-shadow.png'),
});

// Component to set initial bounds when map is created
function SetMapBounds({ bounds }) {
  const map = useMap();
  useEffect(() => {
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [20, 20] });
    }
    // Run only once at mount time
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, bounds]);
  return null;
}

function MapPanel({ selectedSites }) {
  const [allLocations, setAllLocations] = useState([]);

  // Load all locations from locations.csv on mount
  useEffect(() => {
    fetch('/locations.csv')
      .then(response => response.text())
      .then(csvText => {
        Papa.parse(csvText, {
          header: true,
          skipEmptyLines: true,
          complete: (result) => {
            // Assume CSV has columns: id, name, latitude, longitude (adjust field names if needed)
            const locations = result.data.map(row => ({
              name: row.name || row.Location, 
              lat: parseFloat(row.latitude) || parseFloat(row.Latitude),
              lng: parseFloat(row.longitude) || parseFloat(row.Longitude)
            })).filter(loc => !isNaN(loc.lat) && !isNaN(loc.lng));
            setAllLocations(locations);
          }
        });
      });
  }, []);

  // Calculate bounds to cover all locations
  const bounds = L.latLngBounds(allLocations.map(loc => [loc.lat, loc.lng]));

  // Filter locations that are selected (based on name)
  const selectedLocations = allLocations.filter(loc => selectedSites.includes(loc.name));

  return (
    <MapContainer style={{ height: '100%', width: '100%' }} scrollWheelZoom={true}>
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution="&copy; OpenStreetMap contributors"
      />
      {allLocations.length > 0 && <SetMapBounds bounds={bounds} />}
      {selectedLocations.map((loc, index) => (
        <Marker key={index} position={[loc.lat, loc.lng]}>
          <Popup>{loc.name}</Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}

export default MapPanel;
