import React, { useMemo, useState } from "react";
import Papa from "papaparse";
import {
  faDownload,
  faInfoCircle,
  faLightbulb,
  faQuestionCircle,
} from "@fortawesome/free-solid-svg-icons";
import PropTypes from "prop-types";

import { buildComparisonChart, buildTrendChart } from "./plots/chartBuilders";
import { ChartPanel, IconWithTooltip, LightModal } from "./plots/ChartPanel";
import { defaultColors, makeOptions } from "./plots/chartUtils";
import { formatParameterLabel } from "./parameterMetadata";

const MOCK_DATA_DISCLAIMER = "Disclaimer: This plot panel is currently displaying mock data.";

function Plots({ plotConfigs = [], setPlotConfigs, rawData = [], infoData = {}, loading = false }) {
  const cfg1 = plotConfigs[0];
  const cfg2 = plotConfigs[1];

  const chart1 = useMemo(() => {
    if (!rawData || !cfg1) {
      return null;
    }
    return cfg1.chartType === "trend"
      ? buildTrendChart(rawData, cfg1, defaultColors)
      : buildComparisonChart(rawData, cfg1, defaultColors);
  }, [rawData, cfg1]);

  const chart2 = useMemo(() => {
    if (!rawData || !cfg2) {
      return null;
    }
    return cfg2.chartType === "trend"
      ? buildTrendChart(rawData, cfg2, defaultColors)
      : buildComparisonChart(rawData, cfg2, defaultColors);
  }, [rawData, cfg2]);

  const options1 = useMemo(() => makeOptions(formatParameterLabel(cfg1?.parameter), chart1), [cfg1?.parameter, chart1]);
  const options2 = useMemo(() => makeOptions(formatParameterLabel(cfg2?.parameter), chart2), [cfg2?.parameter, chart2]);
  const [modal, setModal] = useState(null);

  const handlePrevSite = (slot) => {
    if (typeof setPlotConfigs !== "function") {
      return;
    }
    setPlotConfigs((prev) => {
      const next = [...prev];
      const cfg = next[slot];
      if (!cfg) {
        return prev;
      }
      const sites = Array.isArray(cfg.selectedSites) ? cfg.selectedSites : [];
      if (sites.length === 0) {
        return prev;
      }
      const count = sites.length;
      let index = Number.isFinite(cfg.trendIndex) ? cfg.trendIndex : count - 1;
      index = ((index - 1) % count + count) % count;
      next[slot] = { ...cfg, trendIndex: index };
      return next;
    });
  };

  const handleNextSite = (slot) => {
    if (typeof setPlotConfigs !== "function") {
      return;
    }
    setPlotConfigs((prev) => {
      const next = [...prev];
      const cfg = next[slot];
      if (!cfg) {
        return prev;
      }
      const sites = Array.isArray(cfg.selectedSites) ? cfg.selectedSites : [];
      if (sites.length === 0) {
        return prev;
      }
      const count = sites.length;
      let index = Number.isFinite(cfg.trendIndex) ? cfg.trendIndex : count - 1;
      index = (index + 1) % count;
      next[slot] = { ...cfg, trendIndex: index };
      return next;
    });
  };

  const handleDownload = (cfg) => {
    if (!rawData || !cfg) {
      return;
    }

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

  const disclaimer = (
    <div className="plots-disclaimer" role="note">
      {MOCK_DATA_DISCLAIMER}
    </div>
  );

  if (loading || !rawData || rawData.length === 0) {
    return (
      <section className="plots">
        <div className="plots-container">
          {disclaimer}
          <p>Loading data…</p>
        </div>
      </section>
    );
  }

  const iconsFor = (cfg) => (
    <div className="plot-icons" style={{ display: "flex", gap: 12 }}>
      <IconWithTooltip icon={faDownload} label="Download raw data" onClick={() => handleDownload(cfg)} />
      <IconWithTooltip
        icon={faInfoCircle}
        label="Contact information"
        onClick={() => setModal({
          title: "Contact Information",
          body: infoFor(cfg?.parameter, "ContactInfo", "No contact information available."),
        })}
      />
      <IconWithTooltip
        icon={faLightbulb}
        label="Lake association information"
        onClick={() => setModal({
          title: "Lake Association Information",
          body: infoFor(cfg?.parameter, "AssociationInfo", "No association information available."),
        })}
      />
      <IconWithTooltip
        icon={faQuestionCircle}
        label="Parameter information"
        onClick={() => setModal({
          title: "Parameter Information",
          body: infoFor(cfg?.parameter, "ParameterInfo", "No parameter information available."),
        })}
      />
    </div>
  );

  const navFor = (cfg, slot) => {
    if (!cfg || cfg.chartType !== "trend") {
      return null;
    }
    const sites = Array.isArray(cfg.selectedSites) ? cfg.selectedSites : [];
    if (sites.length === 0) {
      return null;
    }
    return {
      prev: () => handlePrevSite(slot),
      next: () => handleNextSite(slot),
      hasMultipleSites: sites.length > 1,
    };
  };

  return (
    <div className="plots-container" style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
      {disclaimer}
      <ChartPanel
        chartObj={chart1}
        cfg={cfg1}
        slotLabel="Plot 1"
        options={options1}
        icons={iconsFor(cfg1)}
        nav={navFor(cfg1, 0)}
      />
      <ChartPanel
        chartObj={chart2}
        cfg={cfg2}
        slotLabel="Plot 2"
        options={options2}
        icons={iconsFor(cfg2)}
        nav={navFor(cfg2, 1)}
      />
      {modal && <LightModal title={modal.title} body={modal.body} onClose={() => setModal(null)} />}
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
      trendIndex: PropTypes.number,
    })
  ).isRequired,
  setPlotConfigs: PropTypes.func.isRequired,
  rawData: PropTypes.arrayOf(PropTypes.object),
  infoData: PropTypes.object,
  loading: PropTypes.bool,
};

export default Plots;
