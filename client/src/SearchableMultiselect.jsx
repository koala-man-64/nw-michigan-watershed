import React, { useEffect, useMemo, useRef, useState, useLayoutEffect } from "react";
import { createPortal } from "react-dom";

export default function SearchableMultiSelect({
  options = [],
  selected = [],
  onChange,
  placeholder = "Search…",
  label = "Sites",
  maxPanelHeight = 280,
  className = "",
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
    const next = selected.includes(opt)
      ? selected.filter(s => s !== opt)
      : [...selected, opt];
    onChange?.(next);
  };

  const selectAll = () => onChange?.(Array.from(new Set([...selected, ...filtered])));
  const clearAll  = () => onChange?.([]);

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

    // key: anchor to the TOP of the trigger so it covers it
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
    <div ref={panelRef} className="sms-panel sms-panel-overlay" style={panelStyle} role="dialog" aria-label={`${label} picker`}>
      <div className="sms-controls">
        <input
          autoFocus
          className="sms-search"
          type="text"
          placeholder={placeholder}
          value={query}
          onChange={(e) => { setQuery(e.target.value); setHoverIdx(0); }}
        />
        <div className="sms-actions">
        <button
            type="button"
            className="sms-action"
            onClick={selectAll}
            title="Select all"
        >
            All
        </button>
        <button
            type="button"
            className="sms-action"
            onClick={clearAll}
            title="Clear selection"
        >
            Clear
        </button>
        </div>
      </div>

      <div className="sms-list" role="listbox" aria-multiselectable>
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
