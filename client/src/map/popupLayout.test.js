import {
  DEFAULT_POPUP_LAYOUT,
  getAdaptivePopupLayout,
  getViewportCorrection,
} from "./popupLayout";

describe("popupLayout", () => {
  test("returns no correction when the popup is already fully visible", () => {
    expect(
      getViewportCorrection({
        popupRect: {
          left: 120,
          right: 320,
          top: 100,
          bottom: 220,
          width: 200,
          height: 120,
        },
        mapRect: {
          left: 0,
          right: 500,
          top: 0,
          bottom: 400,
          width: 500,
          height: 400,
        },
      })
    ).toEqual([0, 0]);
  });

  test("shifts the popup right by the exact left overflow amount", () => {
    expect(
      getAdaptivePopupLayout({
        currentLayout: DEFAULT_POPUP_LAYOUT,
        popupRect: {
          left: -18,
          right: 202,
          top: 80,
          bottom: 200,
          width: 220,
          height: 120,
        },
        mapRect: {
          left: 0,
          right: 500,
          top: 0,
          bottom: 400,
          width: 500,
          height: 400,
        },
        markerScreenPoint: { x: 92, y: 220 },
      })
    ).toEqual({
      className: "map-site-popup",
      offset: [38, 0],
    });
  });

  test("opens below when correcting a popup that overflows above the map", () => {
    expect(
      getAdaptivePopupLayout({
        currentLayout: DEFAULT_POPUP_LAYOUT,
        popupRect: {
          left: 120,
          right: 360,
          top: -180,
          bottom: 60,
          width: 240,
          height: 240,
        },
        mapRect: {
          left: 0,
          right: 600,
          top: 0,
          bottom: 500,
          width: 600,
          height: 500,
        },
        markerScreenPoint: { x: 240, y: 10 },
      })
    ).toEqual({
      className: "map-site-popup map-site-popup-below",
      offset: [0, 200],
    });
  });

  test("shifts the popup upward when it overflows below the map", () => {
    expect(
      getAdaptivePopupLayout({
        currentLayout: DEFAULT_POPUP_LAYOUT,
        popupRect: {
          left: 160,
          right: 420,
          top: 240,
          bottom: 520,
          width: 260,
          height: 280,
        },
        mapRect: {
          left: 0,
          right: 600,
          top: 0,
          bottom: 500,
          width: 600,
          height: 500,
        },
        markerScreenPoint: { x: 290, y: 430 },
      })
    ).toEqual({
      className: "map-site-popup",
      offset: [0, -40],
    });
  });
});
