/* eslint-env jest */
import React from "react";
import { render, waitFor } from "@testing-library/react";

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

jest.mock("./hooks/useCsvData", () => ({
  __esModule: true,
  default: (...args) => mockUseCsvData(...args),
}));

const MapPanel = require("./MapPanel").default;

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
});
