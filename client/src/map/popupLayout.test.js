import { DEFAULT_POPUP_LAYOUT, getAdaptivePopupLayout } from "./popupLayout";

describe("popupLayout", () => {
  test("returns the default layout for central markers", () => {
    expect(
      getAdaptivePopupLayout({
        containerPoint: { x: 320, y: 260 },
        mapSize: { x: 900, y: 700 },
      })
    ).toEqual(DEFAULT_POPUP_LAYOUT);
  });

  test("shifts the popup right when the marker is near the left edge", () => {
    expect(
      getAdaptivePopupLayout({
        containerPoint: { x: 40, y: 260 },
        mapSize: { x: 900, y: 700 },
      })
    ).toEqual(
      expect.objectContaining({
        className: "map-site-popup",
        offset: expect.arrayContaining([expect.any(Number), 0]),
      })
    );
    expect(
      getAdaptivePopupLayout({
        containerPoint: { x: 40, y: 260 },
        mapSize: { x: 900, y: 700 },
      }).offset[0]
    ).toBeGreaterThan(0);
  });

  test("opens the popup below when there is not enough space above", () => {
    expect(
      getAdaptivePopupLayout({
        containerPoint: { x: 320, y: 70 },
        mapSize: { x: 900, y: 700 },
      })
    ).toEqual(
      expect.objectContaining({
        className: "map-site-popup map-site-popup-below",
        offset: [0, 76],
      })
    );
  });
});
