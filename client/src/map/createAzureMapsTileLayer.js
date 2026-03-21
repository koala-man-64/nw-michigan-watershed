import L from "leaflet";
import {
  AZURE_MAPS_TILE_LANGUAGE,
  AZURE_MAPS_TILE_SIZE,
  AZURE_MAPS_TILE_VIEW,
  buildAzureMapsTileUrl,
} from "./azureMapsTileWarm";
import {
  DEFAULT_AZURE_MAPS_TILESET_ID,
  normalizeAzureMapsTilesetId,
} from "./azureMapsTilesets";

function createTileKey(coords) {
  return `${coords.z}/${coords.x}/${coords.y}`;
}

function buildTileRequestHeaders(authBundle) {
  return {
    Authorization: `jwt-sas ${authBundle.token}`,
    "x-ms-client-id": authBundle.clientId,
  };
}

export function createAzureMapsTileLayer({
  fetchImpl = globalThis.fetch,
  getAuthBundle,
  language = AZURE_MAPS_TILE_LANGUAGE,
  tileSize = AZURE_MAPS_TILE_SIZE,
  tilesetId = DEFAULT_AZURE_MAPS_TILESET_ID,
  view = AZURE_MAPS_TILE_VIEW,
} = {}) {
  if (!L?.TileLayer?.extend || typeof fetchImpl !== "function" || typeof getAuthBundle !== "function") {
    throw new Error("Azure Maps tile layer dependencies are unavailable.");
  }

  const resolvedTilesetId = normalizeAzureMapsTilesetId(tilesetId);

  const AzureMapsTileLayer = L.TileLayer.extend({
    initialize(options = {}) {
      this._pendingTileRequests = new Map();
      L.TileLayer.prototype.initialize.call(this, "", {
        keepBuffer: 1,
        tileSize,
        updateWhenIdle: false,
        ...options,
      });
      this.on("tileunload", this._handleTileUnload, this);
    },

    getTileUrl(coords) {
      return buildAzureMapsTileUrl({
        x: coords.x,
        y: coords.y,
        zoom: coords.z,
        tilesetId: resolvedTilesetId,
        language,
        view,
        tileSize,
      });
    },

    createTile(coords, done) {
      const tile = document.createElement("img");
      const tileKey = createTileKey(coords);
      const abortController =
        typeof AbortController === "function" ? new AbortController() : null;
      const pendingRequest = {
        abortController,
        objectUrl: "",
      };

      tile.alt = "";
      tile.decoding = "async";
      tile.setAttribute("role", "presentation");
      tile.style.visibility = "hidden";

      this._pendingTileRequests.set(tileKey, pendingRequest);

      const finalize = () => {
        if (this._pendingTileRequests.get(tileKey) === pendingRequest) {
          this._pendingTileRequests.delete(tileKey);
        }
      };

      const revokeObjectUrl = () => {
        if (pendingRequest.objectUrl) {
          URL.revokeObjectURL(pendingRequest.objectUrl);
          pendingRequest.objectUrl = "";
        }
      };

      const reportFailure = (error) => {
        finalize();
        revokeObjectUrl();
        done(
          error instanceof Error
            ? error
            : new Error(String(error || "Azure Maps tile request failed.")),
          tile
        );
      };

      tile.onload = () => {
        finalize();
        revokeObjectUrl();
        done(null, tile);
      };

      tile.onerror = () => {
        reportFailure(new Error("Azure Maps tile image failed to decode."));
      };

      void (async () => {
        try {
          const authBundle = await getAuthBundle();
          if (abortController?.signal.aborted) {
            finalize();
            revokeObjectUrl();
            return;
          }

          const response = await fetchImpl(this.getTileUrl(coords), {
            headers: buildTileRequestHeaders(authBundle),
            method: "GET",
            mode: "cors",
            signal: abortController?.signal,
          });

          if (!response.ok) {
            const error = new Error(`Azure Maps tile request failed with ${response.status}.`);
            error.status = response.status;
            throw error;
          }

          const blob = await response.blob();
          if (abortController?.signal.aborted) {
            finalize();
            revokeObjectUrl();
            return;
          }

          pendingRequest.objectUrl = URL.createObjectURL(blob);
          tile.src = pendingRequest.objectUrl;
          tile.style.visibility = "visible";
        } catch (error) {
          if (error?.name === "AbortError") {
            finalize();
            revokeObjectUrl();
            return;
          }

          reportFailure(error);
        }
      })();

      return tile;
    },

    _handleTileUnload(event) {
      const tileKey = createTileKey(event.coords);
      const pendingRequest = this._pendingTileRequests.get(tileKey);
      if (!pendingRequest) {
        return;
      }

      pendingRequest.abortController?.abort();
      if (pendingRequest.objectUrl) {
        URL.revokeObjectURL(pendingRequest.objectUrl);
      }
      this._pendingTileRequests.delete(tileKey);
    },
  });

  return new AzureMapsTileLayer();
}
