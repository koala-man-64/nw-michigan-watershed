import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import PropTypes from "prop-types";
import { Link } from "react-router-dom";
import logo from "./nwmiws_logo.png";
import { APP_TITLE, CONTACT_DETAILS } from "./siteContent";

export default function Header({ onHomeClick = () => {} }) {
  const [isContactOpen, setIsContactOpen] = useState(false);

  useEffect(() => {
    if (!isContactOpen) {
      return undefined;
    }

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setIsContactOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isContactOpen]);

  const closeContactDialog = () => setIsContactOpen(false);

  const headerModal = isContactOpen ? (
    <div
      className="contact-modal-backdrop"
      onClick={closeContactDialog}
      role="presentation"
    >
      <div
        className="contact-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="header-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="contact-modal-header">
          <h2 id="header-modal-title" className="contact-modal-title">
            Contact us
          </h2>
          <button
            type="button"
            className="contact-modal-close"
            onClick={closeContactDialog}
            aria-label="Close contact information"
          >
            x
          </button>
        </div>

        <div className="contact-details">
          {CONTACT_DETAILS.map((detail) => (
            <div key={detail.label} className="contact-row">
              <span className="contact-label">{detail.label}</span>
              {detail.href ? (
                <a className="contact-value contact-link" href={detail.href}>
                  {detail.value}
                </a>
              ) : (
                <span className="contact-value">{detail.value}</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  ) : null;

  return (
    <>
      <header className="header">
        <div className="header-container">
          <div className="header-left">
            <Link to="/" aria-label="Home" className="header-home-link" onClick={onHomeClick}>
              <img src={logo} alt="Logo" className="header-logo" />
              <div className="title">{APP_TITLE}</div>
            </Link>
            <span className="vertical-separator" aria-hidden="true" />
          </div>

          <nav className="menu" aria-label="Top navigation">
            <button
              type="button"
              className="menu-button"
              onClick={() => setIsContactOpen(true)}
            >
              Contact
            </button>
          </nav>
        </div>
      </header>
      {typeof document !== "undefined" ? createPortal(headerModal, document.body) : null}
    </>
  );
}

Header.propTypes = {
  onHomeClick: PropTypes.func,
};
