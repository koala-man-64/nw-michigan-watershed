import Papa from "papaparse";
import { trackEvent } from "../utils/telemetry";
import { filterRowsForConfig } from "./chartBuilders";

export function getDownloadRows(rawData = [], cfg = {}) {
  return filterRowsForConfig(rawData, cfg);
}

function buildDownloadFileName(cfg = {}) {
  const parameter = String(cfg.parameter || "data")
    .trim()
    .replace(/\s+/g, "_");
  const chartType = String(cfg.chartType || "chart")
    .trim()
    .replace(/\s+/g, "_");

  return `${parameter}_${chartType}_data.csv`;
}

export function downloadPlotData(rawData, cfg) {
  if (!cfg) {
    return 0;
  }

  const rows = getDownloadRows(rawData, cfg);

  trackEvent("data_downloaded", {
    parameter: cfg.parameter,
    chartType: cfg.chartType,
    selectedSiteCount: Array.isArray(cfg.selectedSites) ? cfg.selectedSites.length : 0,
    rowCount: rows.length,
    startYear: cfg.startYear,
    endYear: cfg.endYear,
  });

  const csv = Papa.unparse(rows);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = buildDownloadFileName(cfg);
  link.click();
  URL.revokeObjectURL(url);

  return rows.length;
}
