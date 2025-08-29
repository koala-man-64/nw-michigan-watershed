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
function FilterMapPanel({ filters, onFiltersChange, onUpdatePlot1, onUpdatePlot2 }) {
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
        onUpdatePlot1={onUpdatePlot1}
        onUpdatePlot2={onUpdatePlot2}
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
};


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

  // Maintain an array of up to two plot configurations.  Each
  // configuration captures the filter settings when an update plot
  // button is pressed.  The first element corresponds to Plot 1 and
  // the second to Plot 2.  If the second plot is requested before
  // any plots exist it will populate the first slot.
  const [plotConfigs, setPlotConfigs] = useState([]);

  // Accept either partial updates or a full filters object
  const onFiltersChange = (partialOrFull) => {
    setFilters((prev) => ({ ...prev, ...partialOrFull }));
  };

  // Handler for when the user clicks the "Update Plot 1" button in
  // FiltersPanel.  Capture the current filter settings.  If no plots
  // exist this creates the first plot; otherwise it replaces the
  // first plot.
  const handleUpdatePlot1 = (plotFilters) => {
    setPlotConfigs((prev) => {
      if (prev.length === 0) {
        return [plotFilters];
      }
      const next = [...prev];
      next[0] = plotFilters;
      return next;
    });
  };

  // Handler for "Update Plot 2".  If no plots exist this will
  // populate the first slot.  If one exists this will append the
  // second.  If two plots already exist it will replace the second.
  const handleUpdatePlot2 = (plotFilters) => {
    setPlotConfigs((prev) => {
      if (prev.length === 0) {
        return [plotFilters];
      }
      if (prev.length === 1) {
        return [...prev, plotFilters];
      }
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
            />
          </div>

          <div className="right">
            {/* Render the plots based on the saved plot configurations.
               Each entry corresponds to a single chart. */}
            <Plots plotConfigs={plotConfigs} />
          </div>
        </div>
      </div>
    </Router>
  );
}

export default App;
