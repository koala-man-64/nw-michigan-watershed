import markerDefault from "../assets/map-marker-red.svg";
import markerSelected from "../assets/map-marker-green.svg";

const env =
  typeof globalThis !== "undefined" && globalThis.process ? globalThis.process.env : {};

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? "").trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeBaseUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

export const PUBLIC_DATA_BASE_URL = normalizeBaseUrl(env.REACT_APP_PUBLIC_DATA_BASE_URL);
export const DEFAULT_DATA_REVALIDATE_AFTER_MS = parsePositiveInt(
  env.REACT_APP_PUBLIC_DATA_REVALIDATE_AFTER_MS,
  3600000
);

export const DATA_BLOBS = Object.freeze({
  main: env.REACT_APP_PRIMARY_DATA_BLOB || "NWMIWS_Site_Data_testing_varied.csv",
  info: env.REACT_APP_INFO_DATA_BLOB || "info.csv",
  locations: env.REACT_APP_LOCATIONS_DATA_BLOB || "locations.csv",
});

export const MAP_MARKER_ASSETS = Object.freeze({
  default: markerDefault,
  selected: markerSelected,
});

export function buildReadCsvUrl(blobName, format = "csv") {
  const search = new URLSearchParams({
    blob: String(blobName),
    format,
  });

  return `/api/read-csv?${search.toString()}`;
}

export function buildDataUrl(blobName, format = "csv") {
  if (PUBLIC_DATA_BASE_URL && String(format).toLowerCase() === "csv") {
    return `${PUBLIC_DATA_BASE_URL}/${encodeURIComponent(String(blobName))}`;
  }

  return buildReadCsvUrl(blobName, format);
}
