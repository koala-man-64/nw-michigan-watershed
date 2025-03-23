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
    if (bounds && bounds.isValid()) {
      map.fitBounds(bounds, { padding: [20, 20] });
    }
  }, [map, bounds]);
  return null;
}

function MapPanel({ selectedSites }) {
  const [allLocations, setAllLocations] = useState([]);

  // Azure Blob Storage configuration variables
  const storageAccountName = "ppastorageaccount159";
  const sasToken = "sv=2024-11-04&ss=bfqt&srt=sco&sp=rwd&se=2045-03-20T12:52:05Z&st=2025-03-13T04:52:05Z&spr=https,http&sig=7lAkSTM%2F7Gd4RCmeLiUXqAfNsWYrZx65sJnnrFDAxpo%3D";
  const containerName = "nwmiws";
  
  // Load all locations from locations.csv in Azure Blob Storage on mount.
  useEffect(() => {
    const url = `https://${storageAccountName}.blob.core.windows.net/${containerName}/locations.csv?${sasToken}`;
    fetch(url)
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
      })
      .catch(error => {
        console.error("Error loading locations CSV:", error);
      });
  }, [storageAccountName, containerName, sasToken]);

  // Filter locations that are selected (based on name)
  const selectedLocations = allLocations.filter(loc => selectedSites.includes(loc.name));

  // Calculate bounds based on selected locations if available.
  let bounds = null;
  if (selectedLocations.length > 0) {
    bounds = L.latLngBounds(selectedLocations.map(loc => [loc.lat, loc.lng]));
  }

  // Default center and zoom when no datapoints are selected.
  const defaultCenter = [42.5, -86.0]; // adjust as needed
  const defaultZoom = 8;

  return (
    <MapContainer
      style={{ height: '100%', width: '100%' }}
      center={bounds ? undefined : defaultCenter}
      zoom={bounds ? undefined : defaultZoom}
      scrollWheelZoom={true}
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution="&copy; OpenStreetMap contributors"
      />
      {/* Fit bounds only when selected locations exist */}
      {bounds && <SetMapBounds bounds={bounds} />}
      {selectedLocations.map((loc, index) => (
        <Marker key={index} position={[loc.lat, loc.lng]}>
          <Popup>{loc.name}</Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}

export default MapPanel;