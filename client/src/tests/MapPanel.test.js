/* eslint-env jest */
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";

const markerProps = [];
const popupProps = [];
const mockUseCsvData = jest.fn();

jest.mock("react-leaflet", () => ({
  MapContainer: ({ children }) => <div data-testid="map-container">{children}</div>,
  TileLayer: () => null,
  Marker: (props) => {
    markerProps.push(props);
    return <div>{props.children}</div>;
  },
  Popup: (props) => {
    popupProps.push(props);
    return <div>{props.children}</div>;
  },
  useMap: () => ({
    fitBounds: jest.fn(),
  }),
}));

jest.mock("../hooks/useCsvData", () => ({
  __esModule: true,
  default: (...args) => mockUseCsvData(...args),
}));

const MapPanel = require("../MapPanel").default;

describe("MapPanel popup hover behavior", () => {
  beforeEach(() => {
    markerProps.length = 0;
    popupProps.length = 0;
    mockUseCsvData.mockReturnValue({
      data: [
        {
          name: "Mock Lake",
          latitude: "44.1",
          longitude: "-85.6",
          description: "Test description",
          surface_area_acres: "10",
          max_depth_ft: "12",
          avg_depth_ft: "8",
          url: "example.com",
        },
      ],
      error: null,
      loading: false,
    });
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
    mockUseCsvData.mockReset();
  });

  test("keeps a marker popup open while the popup itself is hovered", async () => {
    render(<MapPanel selectedSites={[]} onMarkerClick={jest.fn()} />);

    await waitFor(() => {
      expect(markerProps).toHaveLength(1);
      expect(popupProps).toHaveLength(1);
    });

    const markerHandlers = markerProps[0].eventHandlers;
    const popupHandlers = popupProps[0].eventHandlers;
    const markerTarget = {
      openPopup: jest.fn(),
      closePopup: jest.fn(),
    };
    const popupTarget = {
      close: jest.fn(),
    };

    markerHandlers.mouseover({ target: markerTarget });
    markerHandlers.mouseout({ target: markerTarget });

    expect(markerTarget.openPopup).toHaveBeenCalledTimes(1);
    expect(markerTarget.closePopup).not.toHaveBeenCalled();

    popupHandlers.mouseover({ target: popupTarget });
    jest.advanceTimersByTime(250);

    expect(markerTarget.closePopup).not.toHaveBeenCalled();

    popupHandlers.mouseout({ target: popupTarget });
    jest.advanceTimersByTime(250);

    expect(popupTarget.close).toHaveBeenCalledTimes(1);
  });

  test("shows an alert when location data fails to load", () => {
    mockUseCsvData.mockReturnValue({
      data: null,
      error: new Error("unavailable"),
      loading: false,
    });

    render(<MapPanel selectedSites={[]} onMarkerClick={jest.fn()} />);

    expect(screen.getByRole("alert")).toHaveTextContent("Unable to load site locations.");
  });

  test("normalizes popup links and highlights selected markers with a different icon", async () => {
    mockUseCsvData.mockReturnValue({
      data: [
        {
          name: "Lake Alpha",
          latitude: "44.1",
          longitude: "-85.6",
          description: "Test description",
          surface_area_acres: "10",
          max_depth_ft: "12",
          avg_depth_ft: "8",
          url: "example.com",
        },
        {
          name: "Lake Gamma",
          latitude: "44.2",
          longitude: "-85.7",
          description: "Backup description",
          surface_area_acres: "20",
          max_depth_ft: "30",
          avg_depth_ft: "15",
          url: "https://example.org",
        },
      ],
      error: null,
      loading: false,
    });

    render(<MapPanel selectedSites={["Lake Gamma"]} onMarkerClick={jest.fn()} />);

    await waitFor(() => {
      expect(markerProps).toHaveLength(2);
      expect(screen.getByRole("link", { name: "example.com" })).toHaveAttribute(
        "href",
        "https://example.com"
      );
    });

    expect(markerProps[0].icon).not.toBe(markerProps[1].icon);
  });
});
