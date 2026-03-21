export const DEFAULT_AZURE_MAPS_TILESET_ID = "microsoft.base.hybrid.road";

export const AZURE_MAPS_TILESET_OPTIONS = [
  {
    value: DEFAULT_AZURE_MAPS_TILESET_ID,
    label: "Hybrid road",
  },
  {
    value: "microsoft.base.road",
    label: "Road",
  },
  {
    value: "microsoft.base.darkgrey",
    label: "Dark grayscale",
  },
  {
    value: "microsoft.imagery",
    label: "Imagery",
  },
];

const CACHEABLE_AZURE_MAPS_TILESET_IDS = new Set(
  AZURE_MAPS_TILESET_OPTIONS.map(({ value }) => value)
);

export function isCacheableAzureMapsTilesetId(tilesetId) {
  return CACHEABLE_AZURE_MAPS_TILESET_IDS.has(String(tilesetId || ""));
}

export function normalizeAzureMapsTilesetId(tilesetId) {
  return isCacheableAzureMapsTilesetId(tilesetId)
    ? String(tilesetId)
    : DEFAULT_AZURE_MAPS_TILESET_ID;
}
