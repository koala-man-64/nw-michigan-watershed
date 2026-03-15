/* eslint-env jest */
/* eslint-disable react/prop-types */
import React from "react";
import { render, waitFor } from "@testing-library/react";
import AzureMapsBaseLayer from "./AzureMapsBaseLayer";
import { getAzureMapsAuthBundle, getAzureMapsSasToken } from "./azureMapsToken";
import { trackEvent, trackException } from "../utils/telemetry";

const mockRemoveLayer = jest.fn();
const mockUseMap = jest.fn(() => ({ removeLayer: mockRemoveLayer }));

jest.mock("react-leaflet", () => ({
  useMap: () => mockUseMap(),
}));

const mockLayer = {
  addTo: jest.fn(),
  on: jest.fn(),
  off: jest.fn(),
};

jest.mock("leaflet", () => ({
  __esModule: true,
  default: {
    tileLayer: {
      azureMaps: jest.fn(() => mockLayer),
    },
  },
}));

jest.mock("azure-maps-leaflet", () => ({}));

jest.mock("./azureMapsToken", () => ({
  getAzureMapsAuthBundle: jest.fn(),
  getAzureMapsSasToken: jest.fn(),
}));

jest.mock("../utils/telemetry", () => ({
  trackEvent: jest.fn(),
  trackException: jest.fn(),
}));

describe("AzureMapsBaseLayer", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getAzureMapsAuthBundle.mockResolvedValue({
      clientId: "maps-client-id",
      token: "sas-token",
      expiresOnUtc: "2099-01-01T00:30:00Z",
    });
    getAzureMapsSasToken.mockResolvedValue("sas-token");
  });

  test("creates an Azure Maps layer with SAS auth", async () => {
    const onStatusChange = jest.fn();
    const { default: L } = await import("leaflet");

    render(<AzureMapsBaseLayer onStatusChange={onStatusChange} />);

    await waitFor(() => expect(L.tileLayer.azureMaps).toHaveBeenCalledTimes(1));

    const options = L.tileLayer.azureMaps.mock.calls[0][0];
    expect(options.authOptions.authType).toBe("sas");
    expect(options.authOptions.clientId).toBe("maps-client-id");

    await options.authOptions.getToken(
      (value) => {
        expect(value).toBe("sas-token");
      },
      (error) => {
        throw error;
      }
    );
  });

  test("reports initialization failures", async () => {
    const onStatusChange = jest.fn();
    const failure = new Error("no token");
    getAzureMapsAuthBundle.mockRejectedValue(failure);

    render(<AzureMapsBaseLayer onStatusChange={onStatusChange} />);

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
