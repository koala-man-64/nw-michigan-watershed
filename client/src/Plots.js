import React, { useEffect, useMemo, useState } from "react";
import Papa from "papaparse";
import { Chart as ReactChart } from "react-chartjs-2";
import { Chart, registerables } from "chart.js";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faDownload,
  faInfoCircle,
  faLightbulb,
  faQuestionCircle,
} from "@fortawesome/free-solid-svg-icons";
import PropTypes from "prop-types";

// Optional: load box/violin plugin without breaking if not installed
(async () => {
  try {
    await import("chartjs-chart-box-and-violin-plot");
  } catch {
    console.warn("Box/violin plugin not installed — box plots will not render.");
  }
})();

Chart.register(...registerables);

// Counts above bars/boxes (expects dataset.customCounts)
const countPlugin = {
  id: "countPlugin",
  afterDatasetsDraw(chart) {
    const ds = chart.data?.datasets?.[0];
    const counts = (ds && ds.customCounts) || [];
    const meta = chart.getDatasetMeta(0);
    const ctx = chart.ctx;
    ctx.save();
    meta.data.forEach((el, i) => {
      const c = counts[i];
      if (c == null) return;
      const p = el.tooltipPosition ? el.tooltipPosition() : el;
      ctx.fillStyle = "#37474F";
      ctx.textAlign = "center";
      ctx.font = "bold 12px sans-serif";
      ctx.fillText(String(c), p.x, p.y - 6);
    });
    ctx.restore();
  },
};
Chart.register(countPlugin);

// Palette
const defaultColors = [
  "#37474F",
  "#5BC0DE",
  "#6C757D",
  "#ADB5BD",
  "#007BFF",
  "#8E44AD",
  "#F39C12",
];

// ---------- box stats helpers ----------
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
function computeBoxStats(values) {
  if (!values || values.length === 0) return null;
  const sorted = values.slice().sort((a, b) => a - b);
  return {
    min: sorted[0],
    q1: quantile(sorted, 0.25),
    median: quantile(sorted, 0.5),
    q3: quantile(sorted, 0.75),
    max: sorted[sorted.length - 1],
  };
}

// ---------- chart builders ----------
function buildTrendChart(rawData, cfg) {
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
    const avgVal = parseFloat(row.Avg);
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
          backgroundColor: defaultColors[0],
          borderColor: defaultColors[0],
          customCounts: counts,
        },
      ],
    },
  };
}

function buildComparisonChart(rawData, cfg) {
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
    const avgVal = parseFloat(row.Avg);
    const cnt = parseInt(row.Count, 10);
    if (!site || !Number.isFinite(avgVal)) return;
    (groups[site] ||= []).push(avgVal);
    countsBySite[site] = (countsBySite[site] || 0) + (Number.isFinite(cnt) ? cnt : 0);
  });

  const sites = Object.keys(groups);
  const values = sites.map((s) => {
    const arr = groups[s];
    return arr.reduce((sum, v) => sum + v, 0) / arr.length;
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
          backgroundColor: sites.map((_, i) => defaultColors[i % defaultColors.length]),
          customCounts: counts,
        },
      ],
    },
  };
}

// ---------- component ----------
function Plots({ plotConfigs = [] }) {
  const [rawData, setRawData] = useState(null);
  const [infoData, setInfoData] = useState({});
  const [loading, setLoading] = useState(true);

  // load once from /public
  useEffect(() => {
    let cancelled = false;

    async function fetchFromPublic(paths) {
      for (const p of paths) {
        const url = "/" + String(p).replace(/^\/+/, "");
        console.debug("[Plots] fetching:", url);
        const resp = await fetch(url, { cache: "no-store" });
        if (resp.ok) return resp.text();
        console.warn("[Plots] fetch failed:", url, resp.status);
      }
      throw new Error(`None of these files were found in /public: ${paths.join(" | ")}`);
    }

    (async () => {
      setLoading(true);
      try {
        const [csvData, csvInfo] = await Promise.all([
          // try encoded first, then raw space
          fetchFromPublic(["NWMIWS_Site_Data.csv"]),
          fetchFromPublic(["info.csv"]),
        ]);
        if (cancelled) return;

        let d = [];
        Papa.parse(csvData, {
          header: true,
          skipEmptyLines: true,
          complete: ({ data }) => (d = data),
        });

        let i = [];
        Papa.parse(csvInfo, {
          header: true,
          skipEmptyLines: true,
          complete: ({ data }) => (i = data),
        });

        if (cancelled) return;
        setRawData(d);

        const infoMap = {};
        for (const r of i) {
          const key = r?.Parameter ? String(r.Parameter).trim() : "";
          if (key) infoMap[key] = r;
        }
        setInfoData(infoMap);
      } catch (err) {
        console.error("Error loading CSV files from public/:", err);
        if (!cancelled) {
          setRawData([]);
          setInfoData({});
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Build individual charts (always 2 panels)
  const cfg1 = plotConfigs[0];
  const cfg2 = plotConfigs[1];

  const chart1 = useMemo(() => {
    if (!rawData || !cfg1) return null;
    return cfg1.chartType === "trend"
      ? buildTrendChart(rawData, cfg1)
      : buildComparisonChart(rawData, cfg1);
  }, [rawData, cfg1]);

  const chart2 = useMemo(() => {
    if (!rawData || !cfg2) return null;
    return cfg2.chartType === "trend"
      ? buildTrendChart(rawData, cfg2)
      : buildComparisonChart(rawData, cfg2);
  }, [rawData, cfg2]);

  // Nudge Chart.js to resize when either chart config appears/changes
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      window.dispatchEvent(new Event("resize"));
    });
    return () => cancelAnimationFrame(id);
  }, [!!chart1, !!chart2, chart1?.data?.labels?.length, chart2?.data?.labels?.length]);

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

  const infoFor = (param, field, fallback) => {
    const row = param && infoData[param];
    return (row && row[field]) || fallback;
  };

  if (loading) {
    return (
      <section className="plots">
        <div className="plots-container">
          <p>Loading data…</p>
        </div>
      </section>
    );
  }

  const renderPanel = (title, chartObj, cfg, slotLabel) => {
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
          <div className="plot-content" style={{ alignItems: "center", justifyContent: "center" }}>
            <div className="no-plot-message">Click “Update {slotLabel}” to populate this plot.</div>
          </div>
        </div>
      );
    }

    const icons = (
      <div className="plot-icons" style={{ display: "flex", gap: 12, cursor: "pointer" }}>
        <FontAwesomeIcon icon={faDownload} title="Download raw data" onClick={() => handleDownload(cfg)} />
        <FontAwesomeIcon
          icon={faInfoCircle}
          title="Contact information"
          onClick={() => alert(infoFor(cfg.parameter, "ContactInfo", "No contact information available."))}
        />
        <FontAwesomeIcon
          icon={faLightbulb}
          title="Lake association information"
          onClick={() => alert(infoFor(cfg.parameter, "AssociationInfo", "No association information available."))}
        />
        <FontAwesomeIcon
          icon={faQuestionCircle}
          title="Parameter information"
          onClick={() => alert(infoFor(cfg.parameter, "ParameterInfo", "No parameter information available."))}
        />
      </div>
    );

    if (!chartObj || !chartObj.data?.labels?.length) {
      return (
        <div className="plot-panel">
          <div className="plot-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <h4 style={{ margin: 0 }}>{slotLabel}: {cfg.parameter}</h4>
            {icons}
          </div>
          <div className="plot-content" style={{ alignItems: "center", justifyContent: "center" }}>
            <div className="no-plot-message">No data for the current filters.</div>
          </div>
        </div>
      );
    }

    return (
      <div className="plot-panel">
        <div className="plot-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <h4 style={{ margin: 0 }}>{title}</h4>
          {icons}
        </div>
        <div className="plot-content">
          <ReactChart
            type={chartObj.type}
            data={chartObj.data}
            options={{
              responsive: true,
              maintainAspectRatio: false,
              scales: {
                y: {
                  beginAtZero: true,
                  title: { display: true, text: cfg.parameter },
                },
              },
              plugins: {},
            }}
          />
        </div>
      </div>
    );
  };

  return (
    <section className="plots">
      <div className="plots-container">
        {renderPanel(chart1?.title, chart1, cfg1, "Plot 1")}
        {renderPanel(chart2?.title, chart2, cfg2, "Plot 2")}
      </div>
    </section>
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
};

export default Plots;
