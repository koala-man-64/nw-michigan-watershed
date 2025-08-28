import React from 'react';
import logo from './bcd-logo-2012-darkblue_orig.png';

/**
 * Header
 * ------
 * Renders the top navigation bar of the dashboard.  The header is
 * intentionally simple at the moment: it displays a logo, a title,
 * and leaves room for a navigation menu.  Additional navigation
 * items can be added to the <nav> element.  The surrounding CSS
 * ensures that the header is responsive and scales down gracefully on
 * small screens.
 */
export default function Header() {
  return (
    <header className="header">
      <div className="header-container">
        {/* Left section: logo and title */}
        <div className="header-left" style={{ display: 'flex', alignItems: 'stretch' }}>
          <img src={logo} alt="Logo" className="header-logo" />
          <div className="title">Benzie County Conservation District</div>
          {/* Uncomment the following lines to add navigation links:
          <div className="vertical-separator"></div>
          <nav className="menu">
            <Link to="/">Home</Link>
            <Link to="/about">About</Link>
          </nav> */}
        </div>
      </div>
    </header>
  );
}
