import React, { useEffect, useState } from "react";
import Papa from "papaparse";

function Filters({ onFilterChange, selectedSites }) {
  // Page-level configuration variables for Azure Blob Storage.
  const storageAccountName = "nwmiwsstorageaccount";
  const sasToken = "sv=2024-11-04&ss=bfqt&srt=sco&sp=rwdlacupiytfx&se=2055-03-28T11:52:57Z&st=2025-03-28T03:52:57Z&spr=https&sig=3%2Fe9jY4M%2F0yFHftpJmTsuVvlPwpn7B4zQ9ey0bwnQ2w%3D";
  const containerName = "nwmiws";
  
  // State for all available sites (not the selected ones).
  const [sites, setSites] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");

  // Parameter state
  const [selectedParameters, setSelectedParameters] = useState([]);

  // Year range state
  const [availableYears, setAvailableYears] = useState([]);
  const [startYear, setStartYear] = useState(null);
  const [endYear, setEndYear] = useState(null);

  // 1. Load all site names from `locations.csv` from Azure Blob Storage.
  useEffect(() => {
    const url = `https://${storageAccountName}.blob.core.windows.net/${containerName}/locations.csv?${sasToken}`;
    fetch(url)
      .then(response => response.text())
      .then(csvText => {
        Papa.parse(csvText, {
          header: true,
          skipEmptyLines: true,
          complete: (result) => {
            // Assume each row has a "name" or "Location" field.
            const allSites = result.data
              .map(row => row.name || row.Location)
              .filter(site => site); // Remove empty values.
            // Remove duplicates and sort.
            const uniqueSites = [...new Set(allSites)].sort();
            setSites(uniqueSites);
          }
        });
      })
      .catch(error => {
        console.error("Error loading locations CSV:", error);
      });
  }, [storageAccountName, containerName, sasToken]);

  // 2. Load years from `water_quality_data.csv` from Azure Blob Storage.
  useEffect(() => {
    const processYearData = (data) => {
      const years = data.map(row => parseInt(row.Year)).filter(y => !isNaN(y));
      if (years.length === 0) return;
      
      const uniqueYears = [...new Set(years)].sort((a, b) => a - b);
      const min = uniqueYears[0];
      const max = uniqueYears[uniqueYears.length - 1];
      
      setAvailableYears(uniqueYears);
      setStartYear(min);
      setEndYear(max);

      onFilterChange(prev => ({
        ...prev,
        startDate: new Date(min, 0, 1),
        endDate: new Date(max, 11, 31),
      }));
    };

    const url = `https://${storageAccountName}.blob.core.windows.net/${containerName}/water_quality_data.csv?${sasToken}`;
    fetch(url)
      .then(response => response.text())
      .then(csvText => {
        Papa.parse(csvText, {
          header: true,
          skipEmptyLines: true,
          complete: (result) => {
            processYearData(result.data);
          }
        });
      })
      .catch(error => {
        console.error("Error loading water quality CSV:", error);
      });
  }, [onFilterChange, storageAccountName, containerName, sasToken]);

  // Handle site search.
  const filteredSites = sites.filter(site =>
    site.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Handle start/end year changes.
  const handleStartYearChange = (event) => {
    const newStart = parseInt(event.target.value);
    if (newStart <= endYear) {
      setStartYear(newStart);
      onFilterChange(prev => ({
        ...prev,
        startDate: new Date(newStart, 0, 1),
      }));
    }
  };

  const handleEndYearChange = (event) => {
    const newEnd = parseInt(event.target.value);
    if (newEnd >= startYear) {
      setEndYear(newEnd);
      onFilterChange(prev => ({
        ...prev,
        endDate: new Date(newEnd, 11, 31),
      }));
    }
  };

  return (
    <div className="filters">
      {/* Site Filter */}
      <div className="filter-group">
        <input
          type="text"
          placeholder="Search sites..."
          className="search-box"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        <div className="site-list">
          {filteredSites.map(site => (
            <div
              key={site}
              className={`site-item ${selectedSites.includes(site) ? "selected" : ""}`}
              onClick={() => {
                const updatedSelection = selectedSites.includes(site)
                  ? selectedSites.filter(s => s !== site)
                  : [...selectedSites, site];
                onFilterChange(prev => ({ ...prev, selectedSites: updatedSelection }));
              }}
            >
              {site}
            </div>
          ))}
        </div>
      </div>

      <hr className="filter-separator" />

      {/* Parameter Filter */}
      <div className="filter-group parameter-filter">
        <span>Parameter:</span>
        <div className="parameter-options">
          {["Total Phosphorous", "Secchi"].map(param => (
            <label key={param} className="parameter-option">
              <input
                type="checkbox"
                checked={selectedParameters.includes(param)}
                onChange={() => {
                  const updatedParams = selectedParameters.includes(param)
                    ? selectedParameters.filter(p => p !== param)
                    : [...selectedParameters, param];
                  setSelectedParameters(updatedParams);
                  onFilterChange(prev => ({ ...prev, selectedParameters: updatedParams }));
                }}
              />
              {param}
            </label>
          ))}
        </div>
      </div>

      <hr className="filter-separator" />

      {/* Year Range Dropdowns */}
      <div className="filter-group">
        <span>Year Range:</span>
        <div className="year-dropdowns">
          <label>
            Start Year:
            <select
              value={startYear || ""}
              onChange={handleStartYearChange}
              className="year-select"
            >
              {availableYears.map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </label>
          <label>
            End Year:
            <select
              value={endYear || ""}
              onChange={handleEndYearChange}
              className="year-select"
            >
              {availableYears.map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <hr className="filter-separator" />

      {/* Reset Button */}
      <div className="filter-group filter-buttons">
        <button
          className="reset-btn"
          onClick={() => {
            onFilterChange({
              selectedSites: [],
              selectedParameters: [],
              startDate: availableYears.length > 0 ? new Date(Math.min(...availableYears), 0, 1) : new Date(),
              endDate: availableYears.length > 0 ? new Date(Math.max(...availableYears), 11, 31) : new Date(),
            });
          }}
        >
          Reset
        </button>
      </div>
    </div>
  );
}

export default Filters;
