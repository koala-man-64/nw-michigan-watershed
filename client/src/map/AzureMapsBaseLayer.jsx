import { useEffect, useRef } from "react";
import PropTypes from "prop-types";
import L from "leaflet";
import { useMap } from "react-leaflet";
import "azure-maps-leaflet";
import { getAzureMapsAuthBundle, getAzureMapsSasToken } from "./azureMapsToken";
import { trackEvent, trackException } from "../utils/telemetry";
import {
  DEFAULT_AZURE_MAPS_TILESET_ID,
  normalizeAzureMapsTilesetId,
} from "./azureMapsTilesets";

const DEFAULT_LANGUAGE = "en-US";
const DEFAULT_VIEW = "Auto";
const LAYER_LOAD_TIMEOUT_MS = 15000;

function AzureMapsBaseLayer({ onStatusChange, tilesetId = DEFAULT_AZURE_MAPS_TILESET_ID }) {
  const map = useMap();
  const hasTrackedReady = useRef(false);
  const resolvedTilesetId = normalizeAzureMapsTilesetId(tilesetId);

  useEffect(() => {
    let disposed = false;
    let failureReported = false;
    let layer = null;
    let loadTimeoutId = null;

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

        const { clientId } = await getAzureMapsAuthBundle();

        if (!L?.tileLayer || typeof L.tileLayer.azureMaps !== "function") {
          throw new Error("Azure Maps Leaflet plugin did not register correctly.");
        }

        if (disposed) {
          return;
        }

        layer = L.tileLayer.azureMaps({
          authOptions: {
            authType: "sas",
            clientId,
            getToken: (resolve, reject) => {
              getAzureMapsSasToken()
                .then(resolve)
                .catch(reject);
            },
          },
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
  onStatusChange: PropTypes.func,
  tilesetId: PropTypes.string,
};

export default AzureMapsBaseLayer;
