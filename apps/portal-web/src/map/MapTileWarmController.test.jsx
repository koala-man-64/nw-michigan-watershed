/* eslint-disable react/prop-types */
import React from "react";
import { render, waitFor } from "@testing-library/react";
import MapTileWarmController from "./MapTileWarmController";
import { warmAzureMapsTiles } from "./azureMapsTileWarm";
import { trackException } from "../utils/telemetry";

const mockMap = {
  getBounds: vi.fn(() => [
    [44.7, -85.9],
    [44.76, -85.82],
  ]),
  getZoom: vi.fn(() => 8),
  id: "map-instance",
};

vi.mock("./azureMapsTileWarm", () => ({
  warmAzureMapsTiles: vi.fn(),
}));

vi.mock("../utils/telemetry", () => ({
  trackException: vi.fn(),
}));

describe("MapTileWarmController", () => {
  const originalRequestIdleCallback = global.requestIdleCallback;
  const originalCancelIdleCallback = global.cancelIdleCallback;

  beforeEach(() => {
    vi.clearAllMocks();
    global.requestIdleCallback = vi.fn((callback) => {
      callback({
        didTimeout: false,
        timeRemaining: () => 15,
      });
      return 1;
    });
    global.cancelIdleCallback = vi.fn();
    warmAzureMapsTiles.mockResolvedValue({ status: "completed" });
  });

  afterAll(() => {
    global.requestIdleCallback = originalRequestIdleCallback;
    global.cancelIdleCallback = originalCancelIdleCallback;
  });

  test("waits for the basemap ready signal before warming", async () => {
    const { rerender } = render(
      <MapTileWarmController
        map={mockMap}
        isBaseLayerReady={false}
        tilesetId="microsoft.base.hybrid.road"
      />
    );

    expect(warmAzureMapsTiles).not.toHaveBeenCalled();

    rerender(
      <MapTileWarmController
        map={mockMap}
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
      <MapTileWarmController
        map={mockMap}
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

    rerender(
      <MapTileWarmController
        map={mockMap}
        isBaseLayerReady
        tilesetId="microsoft.base.road"
      />
    );

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

    render(
      <MapTileWarmController
        map={mockMap}
        isBaseLayerReady
        tilesetId="microsoft.base.hybrid.road"
      />
    );

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
