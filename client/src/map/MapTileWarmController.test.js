import React from "react";
import { render, waitFor } from "@testing-library/react";
import MapTileWarmController from "./MapTileWarmController";
import { warmAzureMapsTiles } from "./azureMapsTileWarm";
import { trackException } from "../utils/telemetry";

const mockMap = { id: "map-instance" };

jest.mock("react-leaflet", () => ({
  useMap: () => mockMap,
}));

jest.mock("./azureMapsTileWarm", () => ({
  warmAzureMapsTiles: jest.fn(),
}));

jest.mock("../utils/telemetry", () => ({
  trackException: jest.fn(),
}));

describe("MapTileWarmController", () => {
  const originalRequestIdleCallback = global.requestIdleCallback;
  const originalCancelIdleCallback = global.cancelIdleCallback;

  beforeEach(() => {
    jest.clearAllMocks();
    global.requestIdleCallback = jest.fn((callback) => {
      callback({
        didTimeout: false,
        timeRemaining: () => 15,
      });
      return 1;
    });
    global.cancelIdleCallback = jest.fn();
    warmAzureMapsTiles.mockResolvedValue({ status: "completed" });
  });

  afterAll(() => {
    global.requestIdleCallback = originalRequestIdleCallback;
    global.cancelIdleCallback = originalCancelIdleCallback;
  });

  test("waits for the basemap ready signal before warming", async () => {
    const { rerender } = render(
      <MapTileWarmController
        isBaseLayerReady={false}
        tilesetId="microsoft.base.hybrid.road"
      />
    );

    expect(warmAzureMapsTiles).not.toHaveBeenCalled();

    rerender(
      <MapTileWarmController
        isBaseLayerReady
        tilesetId="microsoft.base.hybrid.road"
      />
    );

    await waitFor(() =>
      expect(warmAzureMapsTiles).toHaveBeenCalledWith({
        map: mockMap,
        tilesetId: "microsoft.base.hybrid.road",
      })
    );
  });

  test("re-warms when the selected tileset changes", async () => {
    const { rerender } = render(
      <MapTileWarmController isBaseLayerReady tilesetId="microsoft.base.hybrid.road" />
    );

    await waitFor(() =>
      expect(warmAzureMapsTiles).toHaveBeenCalledWith({
        map: mockMap,
        tilesetId: "microsoft.base.hybrid.road",
      })
    );

    rerender(<MapTileWarmController isBaseLayerReady tilesetId="microsoft.base.road" />);

    await waitFor(() =>
      expect(warmAzureMapsTiles).toHaveBeenCalledWith({
        map: mockMap,
        tilesetId: "microsoft.base.road",
      })
    );
  });

  test("tracks warm controller failures without surfacing them", async () => {
    const failure = new Error("warm failed");
    warmAzureMapsTiles.mockRejectedValue(failure);

    render(<MapTileWarmController isBaseLayerReady tilesetId="microsoft.base.hybrid.road" />);

    await waitFor(() =>
      expect(trackException).toHaveBeenCalledWith(
        failure,
        expect.objectContaining({
          component: "MapTileWarmController",
        })
      )
    );
  });
});
