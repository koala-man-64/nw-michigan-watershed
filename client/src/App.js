import React, { useState, useRef } from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import "./App.css";
import FiltersPanel from "./FiltersPanel";
import Header from "./Header";
import Plots from "./Plots";
import MapPanel from "./MapPanel";
import PropTypes from "prop-types";
import Home from "./Home";

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
  onDataLoaded, // bubbled up from FiltersPanel
  trendSingleSite = false,
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
      {/* FiltersPanel fetches from Azure and shares data up via onDataLoaded */}
      <FiltersPanel
        selectedSites={filters.selectedSites}
        onFiltersChange={onFiltersChange}
        onUpdatePlot1={onUpdatePlot1}
        onUpdatePlot2={onUpdatePlot2}
        onDataLoaded={onDataLoaded}
        trendSingleSite={trendSingleSite}
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
  onDataLoaded: PropTypes.func,
  trendSingleSite: PropTypes.bool,
};

function App() {
  // Single source of truth for filters used by both sides of the layout
  const [filters, setFilters] = useState({
    selectedSites: [],
    selectedParameters: [], // reserved for future use
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
    // If trend, default to last selected site
    let cfg = { ...plotFilters };
    if (cfg.chartType === "trend") {
      const sites = Array.isArray(cfg.selectedSites) ? cfg.selectedSites : [];
      const idx = sites.length > 0 ? sites.length - 1 : 0;
      cfg = { ...cfg, trendIndex: idx };
    }
    setPlotConfigs((prev) => {
      if (prev.length === 0) return [cfg];
      const next = [...prev];
      next[0] = cfg;
      return next;
    });
  };

  // Handler for "Update Plot 2"
  const handleUpdatePlot2 = (plotFilters) => {
    let cfg = { ...plotFilters };
    if (cfg.chartType === "trend") {
      const sites = Array.isArray(cfg.selectedSites) ? cfg.selectedSites : [];
      const idx = sites.length > 0 ? sites.length - 1 : 0;
      cfg = { ...cfg, trendIndex: idx };
    }
    setPlotConfigs((prev) => {
      if (prev.length === 0) return [cfg];
      if (prev.length === 1) return [...prev, cfg];
      const next = [...prev];
      next[1] = cfg;
      return next;
    });
  };
return (
    <Router>
      <div className="app" style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
        <Header />
        {/* Define routes for Home and Dashboard.  */}
        <Routes>
          {/* Home route renders the landing page */}
          <Route path="/" element={<Home />} />
          <Route path="/home" element={<Home />} />
          {/* Dashboard route renders the interactive plotting interface */}
          <Route
            path="/app"
            element={
              <div className="main" style={{ flex: 1, display: "flex", height: "100%" }}>
                <div className="left">
                <FilterMapPanel
                    filters={filters}
                    onFiltersChange={onFiltersChange}
                    onUpdatePlot1={handleUpdatePlot1}
                    onUpdatePlot2={handleUpdatePlot2}
                    onDataLoaded={handleDataLoaded}
                    trendSingleSite={false}
                  />
                </div>
                <div 
                className="right" 
                style={{ 
                  flex: 1, 
                  display: "flex", 
                  flexDirection: "column", 
                  overflow: "hidden"
                   }}>
                <Plots
                    plotConfigs={plotConfigs}
                    setPlotConfigs={setPlotConfigs}
                    rawData={rawData}
                    infoData={infoData}
                    loading={loading}
                  />
                </div>
              </div>
            }
          />
          {/* Fallback: any unknown path goes to Home */}
          <Route path="*" element={<Home />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
