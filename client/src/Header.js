import React from 'react';
import { Link } from 'react-router-dom';
import logo from './nwmiws_logo.png';

export default function Header() {
  return (
    <header className="header">
      <div className="header-container">
        <div className="header-left">
          <Link to="/" aria-label="Home" style={{display:"flex", alignItems:"center", textDecoration:"none", color:"inherit"}}>
            <img src={logo} alt="Logo" className="header-logo" />
            <div className="title">Northwest Michigan Watershed Coalition</div>
          </Link>
        </div>
      </div>
    </header>
  );
}
