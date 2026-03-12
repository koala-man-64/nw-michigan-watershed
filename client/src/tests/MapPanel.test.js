/* eslint-env jest */
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";

const markerProps = [];
const popupProps = [];
const mapContainerProps = [];

jest.mock("react-leaflet", () => ({
  MapContainer: (props) => {
    mapContainerProps.push(props);
    return <div data-testid="map-container">{props.children}</div>;
  },
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

const MapPanel = require("../MapPanel").default;

describe("MapPanel popup hover behavior", () => {
  const locations = [
    {
      name: "Mock Lake",
      lat: 44.1,
      lng: -85.6,
      description: "Test description",
      size: "10 acres",
      maxDepth: "12 ft",
      avgDepth: "8 ft",
      url: "example.com",
      href: "https://example.com",
    },
  ];

  beforeEach(() => {
    markerProps.length = 0;
    popupProps.length = 0;
    mapContainerProps.length = 0;
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  test("keeps a marker popup open while the popup itself is hovered", async () => {
    render(<MapPanel locations={locations} selectedSites={[]} onMarkerClick={jest.fn()} />);

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
    render(
      <MapPanel
        locations={[]}
        loadError="Unable to load site locations."
        selectedSites={[]}
        onMarkerClick={jest.fn()}
      />
    );

    expect(screen.getByRole("alert")).toHaveTextContent("Unable to load site locations.");
  });

  test("defaults the map center to Silver Lake coordinates", () => {
    render(<MapPanel locations={[]} selectedSites={[]} onMarkerClick={jest.fn()} />);

    expect(mapContainerProps[0].center).toEqual([44.695508, -85.685679]);
    expect(mapContainerProps[0].zoom).toBe(8);
  });

  test("normalizes popup links and highlights selected markers with a different icon", async () => {
    render(
      <MapPanel
        locations={[
          {
            name: "Lake Alpha",
            lat: 44.1,
            lng: -85.6,
            description: "Test description",
            size: "10 acres",
            maxDepth: "12 ft",
            avgDepth: "8 ft",
            url: "example.com",
            href: "https://example.com",
          },
          {
            name: "Lake Gamma",
            lat: 44.2,
            lng: -85.7,
            description: "Backup description",
            size: "20 acres",
            maxDepth: "30 ft",
            avgDepth: "15 ft",
            url: "https://example.org",
            href: "https://example.org",
          },
        ]}
        selectedSites={["Lake Gamma"]}
        onMarkerClick={jest.fn()}
      />
    );

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
