import { fetchCsvText, parseCsvRows } from "./api/csvApi";

function formatMeasurement(rawValue, unit) {
  const value = Number(rawValue);
  if (!Number.isFinite(value)) {
    return "N/A";
  }

  const formatted = Number.isInteger(value)
    ? value.toLocaleString()
    : value.toLocaleString(undefined, { maximumFractionDigits: 1 });

  return `${formatted} ${unit}`;
}

export function normalizeLocationUrl(rawUrl) {
  const value = String(rawUrl || "").trim();
  if (!value) {
    return "";
  }

  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

export function normalizeSiteLocationRow(row) {
  const url = String(
    row?.url ||
    row?.URL ||
    row?.link ||
    row?.Link ||
    row?.website ||
    row?.Website ||
    ""
  ).trim();

  return {
    name: String(row?.name || row?.Location || row?.Site || "").trim(),
    lat: parseFloat(row?.latitude ?? row?.Latitude),
    lng: parseFloat(row?.longitude ?? row?.Longitude),
    size: formatMeasurement(row?.surface_area_acres ?? row?.SurfaceAreaAcres, "acres"),
    maxDepth: formatMeasurement(row?.max_depth_ft ?? row?.MaxDepthFt, "ft"),
    avgDepth: formatMeasurement(row?.avg_depth_ft ?? row?.AvgDepthFt, "ft"),
    description: String(row?.description || row?.Description || "No description available.").trim(),
    url,
    href: normalizeLocationUrl(url),
  };
}

export function normalizeSiteLocations(rows = []) {
  return rows
    .map(normalizeSiteLocationRow)
    .filter((location) => (
      location.name &&
      Number.isFinite(location.lat) &&
      Number.isFinite(location.lng)
    ));
}

export function buildSiteLocationIndex(locations = []) {
  return Object.fromEntries(
    locations
      .filter((location) => location?.name)
      .map((location) => [location.name, location])
  );
}

export async function loadSiteLocations() {
  const csvText = await fetchCsvText("locations.csv");
  return normalizeSiteLocations(parseCsvRows(csvText));
}
