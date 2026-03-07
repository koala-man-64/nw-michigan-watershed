import React, { useLayoutEffect, useMemo, useRef, useState } from "react";
import PropTypes from "prop-types";
import { Chart as ReactChart } from "react-chartjs-2";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowLeft,
  faArrowRight,
  faHashtag,
  faTimes,
} from "@fortawesome/free-solid-svg-icons";

import { D3Bar, D3Boxplot } from "./D3Charts";
import { CHART_FONT, computeYRangeForChart } from "./chartUtils";
import { formatParameterLabel } from "../parameterMetadata";

function LightModal({ title, body, onClose }) {
  React.useEffect(() => {
    const handler = (event) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0, 0, 0, 0.35)",
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        style={{
          width: "min(720px, 92vw)",
          maxHeight: "80vh",
          background: "#ffffff",
          color: "#1f2937",
          borderRadius: 12,
          boxShadow: "0 10px 28px rgba(0,0,0,0.25)",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "12px 16px",
            borderBottom: "1px solid rgba(0,0,0,0.08)",
          }}
        >
          <h5
            style={{
              margin: 0,
              fontSize: 14 * CHART_FONT,
              fontWeight: 600,
              fontFamily: "Poppins, sans-serif",
            }}
          >
            {title}
          </h5>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              border: 0,
              background: "transparent",
              cursor: "pointer",
              width: 36,
              height: 36,
              display: "grid",
              placeItems: "center",
            }}
          >
            <FontAwesomeIcon icon={faTimes} />
          </button>
        </div>
        <div style={{ padding: 16, overflow: "auto", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
          {body}
        </div>
      </div>
    </div>
  );
}

LightModal.propTypes = {
  title: PropTypes.string.isRequired,
  body: PropTypes.oneOfType([PropTypes.string, PropTypes.node]).isRequired,
  onClose: PropTypes.func.isRequired,
};

function IconWithTooltip({ icon, label, onClick, disabled = false, style = {}, active = false }) {
  const [open, setOpen] = React.useState(false);
  const [pos, setPos] = React.useState({ x: 0, y: 0 });
  const btnRef = React.useRef(null);

  const recalc = React.useCallback(() => {
    const el = btnRef.current;
    if (!el) {
      return;
    }
    const rect = el.getBoundingClientRect();
    setPos({ x: rect.left + rect.width / 2, y: rect.top });
  }, []);

  React.useEffect(() => {
    if (!open) {
      return undefined;
    }
    recalc();
    const onScroll = () => recalc();
    const onResize = () => recalc();
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize, true);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize, true);
    };
  }, [open, recalc]);

  return (
    <span
      ref={btnRef}
      role="button"
      aria-label={label}
      title={label}
      onClick={disabled ? undefined : onClick}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      tabIndex={disabled ? -1 : 0}
      style={{
        position: "relative",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 22,
        height: 22,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.45 : active ? 1 : 0.9,
        ...style,
      }}
    >
      <FontAwesomeIcon icon={icon} />
      {open && !disabled && (
        <>
          <span
            style={{
              position: "fixed",
              left: pos.x,
              top: Math.max(8, pos.y - 18),
              transform: "translate(-50%, -100%)",
              background: "rgba(31, 41, 55, 0.98)",
              color: "#fff",
              borderRadius: 6,
              padding: "6px 8px",
              fontSize: 12,
              whiteSpace: "nowrap",
              pointerEvents: "none",
              zIndex: 999999,
            }}
          >
            {label}
          </span>
          <span
            style={{
              position: "fixed",
              left: pos.x,
              top: Math.max(8, pos.y - 18),
              transform: "translate(-50%, -2px)",
              width: 0,
              height: 0,
              borderLeft: "6px solid transparent",
              borderRight: "6px solid transparent",
              borderTop: "6px solid rgba(31, 41, 55, 0.98)",
              pointerEvents: "none",
              zIndex: 999999,
            }}
          />
        </>
      )}
    </span>
  );
}

IconWithTooltip.propTypes = {
  icon: PropTypes.oneOfType([PropTypes.object, PropTypes.array, PropTypes.string]).isRequired,
  label: PropTypes.string.isRequired,
  onClick: PropTypes.func,
  disabled: PropTypes.bool,
  style: PropTypes.object,
  active: PropTypes.bool,
};

IconWithTooltip.defaultProps = {
  onClick: undefined,
  disabled: false,
  style: {},
  active: false,
};

function ChartPanel({ chartObj, cfg, slotLabel, options, icons, notice, nav }) {
  const containerRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [showCounts, setShowCounts] = useState(false);
  const parameterLabel = formatParameterLabel(cfg?.parameter);

  useLayoutEffect(() => {
    let raf1;
    let raf2;
    const el = containerRef.current;
    setReady(false);

    const ensureReady = () => {
      const inDoc = el && el.ownerDocument && el.ownerDocument.body.contains(el);
      const hasBox = el && el.clientWidth > 0 && el.clientHeight > 0;
      if (inDoc && hasBox) {
        setReady(true);
      } else {
        raf2 = requestAnimationFrame(ensureReady);
      }
    };

    raf1 = requestAnimationFrame(ensureReady);
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [cfg?.parameter, cfg?.chartType, chartObj?.type, chartObj?.data?.labels?.length]);

  const chartData = useMemo(() => {
    if (!chartObj) {
      return null;
    }
    const datasets = chartObj.data.datasets.map((dataset) => {
      const counts = dataset.customCounts || [];
      return {
        ...dataset,
        customCounts: showCounts ? counts : counts.map(() => null),
      };
    });
    return { ...chartObj.data, datasets };
  }, [chartObj, showCounts]);

  if (!cfg) {
    return (
      <div className="plot-panel">
        <div className="plot-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h4
            style={{
              margin: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              flexGrow: 1,
              flexShrink: 1,
              minWidth: 0,
            }}
          >
            {chartObj?.title ? `${slotLabel} — ${chartObj.title}` : slotLabel}
          </h4>
          <div className="plot-icons" style={{ opacity: 0.4 }} />
        </div>
        <div className="plot-content">
          <div className="no-plot-message">Click “Update {slotLabel}” to populate this plot.</div>
        </div>
      </div>
    );
  }

  if (!chartObj || !chartObj.data?.labels?.length) {
    return (
      <div className="plot-panel">
        <div className="plot-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h4
            style={{
              margin: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              flexGrow: 1,
              flexShrink: 1,
              minWidth: 0,
            }}
          >
            {slotLabel}: {parameterLabel || cfg.parameter}
          </h4>
          {icons}
        </div>
        {notice && <div className="plot-notice">{notice}</div>}
        <div className="plot-content">
          <div className="no-plot-message">No data for the current filters.</div>
        </div>
      </div>
    );
  }

  const chartKey = `${chartObj.type}-${cfg.parameter}-${cfg.chartType}-${chartObj.data.labels.length}-${showCounts}`;
  const title = chartObj?.title ? `${slotLabel} — ${chartObj.title}` : `${slotLabel}${parameterLabel ? `: ${parameterLabel}` : ""}`;
  const headerTitle = title.length > 80 ? `${title.slice(0, 79)}…` : title;
  const range = computeYRangeForChart(chartObj);
  const yDomain = range
    ? (() => {
      const span = range.max - range.min;
      let pad = span * 0.1;
      if (!Number.isFinite(pad) || pad === 0) {
        pad = 1;
      }
      return { min: range.min - pad, max: range.max + pad };
    })()
    : undefined;

  return (
    <div className="plot-panel">
      <div
        className="plot-header"
        style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}
      >
        <h4
          style={{
            margin: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            flexGrow: 1,
            flexShrink: 1,
            minWidth: 0,
          }}
          title={title}
        >
          {headerTitle}
        </h4>
        <div className="plot-icons" style={{ display: "flex", gap: 12, alignItems: "center", opacity: 0.9 }}>
          {icons}
          {nav && nav.hasMultipleSites ? (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <IconWithTooltip icon={faArrowLeft} label="Previous site" onClick={nav.prev} />
              <IconWithTooltip icon={faArrowRight} label="Next site" onClick={nav.next} />
            </span>
          ) : null}
          <IconWithTooltip
            icon={faHashtag}
            label={showCounts ? "Hide counts" : "Show counts"}
            onClick={() => setShowCounts((prev) => !prev)}
            active={showCounts}
          />
        </div>
      </div>
      {notice && <div className="plot-notice">{notice}</div>}
      <div className="plot-content" ref={containerRef} style={{ position: "relative", flex: 1 }}>
        {!ready ? (
          <div style={{ height: "100%" }} />
        ) : chartObj.type === "boxplot" ? (
          <D3Boxplot
            key={chartKey}
            labels={chartObj.data.labels}
            series={chartData.datasets[0].data}
            counts={chartData.datasets[0].customCounts || []}
            color={chartData.datasets[0].borderColor || "#37474f"}
            yDomain={yDomain}
            yLabel={parameterLabel}
          />
        ) : chartObj.type === "d3bar" ? (
          <D3Bar
            key={chartKey}
            labels={chartObj.data.labels}
            values={chartData.datasets[0].data}
            counts={chartData.datasets[0].customCounts || []}
            color={chartData.datasets[0].backgroundColor || "#37474f"}
            yDomain={
              (() => {
                const d3Range = computeYRangeForChart(chartObj);
                if (!d3Range) {
                  return undefined;
                }
                const span = d3Range.max - d3Range.min;
                const pad = !Number.isFinite(span) || span === 0 ? 1 : span * 0.1;
                return { min: Math.max(0, d3Range.min - pad), max: d3Range.max + pad };
              })()
            }
            yLabel={parameterLabel}
          />
        ) : (
          <ReactChart
            key={chartKey}
            datasetIdKey={`${cfg.parameter}-${chartObj.type}`}
            type={chartObj.type}
            data={chartData}
            options={options}
            updateMode="none"
            style={{ width: "100%", height: "100%" }}
          />
        )}
      </div>
    </div>
  );
}

ChartPanel.propTypes = {
  chartObj: PropTypes.object,
  cfg: PropTypes.object,
  slotLabel: PropTypes.string,
  options: PropTypes.object,
  icons: PropTypes.node,
  notice: PropTypes.node,
  nav: PropTypes.shape({
    prev: PropTypes.func,
    next: PropTypes.func,
    hasMultipleSites: PropTypes.bool,
  }),
};

ChartPanel.defaultProps = {
  chartObj: null,
  cfg: null,
  slotLabel: "",
  options: {},
  icons: null,
  notice: null,
  nav: null,
};

export { ChartPanel, IconWithTooltip, LightModal };
