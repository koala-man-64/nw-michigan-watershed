import React, { useState } from "react";
import "./App.css";
import Filters from "./Filters";
import Plots from "./Plots";
import MapPanel from "./MapPanel";

function App() {
  const [filters, setFilters] = useState({
    selectedSites: [], // Selected lakes from the filters
    selectedParameters: [],
    startDate: new Date(new Date().setFullYear(new Date().getFullYear() - 2)),
    endDate: new Date(),
  });

  return (
    <div className="dashboard">
      <header className="header">NW Michigan Watershed Coalition</header>
      <div className="container">
        <Filters onFilterChange={setFilters} />
        <main className="plots">
          <Plots 
            selectedParameters={filters.selectedParameters} 
            selectedSites={filters.selectedSites} 
            startDate={filters.startDate} 
            endDate={filters.endDate} 
          />
        </main>
        <section className="map">
          <MapPanel selectedSites={filters.selectedSites} />
        </section>
      </div>
    </div>
  );
}

export default App;
