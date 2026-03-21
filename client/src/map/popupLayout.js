const ESTIMATED_POPUP_WIDTH_PX = 320;
const ESTIMATED_POPUP_HEIGHT_PX = 240;
const POPUP_HORIZONTAL_EDGE_PADDING_PX = 20;
const POPUP_BELOW_OFFSET_Y_PX = 76;

export const DEFAULT_POPUP_LAYOUT = Object.freeze({
  className: "map-site-popup",
  offset: [0, 0],
});

function isFinitePoint(value) {
  return Number.isFinite(Number(value));
}

export function getAdaptivePopupLayout({ containerPoint, mapSize } = {}) {
  const pointX = Number(containerPoint?.x);
  const pointY = Number(containerPoint?.y);
  const mapWidth = Number(mapSize?.x);
  const mapHeight = Number(mapSize?.y);

  if (
    !isFinitePoint(pointX) ||
    !isFinitePoint(pointY) ||
    !isFinitePoint(mapWidth) ||
    !isFinitePoint(mapHeight)
  ) {
    return DEFAULT_POPUP_LAYOUT;
  }

  const minimumHorizontalSpace =
    ESTIMATED_POPUP_WIDTH_PX / 2 + POPUP_HORIZONTAL_EDGE_PADDING_PX;
  const leftCorrection = Math.max(0, minimumHorizontalSpace - pointX);
  const rightCorrection = Math.max(0, minimumHorizontalSpace - (mapWidth - pointX));
  const offsetX = Math.round(leftCorrection - rightCorrection);

  const spaceAbove = pointY;
  const spaceBelow = mapHeight - pointY;
  const shouldOpenBelow =
    spaceAbove < ESTIMATED_POPUP_HEIGHT_PX && spaceBelow > spaceAbove;

  if (!shouldOpenBelow && offsetX === 0) {
    return DEFAULT_POPUP_LAYOUT;
  }

  return {
    className: shouldOpenBelow ? "map-site-popup map-site-popup-below" : "map-site-popup",
    offset: [offsetX, shouldOpenBelow ? POPUP_BELOW_OFFSET_Y_PX : 0],
  };
}
