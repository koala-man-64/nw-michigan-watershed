import { useEffect, useRef } from "react";
import PropTypes from "prop-types";
import { getAzureMapsAuthBundle } from "./azureMapsToken";
import { trackEvent, trackException } from "../utils/telemetry";
import { createAzureMapsTileLayer } from "./createAzureMapsTileLayer";
import {
  DEFAULT_AZURE_MAPS_TILESET_ID,
  normalizeAzureMapsTilesetId,
} from "./azureMapsTilesets";

const DEFAULT_LANGUAGE = "en-US";
const DEFAULT_VIEW = "Auto";
const LAYER_LOAD_TIMEOUT_MS = 15000;

function AzureMapsBaseLayer({
  map,
  onStatusChange,
  tilesetId = DEFAULT_AZURE_MAPS_TILESET_ID,
}) {
  const hasTrackedReady = useRef(false);
  const resolvedTilesetId = normalizeAzureMapsTilesetId(tilesetId);

  useEffect(() => {
    if (!map) {
      return undefined;
    }

    let disposed = false;
    let failureReported = false;
    let layer = null;
    let loadTimeoutId = null;
    const loadStartedAtMs = globalThis.performance?.now?.() || Date.now();

    hasTrackedReady.current = false;

    const clearLoadTimeout = () => {
      if (loadTimeoutId) {
        window.clearTimeout(loadTimeoutId);
        loadTimeoutId = null;
      }
    };

    const updateStatus = (status) => {
      if (!disposed && onStatusChange) {
        onStatusChange(status);
      }
    };

    const reportFailure = (reason, error) => {
      if (failureReported || disposed) {
        return;
      }

      failureReported = true;
      clearLoadTimeout();

      const exception =
        error instanceof Error ? error : new Error(String(error || "Azure Maps layer failed."));

      updateStatus({
        state: "error",
        reason,
        message:
          "Site markers remain available, but the background map could not be loaded.",
        tilesetId: resolvedTilesetId,
      });
      trackEvent("azure_maps_layer_init_failed", {
        reason,
        tilesetId: resolvedTilesetId,
      });
      trackException(exception, {
        component: "AzureMapsBaseLayer",
        reason,
        tilesetId: resolvedTilesetId,
      });
    };

    const handleTileLoad = () => {
      clearLoadTimeout();

      if (hasTrackedReady.current || disposed) {
        return;
      }

      hasTrackedReady.current = true;
      updateStatus({ state: "ready", tilesetId: resolvedTilesetId });
      trackEvent("azure_maps_provider_loaded", {
        durationMs: Math.max(
          0,
          Math.round((globalThis.performance?.now?.() || Date.now()) - loadStartedAtMs)
        ),
        tilesetId: resolvedTilesetId,
        language: DEFAULT_LANGUAGE,
        view: DEFAULT_VIEW,
      });
    };

    const handleTileError = (event) => {
      const error = new Error("Azure Maps tile request failed.");

      if (!hasTrackedReady.current) {
        reportFailure("tile-error", error);
        return;
      }

      trackException(error, {
        component: "AzureMapsBaseLayer",
        reason: "tile-error-after-ready",
        coords: event?.coords,
      });
    };

    const initializeLayer = async () => {
      try {
        updateStatus({ state: "loading", tilesetId: resolvedTilesetId });

        await getAzureMapsAuthBundle();

        if (disposed) {
          return;
        }

        layer = createAzureMapsTileLayer({
          getAuthBundle: getAzureMapsAuthBundle,
          tilesetId: resolvedTilesetId,
          language: DEFAULT_LANGUAGE,
          view: DEFAULT_VIEW,
        });

        layer.on("tileload", handleTileLoad);
        layer.on("tileerror", handleTileError);
        layer.addTo(map);

        loadTimeoutId = window.setTimeout(() => {
          if (!hasTrackedReady.current) {
            reportFailure(
              "load-timeout",
              new Error("Azure Maps basemap did not finish loading before the timeout.")
            );
          }
        }, LAYER_LOAD_TIMEOUT_MS);
      } catch (error) {
        reportFailure("initialization", error);
      }
    };

    initializeLayer();

    return () => {
      disposed = true;
      clearLoadTimeout();

      if (layer) {
        layer.off("tileload", handleTileLoad);
        layer.off("tileerror", handleTileError);
        map.removeLayer(layer);
      }
    };
  }, [map, onStatusChange, resolvedTilesetId]);

  return null;
}

AzureMapsBaseLayer.propTypes = {
  map: PropTypes.shape({
    removeLayer: PropTypes.func.isRequired,
  }).isRequired,
  onStatusChange: PropTypes.func,
  tilesetId: PropTypes.string,
};

export default AzureMapsBaseLayer;
