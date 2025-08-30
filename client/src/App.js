import React, { useState, useEffect, useRef } from "react";
import { BrowserRouter as Router } from "react-router-dom";
import "./App.css";
import FiltersPanel from "./FiltersPanel";
import Header from "./Header";
import Plots from "./Plots";
import MapPanel from "./MapPanel";
import { logClickEvent } from "./utils/logUserAction";
import PropTypes from "prop-types";

/**
 * FilterMapPanel (controlled)
 * Receives the canonical `filters` from App and notifies App via
 * `onFiltersChange` when the user changes anything (including map clicks).
 */
function FilterMapPanel({
  filters,
  onFiltersChange,
  onUpdatePlot1,
  onUpdatePlot2,
  onDataLoaded,           // NEW: bubbled up from FiltersPanel
}) {
  const containerRef = useRef(null);

  // Toggle site in/out of filters.selectedSites when a marker is clicked
  const handleMarkerClick = (siteName) => {
    const nextSelected = filters.selectedSites.includes(siteName)
      ? filters.selectedSites.filter((n) => n !== siteName)
      : [...filters.selectedSites, siteName];

    onFiltersChange({ selectedSites: nextSelected });
  };

  return (
    <div ref={containerRef} className="filter-map-panel">
      {/* FiltersPanel now fetches from Azure and shares data up via onDataLoaded */}
      <FiltersPanel
        selectedSites={filters.selectedSites}
        onFiltersChange={onFiltersChange}
        onUpdatePlot1={onUpdatePlot1}
        onUpdatePlot2={onUpdatePlot2}
        onDataLoaded={onDataLoaded}      // NEW
      />

      <section className="map">
        <MapPanel
          selectedSites={filters.selectedSites}
          onMarkerClick={handleMarkerClick}
        />
      </section>
    </div>
  );
}
FilterMapPanel.propTypes = {
  filters: PropTypes.shape({
    selectedSites: PropTypes.arrayOf(PropTypes.string).isRequired,
    startYear: PropTypes.number,
    endYear: PropTypes.number,
    parameter: PropTypes.string,
    chartType: PropTypes.oneOf(["trend", "comparison"]),
  }).isRequired,
  onFiltersChange: PropTypes.func.isRequired,
  onUpdatePlot1: PropTypes.func.isRequired,
  onUpdatePlot2: PropTypes.func.isRequired,
  onDataLoaded: PropTypes.func,   // optional
};

function App() {
  // Single source of truth for filters used by both sides of the layout
  const [filters, setFilters] = useState({
    selectedSites: [],
    selectedParameters: [],      // reserved for future use
    startDate: new Date(new Date().setFullYear(new Date().getFullYear() - 2)),
    endDate: new Date(),
    startYear: null,
    endYear: null,
    parameter: "",
    chartType: "trend",
  });

  // Plot configurations captured by "Update Plot 1/2"
  const [plotConfigs, setPlotConfigs] = useState([]);

  // Data shared app-wide (provided by FiltersPanel)
  const [rawData, setRawData] = useState(null);
  const [infoData, setInfoData] = useState({});
  const [loading, setLoading] = useState(true);

  // Accept either partial updates or a full filters object
  const onFiltersChange = (partialOrFull) => {
    setFilters((prev) => ({ ...prev, ...partialOrFull }));
  };

  // Receive CSV payload from FiltersPanel
  const handleDataLoaded = ({ rawData, infoData }) => {
    setRawData(Array.isArray(rawData) ? rawData : []);
    setInfoData(infoData && typeof infoData === "object" ? infoData : {});
    setLoading(false);
  };

  // Handler for "Update Plot 1"
  const handleUpdatePlot1 = (plotFilters) => {
    setPlotConfigs((prev) => {
      if (prev.length === 0) return [plotFilters];
      const next = [...prev];
      next[0] = plotFilters;
      return next;
    });
  };

  // Handler for "Update Plot 2"
  const handleUpdatePlot2 = (plotFilters) => {
    setPlotConfigs((prev) => {
      if (prev.length === 0) return [plotFilters];
      if (prev.length === 1) return [...prev, plotFilters];
      const next = [...prev];
      next[1] = plotFilters;
      return next;
    });
  };

  // Global click analytics
  useEffect(() => {
    const handleClick = (event) => {
      const text = event.target.textContent?.trim();
      if (text) logClickEvent(event);
    };
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, []);

  return (
    <Router>
      <div className="app">
        <Header />

        {/* Two-column layout: left = filters+map, right = plots */}
        <div className="main">
          <div className="left">
            <FilterMapPanel
              filters={filters}
              onFiltersChange={onFiltersChange}
              onUpdatePlot1={handleUpdatePlot1}
              onUpdatePlot2={handleUpdatePlot2}
              onDataLoaded={handleDataLoaded}   // NEW
            />
          </div>

          <div className="right">
            <Plots
              plotConfigs={plotConfigs}
              rawData={rawData}
              infoData={infoData}
              loading={loading}
            />
          </div>
        </div>
      </div>
    </Router>
  );
}

export default App;
