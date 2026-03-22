import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faVolumeHigh } from "@fortawesome/free-solid-svg-icons";
import PropTypes from "prop-types";
import { Link } from "react-router-dom";
import logo from "./nwmiws_logo.png";
import { useRuntimeConfig } from "./runtime/runtimeConfigContext";

export default function Header({ onHomeClick = () => {} }) {
  const { appTitle, supportContact } = useRuntimeConfig();
  const [activeDialog, setActiveDialog] = useState(null);
  const isContactOpen = activeDialog === "contact";
  const isAudioOpen = activeDialog === "audio";
  const contactDetails = [
    { label: "Contact", value: supportContact.name },
    { label: "Organization", value: supportContact.organization },
    {
      label: "Phone",
      value: supportContact.phoneDisplay,
      href: supportContact.phoneHref,
    },
    {
      label: "Email",
      value: supportContact.email,
      href: `mailto:${supportContact.email}`,
    },
  ];

  useEffect(() => {
    if (!activeDialog) {
      return undefined;
    }

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setActiveDialog(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeDialog]);

  const closeActiveDialog = () => setActiveDialog(null);
  const openContactDialog = () => setActiveDialog("contact");
  const openAudioInstructions = () => setActiveDialog("audio");
  const activeDialogTitle = isAudioOpen ? "Audio Instructions" : "Contact us";

  const headerModal = activeDialog ? (
    <div
      className="contact-modal-backdrop"
      onClick={closeActiveDialog}
      role="presentation"
    >
      <div
        className={`contact-modal${isAudioOpen ? " audio-modal" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="header-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="contact-modal-header">
          <h2 id="header-modal-title" className="contact-modal-title">
            {activeDialogTitle}
          </h2>
          <button
            type="button"
            className="contact-modal-close"
            onClick={closeActiveDialog}
            aria-label={isAudioOpen ? "Close audio instructions" : "Close contact information"}
          >
            x
          </button>
        </div>

        {isContactOpen ? (
          <div className="contact-details">
            {contactDetails.map((detail) => (
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
        ) : (
          <div className="audio-placeholder">
            <p className="audio-placeholder-title">Audio instructions are not published yet.</p>
            <p className="audio-placeholder-copy">
              This deployment is ready for narrated guidance, but no customer-approved recording has
              been published yet.
            </p>
            <button
              type="button"
              className="audio-placeholder-button"
              onClick={closeActiveDialog}
            >
              Close
            </button>
          </div>
        )}
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
              <div className="title">{appTitle}</div>
            </Link>
            <span className="vertical-separator" aria-hidden="true" />
          </div>

          <div className="header-audio">
            <button
              type="button"
              className="audio-instructions-button"
              onClick={openAudioInstructions}
            >
              <span className="audio-instructions-label">Audio Instructions</span>
              <span className="audio-instructions-icon" aria-hidden="true">
                <FontAwesomeIcon icon={faVolumeHigh} />
              </span>
            </button>
          </div>

          <nav className="menu" aria-label="Top navigation">
            <button
              type="button"
              className="menu-button"
              onClick={openContactDialog}
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
