import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useNavigate } from "react-router-dom";
import "./App.css";
import Filters from "./Filters";
import Plots from "./Plots";
import MapPanel from "./MapPanel";
import Data from "./Data";
import Login from "./Login";
import { AuthProvider, useAuth } from './AuthContext';
// Import the logging function from our new file
import { logClickEvent } from './utils/logUserAction';

function Dashboard() {
  const [filters, setFilters] = useState({
    selectedSites: [],
    selectedParameters: [],
    startDate: new Date(new Date().setFullYear(new Date().getFullYear() - 2)),
    endDate: new Date(),
  });

  const handleMarkerClick = (siteName) => {
    setFilters(prevFilters => ({
      ...prevFilters,
      selectedSites: prevFilters.selectedSites.includes(siteName)
        ? prevFilters.selectedSites.filter(name => name !== siteName)
        : [...prevFilters.selectedSites, siteName]
    }));
  };

  return (
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
        <MapPanel 
          selectedSites={filters.selectedSites} 
          onMarkerClick={handleMarkerClick} 
        />
      </section>
    </div>
  );
}

function Header() {
  const { isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();

  // Handle logout: clear auth state and navigate to login
  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <header className="header">
      <div className="header-container" style={{ justifyContent: 'space-between' }}>
        <div className="header-left" style={{ display: 'flex', alignItems: 'center' }}>
          <div className="title">NW Michigan Watershed Coalition</div>
          <div className="vertical-separator"></div>
          <nav className="menu">
            <Link to="/">Main</Link>
            {isAuthenticated && <Link to="/data">Data</Link>}
          </nav>
        </div>
        <div className="header-right">
          {isAuthenticated ? (
            <button className="menu-button" onClick={handleLogout}>Logout</button>
          ) : (
            <Link to="/login" className="menu-link">Login</Link>
          )}
        </div>
      </div>
    </header>
  );
}

function App() {
  // Global click event listener added here
  useEffect(() => {
    // Inside a component event handler:
    const handleClick = (event) => {
      const text = event.target.textContent;
      if (text && text.trim() !== "") {
        logClickEvent(event);
      }
    };
    
    document.addEventListener('click', handleClick);

    // Cleanup the listener when App unmounts
    return () => document.removeEventListener('click', handleClick);
  }, []);

  return (
    <Router>
      <AuthProvider>
        <div className="dashboard">
          <Header />
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/" element={<Dashboard />} />
            <Route path="/data" element={<Data />} />
          </Routes>
        </div>
      </AuthProvider>
    </Router>
  );
}

export default App;
