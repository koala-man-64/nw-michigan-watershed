import React from 'react';
import { Link } from 'react-router-dom';
import logo from './bcd-logo-2012-darkblue_orig.png';

export default function Header() {
  return (
    <header className="header">
      <div className="header-container">
        {/* Left section: logo and title */}
        <div className="header-left">
          <Link to="/" aria-label="Home" style={{display:"flex", alignItems:"center", textDecoration:"none", color:"inherit"}}>
            <img src={logo} alt="Logo" className="header-logo" />
            <div className="title">Benzie County Conservation District</div>
          </Link>
          <div className="vertical-separator"></div>
          <nav className="menu">
            <Link to="/home">Home</Link>
            {/* Provide a link to the interactive dashboard as well */}
            <Link to="/app">Dashboard</Link>
          </nav>
        </div>
      </div>
    </header>
  );
}
