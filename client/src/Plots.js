// Plots.js
//
// This component renders one or two charts using Chart.js and
// @sgratzl/chartjs-chart-boxplot.  It is designed to fit into the
// Benzie County Conservation District theme with a dark accent
// palette, rounded cards and an accessible modal for ancillary
// information.  The charts dynamically adjust their y‑axis to the
// underlying data and display counts above each bar/box.  Tooltips
// for boxplots list each statistic on its own line.

import React, { useMemo, useRef, useLayoutEffect, useState } from "react";
import Papa from "papaparse";
import { Chart as ReactChart } from "react-chartjs-2";
import { Chart, registerables } from "chart.js";
import {
  BoxPlotController,
  ViolinController,
  BoxAndWiskers,
  Violin,
} from "@sgratzl/chartjs-chart-boxplot";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faDownload,
  faInfoCircle,
  faLightbulb,
  faQuestionCircle,
  faTimes,
} from "@fortawesome/free-solid-svg-icons";
import PropTypes from "prop-types";

// Register Chart.js components
Chart.register(
  ...registerables,
  BoxPlotController,
  ViolinController,
  BoxAndWiskers,
  Violin
);

// Global Chart.js defaults to match the dashboard’s typography
Chart.defaults.font.family = 'Lato, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
Chart.defaults.font.size = 12;
Chart.defaults.color = "#37474f";

// -----------------------------------------------------------------------------
// Helpers
//

// Round a number to three decimal places; preserve NaN and non‑finite values
const round3 = (v) =>
  Number.isFinite(v) ? Math.round(v * 1000) / 1000 : v;

// Simple quantile helper for boxplot statistics
function quantile(arr, q) {
  if (!arr || arr.length === 0) return NaN;
  const pos = (arr.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (arr[base + 1] !== undefined) {
    return arr[base] + rest * (arr[base + 1] - arr[base]);
  }
  return arr[base];
}

// Compute boxplot stats (min, q1, median, q3, max) from a set of values,
// rounding to three decimals.  Returns null for empty arrays.
function computeBoxStats(values) {
  if (!values || values.length === 0) return null;
  // Round inputs up front; filter out any non‑numeric values
  const rvals = values
    .map((v) => round3(Number(v)))
    .filter((v) => Number.isFinite(v));
  if (rvals.length === 0) return null;
  const sorted = rvals.slice().sort((a, b) => a - b);
  return {
    min: sorted[0],
    q1: round3(quantile(sorted, 0.25)),
    median: round3(quantile(sorted, 0.5)),
    q3: round3(quantile(sorted, 0.75)),
    max: sorted[sorted.length - 1],
  };
}

// Compute a sensible y‑axis range for a given chart.  For boxplots this
// considers the whisker extremes; for bar charts it considers the bar
// values.  Returns an object with {min, max} or null if nothing valid.
function computeYRangeForChart(chartObj) {
  try {
    const ds = chartObj?.data?.datasets?.[0];
    if (!ds) return null;
    if (chartObj.type === "boxplot") {
      const mins = ds.data
        .map((d) => Number(d?.min))
        .filter((n) => Number.isFinite(n));
      const maxs = ds.data
        .map((d) => Number(d?.max))
        .filter((n) => Number.isFinite(n));
      if (!mins.length || !maxs.length) return null;
      return { min: Math.min(...mins), max: Math.max(...maxs) };
    } else {
      const vals = ds.data
        .map((v) => Number(v))
        .filter((n) => Number.isFinite(n));
      if (!vals.length) return null;
      return { min: 0, max: Math.max(...vals) };
    }
  } catch {
    return null;
  }
}

// -----------------------------------------------------------------------------
// Chart builders
//

// Build a boxplot chart showing the distribution of a parameter by year.
function buildTrendChart(rawData, cfg, palette) {
  const { parameter, selectedSites = [], startYear, endYear } = cfg;
  const filtered = rawData.filter((row) => {
    const rowParam = row?.Parameter ? String(row.Parameter).trim() : "";
    const rowSite = row?.Site ? String(row.Site).trim() : "";
    const yearNum = parseInt(row?.Year, 10);
    return (
      rowParam === parameter &&
      selectedSites.includes(rowSite) &&
      Number.isFinite(yearNum) &&
      (startYear == null || yearNum >= startYear) &&
      (endYear == null || yearNum <= endYear)
    );
  });

  const groups = {};
  const countByYear = {};
  filtered.forEach((row) => {
    const y = row.Year;
    const avgVal = round3(parseFloat(row.Avg));
    const cnt = parseInt(row.Count, 10);
    if (!Number.isFinite(avgVal)) return;
    (groups[y] ||= []).push(avgVal);
    countByYear[y] = (countByYear[y] || 0) + (Number.isFinite(cnt) ? cnt : 0);
  });

  const years = Object.keys(groups).sort((a, b) => +a - +b);
  const boxData = [];
  const counts = [];
  years.forEach((y) => {
    const stats = computeBoxStats(groups[y]);
    if (stats) {
      boxData.push(stats);
      counts.push(countByYear[y] || 0);
    }
  });

  return {
    title: `${parameter} Distribution by Year`,
    type: "boxplot",
    data: {
      labels: years,
      datasets: [
        {
          label: parameter,
          data: boxData,
          backgroundColor: palette[0],
          borderColor: palette[0],
          customCounts: counts,
        },
      ],
    },
  };
}

// Build a bar chart comparing average parameter values by site.
function buildComparisonChart(rawData, cfg, palette) {
  const { parameter, selectedSites = [], startYear, endYear } = cfg;
  const filtered = rawData.filter((row) => {
    const rowParam = row?.Parameter ? String(row.Parameter).trim() : "";
    const rowSite = row?.Site ? String(row.Site).trim() : "";
    const yearNum = parseInt(row?.Year, 10);
    return (
      rowParam === parameter &&
      selectedSites.includes(rowSite) &&
      Number.isFinite(yearNum) &&
      (startYear == null || yearNum >= startYear) &&
      (endYear == null || yearNum <= endYear)
    );
  });

  const groups = {};
  const countsBySite = {};
  filtered.forEach((row) => {
    const site = row?.Site ? String(row.Site).trim() : "";
    const avgVal = round3(parseFloat(row.Avg));
    const cnt = parseInt(row.Count, 10);
    if (!site || !Number.isFinite(avgVal)) return;
    (groups[site] ||= []).push(avgVal);
    countsBySite[site] =
      (countsBySite[site] || 0) + (Number.isFinite(cnt) ? cnt : 0);
  });

  const sites = Object.keys(groups);
  const values = sites.map((s) => {
    const arr = groups[s];
    const mean = arr.reduce((sum, v) => sum + v, 0) / arr.length;
    return round3(mean);
  });
  const counts = sites.map((s) => countsBySite[s] || 0);

  return {
    title: `${parameter} Comparison by Site`,
    type: "bar",
    data: {
      labels: sites,
      datasets: [
        {
          label: parameter,
          data: values,
          backgroundColor: sites.map((_, i) => palette[i % palette.length]),
          customCounts: counts,
        },
      ],
    },
  };
}

// Colour palette for charts.  The first colour is the primary dark
// tone used for boxplots; subsequent colours are used for bar charts
// when multiple sites are shown.  Adjust these to match the brand.
const defaultColors = [
  "#37474f", // dark slate (primary)
  "#6faecb", // muted blue
  "#90a4ae", // cool grey
  "#b0c4d6", // light steel
  "#5f7d95", // denim
  "#a5b8c8", // pale blue-grey
  "#adb5bd", // light grey
];

// Chart plugin to draw counts above each bar or box.  For boxplots the
// label is anchored to the top whisker with a configurable gap; for
// other chart types it uses a simple offset from the bar top.
const countPlugin = {
  id: "countPlugin",
  afterDatasetsDraw(chart) {
    const ds = chart.data?.datasets?.[0];
    if (!ds) return;
    const counts = ds.customCounts || [];
    const meta = chart.getDatasetMeta(0);
    const ctx = chart.ctx;

    // Read per‑chart plugin options
    const p = chart.options?.plugins?.countPlugin || {};
    const gapAboveWhisker = Number.isFinite(p.gapAboveWhisker)
      ? p.gapAboveWhisker
      : 16;
    const baseOffset = Number.isFinite(p.offset) ? p.offset : 10;

    ctx.save();
    meta.data.forEach((el, i) => {
      const c = counts[i];
      if (c == null) return;
      // Horizontal position is always the centre of the element
      const x = el.tooltipPosition ? el.tooltipPosition().x : el.x;
      let textY;
      if (chart.config?.type === "boxplot") {
        // Determine the raw max for this boxplot.  Handles either
        // objects with {max} or arrays of numbers.
        const raw = el.$context?.raw ?? ds.data?.[i];
        let maxVal;
        if (raw && typeof raw === "object") {
          if (Number.isFinite(raw.max)) {
            maxVal = Number(raw.max);
          } else if (Array.isArray(raw)) {
            const nums = raw.map(Number).filter((n) => Number.isFinite(n));
            if (nums.length) maxVal = Math.max(...nums);
          }
        }
        const yScale = chart.scales[
          chart.options.indexAxis === "y" ? "x" : "y"
        ];
        const yHigh = Number.isFinite(maxVal)
          ? yScale.getPixelForValue(maxVal)
          : (el.tooltipPosition ? el.tooltipPosition().y : el.y);
        textY = yHigh - gapAboveWhisker;
      } else {
        const ppos = el.tooltipPosition ? el.tooltipPosition() : el;
        textY = ppos.y - baseOffset;
      }
      ctx.fillStyle = p.color || "#37474f";
      ctx.textAlign = "center";
      ctx.font = p.font || "bold 12px sans-serif";
      ctx.fillText(String(c), x, textY);
    });
    ctx.restore();
  },
};
Chart.register(countPlugin);

// Build chart options with dynamic y axis, tooltip formatting and
// general styling.  Accepts the parameter label and the chart
// definition so axis ranges can be computed.
function makeOptions(parameterLabel, chartObj) {
  // Compute axis range
  const range = computeYRangeForChart(chartObj);
  let yMin;
  let yMax;
  if (range) {
    const span = range.max - range.min;
    let pad = Number(span) * 0.16;
    if (!Number.isFinite(pad) || pad === 0) {
      pad = Math.max(Math.abs(range.max) * 0.02, 0.1);
    }
    if (chartObj.type === "boxplot") {
      yMin = Math.floor(range.min - pad);
      yMax = Math.ceil(range.max + pad*2);
    }
    else{
      yMin = Math.floor(range.min);
      yMax = Math.ceil(range.max + pad*2);
    }

    // Avoid negative minima when all values are positive and close to zero
    if (range.min >= 0 && yMin < 0 && span < 0.5) yMin = 0;
  }

  return {
    responsive: true,
    maintainAspectRatio: false,
    resizeDelay: 200,
    animation: false,
    responsiveAnimationDuration: 0,
    animations: { colors: false, x: { duration: 0 }, y: { duration: 0 } },
    interaction: { mode: "nearest", intersect: true },
    layout: { padding: { top: 12, bottom: 12 } },
    scales: {
      y: {
        beginAtZero: false,
        min: Number.isFinite(yMin) ? yMin : undefined,
        max: Number.isFinite(yMax) ? yMax : undefined,
        title: { display: true, text: parameterLabel || "" },
        ticks: {
          color: "#37474f",
        },
        grid: {
          color: "#e5e7eb",
          tickColor: "#e5e7eb",
        },
      },
      x: {
        ticks: { color: "#37474f" },
        grid: { color: "#e5e7eb", tickColor: "#e5e7eb" },
      },
    },
    plugins: {
      legend: { display: false },
      countPlugin: {
        gapAboveWhisker: 16,
        offset: 10,
        color: "#37474f",
        font: "bold 12px sans-serif",
      },
      tooltip: {
        callbacks: {
          label: (ctx) => {
            // When the chart is a boxplot, return an array of lines; Chart.js
            // will display each line on its own row.  Otherwise, return a
            // single string.
            if (ctx.chart.config.type === "boxplot") {
              const r = ctx.raw || {};
              const fmt = (v) =>
                Number.isFinite(v)
                  ? Number(v)
                      .toFixed(3)
                      .replace(/\.0+$/, "")
                      .replace(/\.([^0]*)0+$/, ".$1")
                  : "—";
              const lines = [];
              const series = ctx.dataset?.label || parameterLabel || "";
              if (series) lines.push(series);
              lines.push(`Min: ${fmt(r.min)}`);
              lines.push(`Q1 (25%): ${fmt(r.q1)}`);
              lines.push(`Median: ${fmt(r.median)}`);
              if (Number.isFinite(r.mean))
                lines.push(`Mean: ${fmt(r.mean)}`);
              lines.push(`Q3 (75%): ${fmt(r.q3)}`);
              lines.push(`Max: ${fmt(r.max)}`);
              return lines;
            }
            // For bar charts
            const v = ctx.parsed?.y ?? ctx.parsed;
            return `${ctx.dataset?.label ?? ""}: ${v}`;
          },
        },
      },
    },
  };
}

// -----------------------------------------------------------------------------
// Modal component
//

// A lightweight modal that overlays the rest of the UI.  It closes on
// backdrop click or when the user presses Esc.  The body text is
// displayed verbatim and preserves whitespace.  See App.css for
// additional styling of icons etc.
function LightModal({ title, body, onClose }) {
  // Close on Escape key
  React.useEffect(() => {
    const handler = (e) => {
      if (e.key === "Escape") onClose();
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
        onClick={(e) => e.stopPropagation()}
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
            style={{ margin: 0, fontSize: 16, fontWeight: 600, fontFamily: "Poppins, sans-serif" }}
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
        <div
          style={{
            padding: 16,
            overflow: "auto",
            lineHeight: 1.5,
            whiteSpace: "pre-wrap",
          }}
        >
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

// -----------------------------------------------------------------------------
// Chart panel
//

// ChartPanel defers rendering of the Chart.js component until its
// container has a non‑zero size.  This avoids rendering glitches
// caused by flexbox layout thrashing.  It also displays a heading and
// passes through an icons node provided by the parent.
function ChartPanel({ title, chartObj, cfg, slotLabel, options, icons }) {
  const containerRef = useRef(null);
  const [ready, setReady] = useState(false);

  // Wait until the chart container is attached and has size
  useLayoutEffect(() => {
    let raf1, raf2;
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
      setReady(false);
    };
  }, [cfg?.parameter, cfg?.chartType, chartObj?.type, chartObj?.data?.labels?.length]);

  // Panel content when there is no configuration
  if (!cfg) {
    return (
      <div className="plot-panel">
        <div
          className="plot-header"
          style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}
        >
          <h4 style={{ margin: 0 }}>{slotLabel} — not set</h4>
          <div className="plot-icons" style={{ display: "flex", gap: 12, opacity: 0.4 }}>
            <FontAwesomeIcon icon={faDownload} title="Download raw data" />
            <FontAwesomeIcon icon={faInfoCircle} title="Contact information" />
            <FontAwesomeIcon icon={faLightbulb} title="Lake association information" />
            <FontAwesomeIcon icon={faQuestionCircle} title="Parameter information" />
          </div>
        </div>
        <div className="plot-content" style={{ alignItems: "center", justifyContent: "center", minHeight: 320 }}>
          <div className="no-plot-message">Click “Update {slotLabel}” to populate this plot.</div>
        </div>
      </div>
    );
  }

  // Panel content when there is no data
  if (!chartObj || !chartObj.data?.labels?.length) {
    return (
      <div className="plot-panel">
        <div
          className="plot-header"
          style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}
        >
          <h4 style={{ margin: 0 }}>
            {slotLabel}: {cfg.parameter}
          </h4>
          {icons}
        </div>
        <div className="plot-content" style={{ alignItems: "center", justifyContent: "center", minHeight: 320 }}>
          <div className="no-plot-message">No data for the current filters.</div>
        </div>
      </div>
    );
  }

  // Compose key to force remount when structure changes
  const chartKey = `${chartObj.type}-${cfg.parameter}-${cfg.chartType}-${chartObj.data?.labels?.length || 0}`;

  return (
    <div className="plot-panel">
      <div
        className="plot-header"
        style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}
      >
        <h4 style={{ margin: 0 }}>{title}</h4>
        {icons}
      </div>
      <div className="plot-content" ref={containerRef} style={{ minHeight: 360 }}>
        {ready ? (
          <ReactChart
            key={chartKey}
            datasetIdKey={`${cfg.parameter}-${chartObj.type}`}
            type={chartObj.type}
            data={chartObj.data}
            options={options}
            updateMode="none"
          />
        ) : (
          // reserve space while waiting for layout to settle
          <div style={{ height: "100%" }} />
        )}
      </div>
    </div>
  );
}

ChartPanel.propTypes = {
  title: PropTypes.string,
  chartObj: PropTypes.object,
  cfg: PropTypes.object,
  slotLabel: PropTypes.string,
  options: PropTypes.object,
  icons: PropTypes.node,
};

// -----------------------------------------------------------------------------
// Main Plots component
//
function Plots({ plotConfigs = [], rawData = [], infoData = {}, loading = false }) {
  // Determine which filters are assigned to each plot slot
  const cfg1 = plotConfigs[0];
  const cfg2 = plotConfigs[1];

  // Build chart objects for each slot using the selected type
  const chart1 = useMemo(() => {
    if (!rawData || !cfg1) return null;
    return cfg1.chartType === "trend"
      ? buildTrendChart(rawData, cfg1, defaultColors)
      : buildComparisonChart(rawData, cfg1, defaultColors);
  }, [rawData, cfg1]);
  const chart2 = useMemo(() => {
    if (!rawData || !cfg2) return null;
    return cfg2.chartType === "trend"
      ? buildTrendChart(rawData, cfg2, defaultColors)
      : buildComparisonChart(rawData, cfg2, defaultColors);
  }, [rawData, cfg2]);

  // Compute chart options.  Options depend on the chart object so the
  // axis range is updated when data changes.
  const options1 = useMemo(() => makeOptions(cfg1?.parameter, chart1), [cfg1?.parameter, chart1]);
  const options2 = useMemo(() => makeOptions(cfg2?.parameter, chart2), [cfg2?.parameter, chart2]);

  // Modal state.  When modal is non‑null the LightModal will be rendered.
  const [modal, setModal] = useState(null);

  // Download filtered data as CSV
  const handleDownload = (cfg) => {
    if (!rawData || !cfg) return;
    const { parameter, chartType, selectedSites = [], startYear, endYear } = cfg;
    const rows = rawData.filter((row) => {
      const rowParam = row?.Parameter ? String(row.Parameter).trim() : "";
      const rowSite = row?.Site ? String(row.Site).trim() : "";
      const yearNum = parseInt(row?.Year, 10);
      return (
        rowParam === parameter &&
        selectedSites.includes(rowSite) &&
        Number.isFinite(yearNum) &&
        (startYear == null || yearNum >= startYear) &&
        (endYear == null || yearNum <= endYear)
      );
    });
    const csv = Papa.unparse(rows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${parameter}_${chartType}_data.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Helper to look up information about a parameter from the infoData map
  const infoFor = (param, field, fallback) => {
    const row = param && infoData[param];
    return (row && row[field]) || fallback;
  };

  // If data is still loading show a placeholder
  if (loading || !rawData || rawData.length === 0) {
    return (
      <section className="plots">
        <div className="plots-container">
          <p>Loading data…</p>
        </div>
      </section>
    );
  }

  // Build the icons element for a given plot configuration.  When the
  // information icons are clicked we open an in‑app modal rather than
  // showing a browser alert.  The title and body are passed through
  // from the infoData map with sensible defaults.
  const iconsFor = (cfg) => (
    <div className="plot-icons" style={{ display: "flex", gap: 12 }}>
      <FontAwesomeIcon
        icon={faDownload}
        title="Download raw data"
        onClick={() => handleDownload(cfg)}
      />
      <FontAwesomeIcon
        icon={faInfoCircle}
        title="Contact information"
        onClick={() =>
          setModal({
            title: "Contact Information",
            body: infoFor(cfg?.parameter, "ContactInfo", "No contact information available."),
          })
        }
      />
      <FontAwesomeIcon
        icon={faLightbulb}
        title="Lake association information"
        onClick={() =>
          setModal({
            title: "Lake Association Information",
            body: infoFor(cfg?.parameter, "AssociationInfo", "No association information available."),
          })
        }
      />
      <FontAwesomeIcon
        icon={faQuestionCircle}
        title="Parameter information"
        onClick={() =>
          setModal({
            title: "Parameter Information",
            body: infoFor(cfg?.parameter, "ParameterInfo", "No parameter information available."),
          })
        }
      />
    </div>
  );

  return (
    <div className="plots-container">
      <ChartPanel
        title={chart1?.title}
        chartObj={chart1}
        cfg={cfg1}
        slotLabel="Plot 1"
        options={options1}
        icons={iconsFor(cfg1)}
      />
      <ChartPanel
        title={chart2?.title}
        chartObj={chart2}
        cfg={cfg2}
        slotLabel="Plot 2"
        options={options2}
        icons={iconsFor(cfg2)}
      />
      {modal && (
        <LightModal
          title={modal.title}
          body={modal.body}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}

Plots.propTypes = {
  plotConfigs: PropTypes.arrayOf(
    PropTypes.shape({
      selectedSites: PropTypes.arrayOf(PropTypes.string).isRequired,
      parameter: PropTypes.string.isRequired,
      chartType: PropTypes.oneOf(["trend", "comparison"]).isRequired,
      startYear: PropTypes.number.isRequired,
      endYear: PropTypes.number.isRequired,
    })
  ).isRequired,
  rawData: PropTypes.arrayOf(PropTypes.object),
  infoData: PropTypes.object,
  loading: PropTypes.bool,
};

export default Plots;