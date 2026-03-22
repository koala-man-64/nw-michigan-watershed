/* eslint-disable react/prop-types */
import React from "react";
import { render, waitFor } from "@testing-library/react";
import MapPanel from "./MapPanel";
import { fetchSites } from "./api/platformApi";

vi.mock("./runtime/runtimeConfigContext", () => ({
  useRuntimeConfig: () => mocks.runtimeConfig,
}));

const mocks = vi.hoisted(() => {
  const markerInstances = [];
  const runtimeConfig = {
    appTitle: "NW Michigan Water Quality Database",
    bootstrapEndpoint: "/api/portal/bootstrap",
    endpoints: {
      bootstrap: "/api/portal/bootstrap",
      sites: "/api/sites",
      parameters: "/api/parameters",
      measurements: "/api/measurements",
      exportsBase: "/api/exports",
    },
    featureFlags: {
      compareMode: true,
      adminEnabled: false,
      privatePortal: false,
    },
    map: {
      center: [44.75, -85.85],
      zoom: 8,
      minZoom: 7,
      maxZoom: 16,
      tilesetId: "microsoft.base.road",
      tokenRoute: "/api/maps/token",
    },
    revalidateAfterMs: 86400000,
    supportContact: {
      name: "John Ransom",
      organization: "Benzie County Conservation District",
      phoneDisplay: "231-882-4391",
      phoneHref: "tel:+12318824391",
      email: "john@benziecd.org",
    },
    telemetry: {
      connectionString: "",
    },
  };
  const mockMap = {
    invalidateSize: vi.fn(),
    remove: vi.fn(),
    setView: vi.fn(),
    setMinZoom: vi.fn(),
    setMaxZoom: vi.fn(),
    getBounds: vi.fn(() => [
      [44.7, -85.9],
      [44.76, -85.82],
    ]),
    getZoom: vi.fn(() => 8),
  };
  const mockLayerGroup = {
    addTo: vi.fn(() => mockLayerGroup),
    clearLayers: vi.fn(),
  };
  const mockMapContainer = vi.fn();
  const mockAzureMapsBaseLayer = vi.fn(() => null);
  const mockMapTileWarmController = vi.fn(() => null);

  return {
    markerInstances,
    mockAzureMapsBaseLayer,
    mockLayerGroup,
    mockMap,
    mockMapContainer,
    mockMapTileWarmController,
    runtimeConfig,
  };
});

vi.mock("./map/AzureMapsBaseLayer", () => ({
  __esModule: true,
  default: (props) => mocks.mockAzureMapsBaseLayer(props),
}));

vi.mock("./map/MapTileWarmController", () => ({
  __esModule: true,
  default: (props) => mocks.mockMapTileWarmController(props),
}));

vi.mock("./api/platformApi", () => ({
  fetchSites: vi.fn(),
}));

vi.mock("leaflet", () => {
  const DefaultIcon = function DefaultIcon() {};
  DefaultIcon.prototype = {};
  DefaultIcon.mergeOptions = vi.fn();

  function Icon(options) {
    this.options = options;
  }

  Icon.Default = DefaultIcon;

  const createMarker = () => {
    const handlers = {};
    const popupElement = document.createElement("div");
    const popup = {
      getElement: () => popupElement,
    };
    const markerInstance = {
      addTo: vi.fn(() => markerInstance),
      bindPopup: vi.fn((content) => {
        popupElement.innerHTML = content;
        return markerInstance;
      }),
      closePopup: vi.fn(),
      getPopup: vi.fn(() => popup),
      on: vi.fn((eventName, handler) => {
        handlers[eventName] = handler;
        return markerInstance;
      }),
      openPopup: vi.fn(() => {
        handlers.popupopen?.();
        return markerInstance;
      }),
      setIcon: vi.fn(),
      trigger: (eventName, payload) => handlers[eventName]?.(payload),
    };
    mocks.markerInstances.push(markerInstance);
    return markerInstance;
  };

  return {
    __esModule: true,
    default: {
      Icon,
      LayerGroup: function LayerGroup() {},
      layerGroup: () => mocks.mockLayerGroup,
      map: (element, options) => {
        mocks.mockMapContainer({
          element,
          ...options,
        });
        return mocks.mockMap;
      },
      marker: (...args) => {
        const markerInstance = createMarker();
        markerInstance._args = args;
        return markerInstance;
      },
    },
  };
});

describe("MapPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.markerInstances.length = 0;
    mocks.runtimeConfig.map = {
      center: [44.75, -85.85],
      zoom: 8,
      minZoom: 7,
      maxZoom: 16,
      tilesetId: "microsoft.base.road",
      tokenRoute: "/api/maps/token",
    };
    fetchSites.mockResolvedValue([]);
  });

  test("uses the runtime map defaults and fixed road tileset", async () => {
    render(<MapPanel selectedSites={[]} onMarkerClick={vi.fn()} />);

    await waitFor(() => {
      expect(mocks.mockMapContainer).toHaveBeenCalled();
    });

    const mapOptions = mocks.mockMapContainer.mock.calls[0][0];
    expect(mapOptions).toEqual(
      expect.objectContaining({
        center: [44.75, -85.85],
        zoom: 8,
        minZoom: 7,
        maxZoom: 16,
      })
    );
    expect(mapOptions.maxBounds).toBeUndefined();
    expect(mapOptions.maxBoundsViscosity).toBeUndefined();

    await waitFor(() => {
      const lastAzureMapsBaseLayerProps = mocks.mockAzureMapsBaseLayer.mock.calls.at(-1)?.[0];
      expect(lastAzureMapsBaseLayerProps).toEqual(
        expect.objectContaining({
          map: mocks.mockMap,
          tilesetId: "microsoft.base.road",
        })
      );
    });

    const lastMapTileWarmControllerProps = mocks.mockMapTileWarmController.mock.calls.at(-1)?.[0];
    expect(lastMapTileWarmControllerProps).toEqual(
      expect.objectContaining({
        isBaseLayerReady: false,
        map: mocks.mockMap,
        tilesetId: "microsoft.base.road",
      })
    );
  });

  test("does not recreate the Leaflet map when runtime config refreshes", async () => {
    const { rerender } = render(<MapPanel selectedSites={[]} onMarkerClick={vi.fn()} />);

    await waitFor(() => {
      expect(mocks.mockMapContainer).toHaveBeenCalledTimes(1);
    });

    mocks.runtimeConfig.map = {
      ...mocks.runtimeConfig.map,
      center: [44.75, -85.85],
      zoom: 8,
    };

    rerender(<MapPanel selectedSites={[]} onMarkerClick={vi.fn()} />);

    await waitFor(() => {
      expect(mocks.mockMap.setView).toHaveBeenLastCalledWith([44.75, -85.85], 8, {
        animate: false,
      });
    });

    expect(mocks.mockMapContainer).toHaveBeenCalledTimes(1);
  });
});
