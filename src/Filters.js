import React, { useEffect, useState } from "react";
import Papa from "papaparse";

function Filters({ onFilterChange }) {
  // Site state
  const [sites, setSites] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSites, setSelectedSites] = useState([]);

  // Parameter state
  const [selectedParameters, setSelectedParameters] = useState([]);

  // Year range state
  const [availableYears, setAvailableYears] = useState([]);
  const [startYear, setStartYear] = useState(null);
  const [endYear, setEndYear] = useState(null);

  // 1. Load all site names from `locations.csv`
  useEffect(() => {
    fetch("/locations.csv")
      .then(response => response.text())
      .then(csvText => {
        Papa.parse(csvText, {
          header: true,
          skipEmptyLines: true,
          complete: (result) => {
            // For each row, assume there's a "name" or "Location" field
            const allSites = result.data
              .map(row => row.name || row.Location)
              .filter(site => site); // remove any empty values
            // Remove duplicates and sort
            const uniqueSites = [...new Set(allSites)].sort();
            setSites(uniqueSites);
          }
        });
      });
  }, []);

  // 2. Load years from `water_quality_data.csv` for date range logic
  useEffect(() => {
    // Moved processYearData inside the effect to avoid missing dependency issues
    const processYearData = (data) => {
      // Parse years, filter out invalid values
      const years = data.map(row => parseInt(row.Year)).filter(y => !isNaN(y));
      if (years.length === 0) return;
      
      // Remove duplicates and sort the years
      const uniqueYears = [...new Set(years)].sort((a, b) => a - b);
      const min = uniqueYears[0];
      const max = uniqueYears[uniqueYears.length - 1];
      
      setAvailableYears(uniqueYears);
      setStartYear(min);
      setEndYear(max);

      // Update parent filters with default date range
      onFilterChange(prev => ({
        ...prev,
        startDate: new Date(min, 0, 1),
        endDate: new Date(max, 11, 31),
      }));
    };

    fetch("/water_quality_data.csv")
      .then(response => response.text())
      .then(csvText => {
        Papa.parse(csvText, {
          header: true,
          skipEmptyLines: true,
          complete: (result) => {
            processYearData(result.data);
          }
        });
      });
  }, [onFilterChange]);

  // Handle site search
  const filteredSites = sites.filter(site =>
    site.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Handle start/end year changes
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
                setSelectedSites(updatedSelection);
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
            setSelectedSites([]);
            setSelectedParameters([]);
            if (availableYears.length > 0) {
              const min = Math.min(...availableYears);
              const max = Math.max(...availableYears);
              setStartYear(min);
              setEndYear(max);
              onFilterChange({
                selectedSites: [],
                selectedParameters: [],
                startDate: new Date(min, 0, 1),
                endDate: new Date(max, 11, 31),
              });
            } else {
              onFilterChange({
                selectedSites: [],
                selectedParameters: [],
                startDate: new Date(),
                endDate: new Date(),
              });
            }
          }}
        >
          Reset
        </button>
      </div>
    </div>
  );
}

export default Filters;
