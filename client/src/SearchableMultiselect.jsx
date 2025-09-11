import React, { useEffect, useMemo, useRef, useState, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import PropTypes from "prop-types";

export default function SearchableMultiSelect({
  options = [],
  selected = [],
  onChange,
  placeholder = "Search…",
  label = "Sites",
  maxPanelHeight = 280,
  className = "",
  siteTypeMap = {},              // NEW: map of site → "Lake" | "Stream"
  multiSelect = true,            // NEW: allow caller to toggle multi‑ or single‑select behaviour
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hoverIdx, setHoverIdx] = useState(-1);
  const [panelStyle, setPanelStyle] = useState({});
  const rootRef = useRef(null);
  const toggleRef = useRef(null);
  const panelRef = useRef(null);

  // Close on outside click
  useEffect(() => {
    const onDocClick = (e) => {
      if (!rootRef.current?.contains(e.target) && !panelRef.current?.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(o => String(o).toLowerCase().includes(q));
  }, [options, query]);

  const toggle = () => setOpen(v => !v);
  const toggleOption = (opt) => {
    let next;
    // In multi‑select mode we toggle membership; in single‑select mode
    // clicking an option selects it exclusively and clicking the already
    // selected option clears the selection.
    if (multiSelect) {
      next = selected.includes(opt)
        ? selected.filter((s) => s !== opt)
        : [...selected, opt];
    } else {
      // If the option is already the sole selection, deselect it; otherwise
      // replace the current selection with this option.
      if (selected.length === 1 && selected[0] === opt) {
        next = [];
      } else {
        next = [opt];
      }
    }
    onChange?.(next);
  };

  // Quick actions
  const selectAll = () => onChange?.(Array.from(new Set([...selected, ...filtered])));
  const clearAll  = () => onChange?.([]);

  // NEW: select by site type (replaces current selection)
  const inferType = (name) => {
    const t = (siteTypeMap?.[name] || "").toString().toLowerCase();
    if (t === "lake" || t === "stream") return t;
    const s = String(name).toLowerCase();
    if (/\bstream\b|\briver\b|\bcreek\b/.test(s)) return "stream";
    if (/\blake\b/.test(s)) return "lake";
    return "";
  };
  const selectByType = (type) => {
    const want = options.filter((n) => inferType(n) === type.toLowerCase());
    onChange?.(want);
  };

  // Keyboard navigation
  const onKeyDown = (e) => {
    if (!open && (e.key === "Enter" || e.key === " " || e.key === "ArrowDown")) {
      e.preventDefault(); setOpen(true); setHoverIdx(0); return;
    }
    if (!open) return;

    if (e.key === "Escape") { setOpen(false); return; }
    if (e.key === "ArrowDown") { e.preventDefault(); setHoverIdx(i => Math.min((i+1), filtered.length-1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setHoverIdx(i => Math.max((i-1), 0)); }
    if (e.key === "Enter") {
      e.preventDefault();
      const opt = filtered[hoverIdx];
      if (opt != null) toggleOption(opt);
    }
  };

  // Position the overlay panel relative to the toggle button (viewport coords)
  useLayoutEffect(() => {
    if (!open || !toggleRef.current) return;

    const place = () => {
      const r = toggleRef.current.getBoundingClientRect();
      const pad = 8;
      const width = Math.min(r.width, window.innerWidth - pad * 2);
      const left  = Math.max(pad, Math.min(r.left, window.innerWidth - width - pad));
      const maxH  = Math.min(maxPanelHeight, window.innerHeight - pad * 2);

      // anchor to TOP of trigger so it covers it
      setPanelStyle({
        position: "fixed",
        top: r.top,
        left,
        width,
        maxHeight: maxH,
        zIndex: 10000
      });
    };

    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, maxPanelHeight]);

  const summary =
    selected.length === 0 ? `Select ${label}` :
    selected.length === 1 ? selected[0] :
    `${selected.length} ${label.toLowerCase()} selected`;

  // The overlay panel is portaled to <body>, so it doesn't affect layout.
  const panel = open ? createPortal(
    <div
      ref={panelRef}
      className="sms-panel sms-panel-overlay"
      style={panelStyle}
      role="dialog"
      aria-label={`${label} picker`}
    >
      <div className="sms-controls">
        <input
          autoFocus
          className="sms-search"
          type="text"
          placeholder={placeholder}
          value={query}
          onChange={(e) => { setQuery(e.target.value); setHoverIdx(0); }}
        />

        {/* One row of actions: All, Clear, Lake, Stream */}
        <div
          className="sms-actions"
          style={{ display: "flex", gap: 8, flexWrap: "nowrap", justifyContent: "flex-start" }}
        >
          <button type="button" className="sms-action" onClick={selectAll} title="Select all">All</button>
          <button type="button" className="sms-action" onClick={clearAll} title="Clear selection">Clear</button>
          <button type="button" className="sms-action" onClick={() => selectByType("lake")} title="Select all Lakes">All Lakes</button>
          <button type="button" className="sms-action" onClick={() => selectByType("stream")} title="Select all Streams">All Streams</button>
        </div>
      </div>

      <div className="sms-list" role="listbox" aria-multiselectable>
        {/* When not in multi‑select mode, indicate that only a single option can be chosen */}
        {/* Note: we keep the checkbox controls for visual consistency. */}
        {filtered.length === 0 && <div className="sms-empty">No matches</div>}
        {filtered.map((opt, idx) => {
          const active = selected.includes(opt);
          return (
            <div
              key={opt}
              role="option"
              aria-selected={active}
              className={`sms-option ${active ? "active" : ""} ${idx === hoverIdx ? "hover" : ""}`}
              onMouseEnter={() => setHoverIdx(idx)}
              onClick={() => toggleOption(opt)}
              title={opt}
            >
              <input type="checkbox" readOnly checked={active} />
              <span className="sms-option-label">{opt}</span>
            </div>
          );
        })}
      </div>
    </div>,
    document.body
  ) : null;

  return (
    <div ref={rootRef} className={`sms-root ${className}`} onKeyDown={onKeyDown}>
      <label className="sms-label">{label}</label>
      <button
        ref={toggleRef}
        type="button"
        className={`sms-toggle ${open ? "open" : ""}`}
        onClick={toggle}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className={`sms-summary ${selected.length ? "has-value" : ""}`}>{summary}</span>
        <span className="sms-caret" aria-hidden>▾</span>
      </button>

      {panel}
    </div>
  );
}

SearchableMultiSelect.propTypes = {
  options: PropTypes.arrayOf(PropTypes.string).isRequired,
  selected: PropTypes.arrayOf(PropTypes.string).isRequired,
  onChange: PropTypes.func.isRequired,
  placeholder: PropTypes.string,
  label: PropTypes.string,
  maxPanelHeight: PropTypes.number,
  /**
   * Whether the control allows selecting multiple options.  When false,
   * selecting an option will replace the previous selection and a second
   * click on the same option will clear the selection entirely.
   */
  multiSelect: PropTypes.bool,
  className: PropTypes.string,
  siteTypeMap: PropTypes.object,  // NEW
};

SearchableMultiSelect.defaultProps = {
  placeholder: "Search…",
  label: "Select",
  maxPanelHeight: 300,
  className: "",
  siteTypeMap: {},               // NEW
};
