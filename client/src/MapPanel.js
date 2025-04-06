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

const salmonIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png',
  shadowUrl: require('leaflet/dist/images/marker-shadow.png'),
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

// Component to set map bounds when the map is created
function SetMapBounds({ bounds }) {
  const map = useMap();
  useEffect(() => {
    if (bounds && bounds.isValid()) {
      map.fitBounds(bounds, { padding: [20, 20] });
    }
  }, [map, bounds]);
  return null;
}

function MapPanel({ selectedSites, selectedParameters, onMarkerClick }) {
  const [allLocations, setAllLocations] = useState([]);
  const [waterData, setWaterData] = useState([]);

  // Azure Blob Storage configuration variables
  const storageAccountName = "nwmiwsstorageaccount";
  const sasToken = "sv=2024-11-04&ss=bfqt&srt=sco&sp=rwdlacupiytfx&se=2055-03-28T12:14:21Z&st=2025-03-28T04:14:21Z&spr=https&sig=c2vDu7jiNSYQ2FTY5Dr9VEB7G%2BR8wVEHnveaXwNFE5k%3D";
  const containerName = "nwmiws";
  
  // 1. Load locations from locations.csv
  useEffect(() => {
    const url = `https://${storageAccountName}.blob.core.windows.net/${containerName}/locations.csv?${sasToken}`;
    fetch(url)
      .then(response => response.text())
      .then(csvText => {
        Papa.parse(csvText, {
          header: true,
          skipEmptyLines: true,
          complete: (result) => {
            // Assume CSV has columns: name, latitude, longitude
            const locations = result.data.map(row => ({
              name: row.name || row.Location, 
              lat: parseFloat(row.latitude) || parseFloat(row.Latitude),
              lng: parseFloat(row.longitude) || parseFloat(row.Longitude),
              avg_depth: parseInt(row.avg_depth_ft).toLocaleString() + ' ft',
              max_depth: parseInt(row.max_depth_ft).toLocaleString() + ' ft',
              size: parseInt(row.surface_area_acres).toLocaleString()  + ' acres',
              description: row.description || 'No description available.'
            })).filter(loc => !isNaN(loc.lat) && !isNaN(loc.lng));
            setAllLocations(locations);
          }
        });
      })
      .catch(error => {
        console.error("Error loading locations CSV:", error);
      });
  }, [storageAccountName, containerName, sasToken]);

  // 2. Load water quality data from water_quality_data.csv
  useEffect(() => {
    const waterUrl = `https://${storageAccountName}.blob.core.windows.net/${containerName}/water_quality_data.csv?${sasToken}`;
    fetch(waterUrl)
      .then(response => response.text())
      .then(csvText => {
        Papa.parse(csvText, {
          header: true,
          skipEmptyLines: true,
          complete: (result) => {
            // The CSV should have columns such as: Location, Parameter, Year, Value, etc.
            setWaterData(result.data);
          }
        });
      })
      .catch(error => {
        console.error("Error loading water quality CSV:", error);
      });
  }, [storageAccountName, containerName, sasToken]);

  // Determine bounds only when NO lakes are selected.
  // If no lakes are selected, use bounds from all locations.
  let bounds = null;
  if ((!selectedSites || selectedSites.length === 0) && allLocations.length > 0) {
    bounds = L.latLngBounds(allLocations.map(loc => [loc.lat, loc.lng]));
  }

  // Default center and zoom when no bounds can be calculated.
  const defaultCenter = [42.5, -86.0]; // Adjust as needed
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
      {bounds && <SetMapBounds bounds={bounds} />}

      {allLocations.map((loc, index) => {
        const isSelected = selectedSites.includes(loc.name);
        // Process water quality info as needed...
        return (
          <Marker
            key={index}
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
                <p><strong>Size:</strong> {loc.size}</p>
                <p><strong>Max Depth:</strong> {loc.max_depth}</p>
                <p><strong>Average Depth:</strong> {loc.avg_depth}</p>
                <p><strong>Description:</strong> {loc.description}</p>
                {isSelected}
              </div>
            </Popup>
          </Marker>
        );
      })}
    </MapContainer>
  );
}

export default MapPanel;
