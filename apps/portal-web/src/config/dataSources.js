import markerDefault from "../assets/map-marker-red.svg";
import markerSelected from "../assets/map-marker-green.svg";
import { getRuntimeEnv } from "./runtimeEnv";
const STATIC_DATA_BASE_PATH = "/data";

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? "").trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
const env = getRuntimeEnv();
export const DEFAULT_DATA_REVALIDATE_AFTER_MS = parsePositiveInt(
  env.REACT_APP_PUBLIC_DATA_REVALIDATE_AFTER_MS ||
    env.VITE_PUBLIC_DATA_REVALIDATE_AFTER_MS,
  86400000
);

export const DATA_BLOBS = Object.freeze({
  main:
    env.REACT_APP_PRIMARY_DATA_BLOB ||
    env.VITE_PRIMARY_DATA_BLOB ||
    "NWMIWS_Site_Data_testing_varied.csv",
  info: env.REACT_APP_INFO_DATA_BLOB || env.VITE_INFO_DATA_BLOB || "info.csv",
  locations:
    env.REACT_APP_LOCATIONS_DATA_BLOB || env.VITE_LOCATIONS_DATA_BLOB || "locations.csv",
});

export const MAP_MARKER_ASSETS = Object.freeze({
  default: markerDefault,
  selected: markerSelected,
});

export function buildDataUrl(blobName) {
  return `${STATIC_DATA_BASE_PATH}/${encodeURIComponent(String(blobName))}`;
}
