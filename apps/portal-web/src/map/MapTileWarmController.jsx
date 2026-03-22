import { useEffect } from "react";
import PropTypes from "prop-types";
import { trackException } from "../utils/telemetry";
import { warmAzureMapsTiles } from "./azureMapsTileWarm";
import { DEFAULT_AZURE_MAPS_TILESET_ID } from "./azureMapsTilesets";

function createFallbackIdleDeadline() {
  return {
    didTimeout: false,
    timeRemaining: () => 0,
  };
}

function MapTileWarmController({
  map,
  isBaseLayerReady,
  tilesetId = DEFAULT_AZURE_MAPS_TILESET_ID,
}) {
  useEffect(() => {
    if (!isBaseLayerReady) {
      return undefined;
    }

    let cancelled = false;
    const scheduleIdleCallback =
      globalThis.requestIdleCallback ||
      ((callback) => globalThis.setTimeout(() => callback(createFallbackIdleDeadline()), 2000));
    const cancelIdleCallback =
      globalThis.cancelIdleCallback || ((handle) => globalThis.clearTimeout(handle));

    const idleHandle = scheduleIdleCallback(async () => {
      if (cancelled) {
        return;
      }

      try {
        await warmAzureMapsTiles({ map, tilesetId });
      } catch (error) {
        trackException(error, {
          component: "MapTileWarmController",
        });
      }
    });

    return () => {
      cancelled = true;
      cancelIdleCallback(idleHandle);
    };
  }, [isBaseLayerReady, map, tilesetId]);

  return null;
}

MapTileWarmController.propTypes = {
  map: PropTypes.shape({
    getBounds: PropTypes.func.isRequired,
    getZoom: PropTypes.func.isRequired,
  }).isRequired,
  isBaseLayerReady: PropTypes.bool.isRequired,
  tilesetId: PropTypes.string,
};

export default MapTileWarmController;
