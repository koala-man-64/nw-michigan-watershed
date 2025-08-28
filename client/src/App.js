import React, { useState, useEffect, useRef } from "react";
import { BrowserRouter as Router } from "react-router-dom";
import "./App.css";
import FiltersPanel from "./FiltersPanel";
import Header from "./Header";
import Plots from "./Plots";
import MapPanel from "./MapPanel";
import { logClickEvent } from "./utils/logUserAction";

/**
 * FilterMapPanel (controlled)
 * Receives the canonical `filters` from App and notifies App via
 * `onFiltersChange` when the user changes anything (including map clicks).
 */
function FilterMapPanel({ filters, onFiltersChange }) {
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
      {/* FiltersPanel is “semi-controlled”: it mirrors the parent’s selectedSites
         and calls onFiltersChange(...) with the full (or partial) filters object */}
      <FiltersPanel
        selectedSites={filters.selectedSites}
        onFiltersChange={onFiltersChange}
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

function App() {
  // Single source of truth for filters used by both sides of the layout
  const [filters, setFilters] = useState({
    selectedSites: [],
    selectedParameters: [],      // reserved for future use
    startDate: new Date(new Date().setFullYear(new Date().getFullYear() - 2)),
    endDate: new Date(),

    // These are driven by FiltersPanel’s CSV (it will set them via onFiltersChange)
    startYear: null,
    endYear: null,
    parameter: "",
    chartType: "trend",          // 'trend' -> line, 'comparison' -> bar
  });

  // Accept either partial updates or a full filters object
  const onFiltersChange = (partialOrFull) => {
    setFilters((prev) => ({ ...prev, ...partialOrFull }));
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
            />
          </div>

          <div className="right">
            {/* Plots now reads the same filters from App */}
            <Plots 
              selectedParameters={filters.selectedParameters} 
              selectedSites={filters.selectedSites} 
              startDate={filters.startDate} 
              endDate={filters.endDate} 
            />
          </div>
        </div>
      </div>
    </Router>
  );
}

export default App;
