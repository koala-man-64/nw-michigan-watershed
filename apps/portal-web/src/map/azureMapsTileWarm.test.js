import {
  AZURE_MAPS_TILESET_ID,
  buildAzureMapsTileUrl,
  collectTileUrlsForBounds,
  isAzureMapsBaseTileUrl,
  resetAzureMapsTileWarmForTests,
  warmAzureMapsTiles,
} from "./azureMapsTileWarm";
import { getAzureMapsAuthBundle } from "./azureMapsToken";
import { trackEvent, trackException } from "../utils/telemetry";

vi.mock("./azureMapsToken", () => ({
  getAzureMapsAuthBundle: vi.fn(),
}));

vi.mock("../utils/telemetry", () => ({
  trackEvent: vi.fn(),
  trackException: vi.fn(),
}));

describe("azureMapsTileWarm", () => {
  let cache;
  let cacheStorage;
  let fetchImpl;
  let navigatorImpl;
  let map;

  beforeEach(() => {
    vi.clearAllMocks();
    resetAzureMapsTileWarmForTests();

    cache = {
      delete: vi.fn().mockResolvedValue(true),
      match: vi.fn().mockResolvedValue(null),
    };
    cacheStorage = {
      open: vi.fn().mockResolvedValue(cache),
    };
    fetchImpl = vi.fn().mockResolvedValue({ ok: true });
    navigatorImpl = {
      connection: {},
      serviceWorker: {
        controller: {},
      },
    };
    map = {
      getBounds: vi.fn(() => [
        [44.7, -85.9],
        [44.76, -85.82],
      ]),
      getZoom: vi.fn(() => 8),
    };

    getAzureMapsAuthBundle.mockResolvedValue({
      clientId: "maps-client-id",
      token: "sas-token",
      expiresOnUtc: "2099-01-01T00:30:00Z",
    });
  });

  test("identifies Azure Maps base-tile URLs", () => {
    expect(
      isAzureMapsBaseTileUrl(
        buildAzureMapsTileUrl({
          x: 1,
          y: 2,
          zoom: 3,
        })
      )
    ).toBe(true);

    expect(
      isAzureMapsBaseTileUrl(
        buildAzureMapsTileUrl({
          x: 1,
          y: 2,
          zoom: 3,
          tilesetId: "microsoft.imagery",
        })
      )
    ).toBe(true);

    expect(
      isAzureMapsBaseTileUrl(
        "https://atlas.microsoft.com/map/tile?tilesetId=microsoft.traffic.flow.main&zoom=3&x=1&y=2"
      )
    ).toBe(false);
  });

  test("builds stable Azure Maps tile URLs", () => {
    const url = buildAzureMapsTileUrl({
      x: 4,
      y: 5,
      zoom: 6,
    });

    expect(url).toContain("https://atlas.microsoft.com/map/tile?");
    expect(url).toContain(`tilesetId=${AZURE_MAPS_TILESET_ID}`);
    expect(url).toContain("zoom=6");
    expect(url).toContain("x=4");
    expect(url).toContain("y=5");
  });

  test("collects tile URLs for a bounded viewport", () => {
    const urls = collectTileUrlsForBounds(
      [
        [44.7, -85.9],
        [44.76, -85.82],
      ],
      8,
      { ringSize: 0 }
    );

    expect(urls.length).toBeGreaterThan(0);
    urls.forEach((url) => expect(isAzureMapsBaseTileUrl(url)).toBe(true));
  });

  test("skips warming when there is no active service worker controller", async () => {
    navigatorImpl.serviceWorker.controller = null;

    await expect(
      warmAzureMapsTiles({
        cacheStorage,
        fetchImpl,
        map,
        navigatorImpl,
      })
    ).resolves.toEqual({
      reason: "no-controller",
      status: "skipped",
    });

    expect(trackEvent).toHaveBeenCalledWith("azure_maps_tile_warm_skipped", {
      reason: "no-controller",
      tilesetId: AZURE_MAPS_TILESET_ID,
    });
  });

  test("warms uncached tiles with SAS auth headers and tracks completion", async () => {
    const result = await warmAzureMapsTiles({
      cacheStorage,
      fetchImpl,
      map,
      navigatorImpl,
      now: vi.fn().mockReturnValueOnce(1000).mockReturnValueOnce(1600),
    });

    expect(result.status).toBe("completed");
    expect(result.requestedTileCount).toBeGreaterThan(0);
    expect(result.prefetchedTileCount).toBe(result.requestedTileCount);
    expect(result.skippedCachedCount).toBe(0);
    expect(result.failedTileCount).toBe(0);
    expect(fetchImpl).toHaveBeenCalled();
    expect(fetchImpl.mock.calls[0][1]).toMatchObject({
      credentials: "omit",
      headers: {
        Authorization: "jwt-sas sas-token",
        "x-ms-client-id": "maps-client-id",
      },
      mode: "cors",
    });
    expect(trackEvent).toHaveBeenCalledWith(
      "azure_maps_tile_warm_started",
      expect.objectContaining({
        zoomLevels: "8,9",
      }),
      expect.objectContaining({
        requestedTileCount: result.requestedTileCount,
      })
    );
    expect(trackEvent).toHaveBeenCalledWith(
      "azure_maps_tile_warm_completed",
      expect.objectContaining({
        zoomLevels: "8,9",
      }),
      expect.objectContaining({
        requestedTileCount: result.requestedTileCount,
      })
    );
  });

  test("does not warm more than once per page load", async () => {
    await warmAzureMapsTiles({
      cacheStorage,
      fetchImpl,
      map,
      navigatorImpl,
    });

    await expect(
      warmAzureMapsTiles({
        cacheStorage,
        fetchImpl,
        map,
        navigatorImpl,
      })
    ).resolves.toEqual({
      reason: "already-warmed",
      status: "skipped",
    });
  });

  test("allows a different supported tileset to warm on the same page", async () => {
    await warmAzureMapsTiles({
      cacheStorage,
      fetchImpl,
      map,
      navigatorImpl,
      tilesetId: "microsoft.base.hybrid.road",
    });

    fetchImpl.mockClear();

    await expect(
      warmAzureMapsTiles({
        cacheStorage,
        fetchImpl,
        map,
        navigatorImpl,
        tilesetId: "microsoft.base.darkgrey",
      })
    ).resolves.toEqual(
      expect.objectContaining({
        status: "completed",
      })
    );

    expect(fetchImpl).toHaveBeenCalled();
  });

  test("tracks the first tile fetch failure while completing the warm run", async () => {
    fetchImpl
      .mockResolvedValueOnce({ ok: false, status: 401 })
      .mockResolvedValue({ ok: true });

    const result = await warmAzureMapsTiles({
      cacheStorage,
      fetchImpl,
      map,
      navigatorImpl,
    });

    expect(result.failedTileCount).toBeGreaterThan(0);
    expect(trackException).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 401,
      }),
      expect.objectContaining({
        component: "azureMapsTileWarm",
      })
    );
  });
});
