/* eslint-disable react/prop-types */
import React from "react";
import { render, waitFor } from "@testing-library/react";
import AzureMapsBaseLayer from "./AzureMapsBaseLayer";
import { getAzureMapsAuthBundle } from "./azureMapsToken";
import { createAzureMapsTileLayer } from "./createAzureMapsTileLayer";
import { trackEvent, trackException } from "../utils/telemetry";
import { DEFAULT_AZURE_MAPS_TILESET_ID } from "./azureMapsTilesets";

const mocks = vi.hoisted(() => {
  const removeLayer = vi.fn();
  const map = { removeLayer };
  const layer = {
    addTo: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
  };

  return { layer, map, removeLayer };
});

vi.mock("./azureMapsToken", () => ({
  getAzureMapsAuthBundle: vi.fn(),
}));

vi.mock("./createAzureMapsTileLayer", () => ({
  createAzureMapsTileLayer: vi.fn(),
}));

vi.mock("../utils/telemetry", () => ({
  trackEvent: vi.fn(),
  trackException: vi.fn(),
}));

describe("AzureMapsBaseLayer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createAzureMapsTileLayer.mockReturnValue(mocks.layer);
    getAzureMapsAuthBundle.mockResolvedValue({
      clientId: "maps-client-id",
      token: "sas-token",
      expiresOnUtc: "2099-01-01T00:30:00Z",
    });
  });

  test("creates an Azure Maps layer with cached auth bundle access", async () => {
    const onStatusChange = vi.fn();

    render(
      <AzureMapsBaseLayer
        map={mocks.map}
        onStatusChange={onStatusChange}
        tilesetId="microsoft.base.darkgrey"
      />
    );

    await waitFor(() => expect(createAzureMapsTileLayer).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mocks.layer.on).toHaveBeenCalledTimes(2));

    const options = createAzureMapsTileLayer.mock.calls[0][0];
    expect(options.getAuthBundle).toBe(getAzureMapsAuthBundle);
    expect(options.tilesetId).toBe("microsoft.base.darkgrey");

    const readyHandler = mocks.layer.on.mock.calls.find(
      ([eventName]) => eventName === "tileload"
    )?.[1];
    expect(typeof readyHandler).toBe("function");
    readyHandler();

    expect(onStatusChange).toHaveBeenLastCalledWith({
      state: "ready",
      tilesetId: "microsoft.base.darkgrey",
    });
    expect(trackEvent).toHaveBeenCalledWith(
      "azure_maps_provider_loaded",
      expect.objectContaining({ tilesetId: "microsoft.base.darkgrey" })
    );
  });

  test("falls back to the default tileset when an unsupported value is provided", async () => {
    render(<AzureMapsBaseLayer map={mocks.map} tilesetId="unsupported-tileset" />);

    await waitFor(() => expect(createAzureMapsTileLayer).toHaveBeenCalledTimes(1));
    expect(createAzureMapsTileLayer.mock.calls[0][0]).toEqual(
      expect.objectContaining({ tilesetId: DEFAULT_AZURE_MAPS_TILESET_ID })
    );
  });

  test("reports initialization failures", async () => {
    const onStatusChange = vi.fn();
    const failure = new Error("no token");
    getAzureMapsAuthBundle.mockRejectedValue(failure);

    render(<AzureMapsBaseLayer map={mocks.map} onStatusChange={onStatusChange} />);

    await waitFor(() =>
      expect(onStatusChange).toHaveBeenCalledWith(
        expect.objectContaining({ state: "error", reason: "initialization" })
      )
    );
    expect(trackEvent).toHaveBeenCalledWith(
      "azure_maps_layer_init_failed",
      expect.objectContaining({ reason: "initialization" })
    );
    expect(trackException).toHaveBeenCalledWith(
      failure,
      expect.objectContaining({ component: "AzureMapsBaseLayer" })
    );
  });
});
