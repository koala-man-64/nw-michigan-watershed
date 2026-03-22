export interface SharedMapViewport {
  center: [number, number];
  zoom: number;
  minZoom: number;
  maxZoom: number;
}

export const DEFAULT_MAP_VIEWPORT: SharedMapViewport = {
  center: [44.75, -85.85],
  zoom: 8,
  minZoom: 7,
  maxZoom: 16,
};

export function normalizeMapViewport(
  value: Partial<SharedMapViewport> | undefined,
  fallback: SharedMapViewport = DEFAULT_MAP_VIEWPORT
): SharedMapViewport {
  const center =
    Array.isArray(value?.center) &&
    value.center.length === 2 &&
    Number.isFinite(Number(value.center[0])) &&
    Number.isFinite(Number(value.center[1]))
      ? [Number(value.center[0]), Number(value.center[1])] as [number, number]
      : fallback.center;

  const zoom = Number.isFinite(Number(value?.zoom)) ? Number(value?.zoom) : fallback.zoom;
  const minZoom = Number.isFinite(Number(value?.minZoom)) ? Number(value?.minZoom) : fallback.minZoom;
  const maxZoom = Number.isFinite(Number(value?.maxZoom)) ? Number(value?.maxZoom) : fallback.maxZoom;

  return {
    center,
    zoom,
    minZoom,
    maxZoom,
  };
}
