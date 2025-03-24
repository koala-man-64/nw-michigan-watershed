import React, { useState, useEffect } from 'react';

import { BrowserRouter as Router, Routes, Route, Link } from "react-router-dom";
import "./App.css";
import Filters from "./Filters";
import Plots from "./Plots";
import MapPanel from "./MapPanel";
import Data from "./Data"; // Data page component


// function App() {
//   const [message, setMessage] = useState('');

//   useEffect(() => {
//     // Replace '/api/function_app' with your actual function endpoint if different.
//     fetch('/api/hello')
//       .then((response) => response.text())
//       .then((data) => {
//         console.log(data);
//         setMessage(data);
//       })
//       .catch((error) => console.error('Error fetching message:', error));
//   }, []);

//   return (
//     <div className="App">
//       <h1>Azure Function says:</h1>
//       <p>{message || 'Loading...'}</p>
//     </div>
//   );
// }


function App() {
  const [filters, setFilters] = useState({
    selectedSites: [], // Selected lakes from the filters
    selectedParameters: [],
    startDate: new Date(new Date().setFullYear(new Date().getFullYear() - 2)),
    endDate: new Date(),
  });

  return (
    <Router>
      <div className="dashboard">
        <header className="header">
          <div className="header-container">
            <div className="header-left">
              <div className="title">NW Michigan Watershed Coalition</div>
              <div className="vertical-separator"></div>
              <nav className="menu">
                <Link to="/">Main</Link>
                <Link to="/data">Data</Link>
              </nav>
            </div>
          </div>
        </header>
        <Routes>
          <Route
            path="/"
            element={
              <div className="container">
                <Filters 
                  onFilterChange={setFilters} 
                  selectedSites={filters.selectedSites} 
                />
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
            }
          />
          <Route path="/data" element={<Data />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
