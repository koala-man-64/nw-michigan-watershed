const WATER_QUALITY_PARAMETER_METADATA = Object.freeze({
  Chlorophyll: Object.freeze({ unit: "ug/L" }),
  Chloride: Object.freeze({ unit: "mg/L" }),
  Conductivity: Object.freeze({ unit: "uS/cm" }),
  "Flow Rate": Object.freeze({ unit: "cfs" }),
  Nitrate: Object.freeze({ unit: "mg/L" }),
  "Secchi Depth": Object.freeze({ unit: "m" }),
  "Total Phosphorus": Object.freeze({ unit: "ug/L" }),
  "Trophic State Index": Object.freeze({ unit: "unitless" }),
});

const PARAMETER_ALIASES = Object.freeze({
  chloro: "Chlorophyll",
  "chlorophyll a": "Chlorophyll",
  "chlorophyll-a": "Chlorophyll",
  cloride: "Chloride",
  secchi: "Secchi Depth",
  tp: "Total Phosphorus",
  "total phosphorous": "Total Phosphorus",
  tsi: "Trophic State Index",
});

function normalizeParameterKey(parameter) {
  return typeof parameter === "string" ? parameter.trim().toLowerCase() : "";
}

const CANONICAL_PARAMETER_NAMES = Object.freeze(
  Object.fromEntries(
    Object.keys(WATER_QUALITY_PARAMETER_METADATA).map((parameter) => [
      normalizeParameterKey(parameter),
      parameter,
    ])
  )
);

const NORMALIZED_PARAMETER_LOOKUP = Object.freeze(
  Object.fromEntries(
    Object.entries(PARAMETER_ALIASES).map(([alias, canonicalName]) => [
      normalizeParameterKey(alias),
      canonicalName,
    ])
  )
);

export const WATER_QUALITY_PARAMETER_UNITS = Object.freeze(
  Object.fromEntries(
    Object.entries(WATER_QUALITY_PARAMETER_METADATA).map(([parameter, metadata]) => [
      parameter,
      metadata.unit,
    ])
  )
);

export function getCanonicalParameterName(parameter) {
  const normalized = normalizeParameterKey(parameter);
  if (!normalized) {
    return "";
  }

  return (
    NORMALIZED_PARAMETER_LOOKUP[normalized] ||
    CANONICAL_PARAMETER_NAMES[normalized] ||
    String(parameter).trim()
  );
}

export function getParameterMetadata(parameter) {
  const canonicalName = getCanonicalParameterName(parameter);
  return WATER_QUALITY_PARAMETER_METADATA[canonicalName] || null;
}

export function getParameterUnit(parameter) {
  return getParameterMetadata(parameter)?.unit || "";
}

export function formatParameterLabel(parameter) {
  const canonicalName = getCanonicalParameterName(parameter);
  if (!canonicalName) {
    return "";
  }

  const unit = getParameterUnit(canonicalName);
  return unit ? `${canonicalName} (${unit})` : canonicalName;
}
