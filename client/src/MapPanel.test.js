import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import MapPanel from "./MapPanel";
import { fetchCachedCsvText } from "./utils/csvCache";

const mockAzureMapsBaseLayer = jest.fn(() => null);
const mockMapTileWarmController = jest.fn(() => null);

jest.mock("./map/AzureMapsBaseLayer", () => ({
  __esModule: true,
  default: (props) => mockAzureMapsBaseLayer(props),
}));

jest.mock("./map/MapTileWarmController", () => ({
  __esModule: true,
  default: (props) => mockMapTileWarmController(props),
}));

jest.mock("./utils/csvCache", () => ({
  fetchCachedCsvText: jest.fn(),
}));

jest.mock("papaparse", () => ({
  parse: jest.fn((_csvText, options) => {
    options.complete({ data: [] });
  }),
}));

jest.mock("react-leaflet", () => {
  const ReactModule = require("react");

  return {
    MapContainer: ({ children }) =>
      ReactModule.createElement("div", { "data-testid": "map-container" }, children),
    Marker: ({ children }) => ReactModule.createElement("div", null, children),
    Popup: ({ children }) => ReactModule.createElement("div", null, children),
  };
});

jest.mock("leaflet", () => {
  const DefaultIcon = function DefaultIcon() {};
  DefaultIcon.prototype = {};
  DefaultIcon.mergeOptions = jest.fn();

  function Icon(options) {
    this.options = options;
  }

  Icon.Default = DefaultIcon;

  return {
    __esModule: true,
    default: {
      Icon,
    },
  };
});

describe("MapPanel", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    fetchCachedCsvText.mockResolvedValue("");
  });

  test("uses the fixed road tileset without rendering a selector", async () => {
    render(<MapPanel selectedSites={[]} onMarkerClick={jest.fn()} />);

    expect(screen.queryByLabelText("Basemap")).not.toBeInTheDocument();

    await waitFor(() => {
      const lastAzureMapsBaseLayerProps = mockAzureMapsBaseLayer.mock.calls.at(-1)?.[0];
      expect(lastAzureMapsBaseLayerProps).toEqual(
        expect.objectContaining({
          tilesetId: "microsoft.base.road",
        })
      );
    });

    const lastMapTileWarmControllerProps = mockMapTileWarmController.mock.calls.at(-1)?.[0];
    expect(lastMapTileWarmControllerProps).toEqual(
      expect.objectContaining({
        isBaseLayerReady: false,
        tilesetId: "microsoft.base.road",
      })
    );
  });
});
