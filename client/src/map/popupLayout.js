const POPUP_VIEWPORT_PADDING_PX = 20;
const POPUP_BELOW_CLASS_NAME = "map-site-popup-below";
const POPUP_TIP_EDGE_PADDING_PX = 28;

export const DEFAULT_POPUP_LAYOUT = Object.freeze({
  className: "map-site-popup",
  offset: [0, 0],
  tipLeft: null,
});

function isFiniteNumber(value) {
  return Number.isFinite(Number(value));
}

function isValidRect(rect) {
  return (
    isFiniteNumber(rect?.left) &&
    isFiniteNumber(rect?.right) &&
    isFiniteNumber(rect?.top) &&
    isFiniteNumber(rect?.bottom) &&
    isFiniteNumber(rect?.width) &&
    isFiniteNumber(rect?.height)
  );
}

function normalizeOffset(offset) {
  if (Array.isArray(offset)) {
    return [Number(offset[0]) || 0, Number(offset[1]) || 0];
  }

  return [Number(offset?.x) || 0, Number(offset?.y) || 0];
}

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
}

function translateRect(rect, xOffset, yOffset) {
  if (!isValidRect(rect)) {
    return null;
  }

  const deltaX = Number(xOffset) || 0;
  const deltaY = Number(yOffset) || 0;

  return {
    left: rect.left + deltaX,
    right: rect.right + deltaX,
    top: rect.top + deltaY,
    bottom: rect.bottom + deltaY,
    width: rect.width,
    height: rect.height,
  };
}

function buildPopupClassName(openBelow) {
  return openBelow
    ? `${DEFAULT_POPUP_LAYOUT.className} ${POPUP_BELOW_CLASS_NAME}`
    : DEFAULT_POPUP_LAYOUT.className;
}

export function isPopupLayoutBelow(layout) {
  return String(layout?.className || "").includes(POPUP_BELOW_CLASS_NAME);
}

export function getViewportCorrection({ popupRect, mapRect, padding = POPUP_VIEWPORT_PADDING_PX } = {}) {
  if (!isValidRect(popupRect) || !isValidRect(mapRect) || !isFiniteNumber(padding)) {
    return [0, 0];
  }

  const minimumLeft = mapRect.left + Number(padding);
  const maximumLeft = Math.max(minimumLeft, mapRect.right - Number(padding) - popupRect.width);
  const minimumTop = mapRect.top + Number(padding);
  const maximumTop = Math.max(minimumTop, mapRect.bottom - Number(padding) - popupRect.height);

  const targetLeft = clamp(popupRect.left, minimumLeft, maximumLeft);
  const targetTop = clamp(popupRect.top, minimumTop, maximumTop);

  return [Math.round(targetLeft - popupRect.left), Math.round(targetTop - popupRect.top)];
}

function shouldOpenPopupBelow({ currentLayout, markerScreenPoint, popupRect, verticalCorrection }) {
  const markerScreenY = Number(markerScreenPoint?.y);
  if (!isFiniteNumber(markerScreenY) || !isValidRect(popupRect)) {
    return isPopupLayoutBelow(currentLayout);
  }

  const correctedTop = popupRect.top + Number(verticalCorrection || 0);
  const correctedBottom = popupRect.bottom + Number(verticalCorrection || 0);

  if (correctedTop >= markerScreenY) {
    return true;
  }

  if (correctedBottom <= markerScreenY) {
    return false;
  }

  return isPopupLayoutBelow(currentLayout);
}

function getPopupTipLeft({ popupRect, markerScreenPoint } = {}) {
  if (!isValidRect(popupRect) || !isFiniteNumber(markerScreenPoint?.x)) {
    return null;
  }

  const popupWidth = Number(popupRect.width);
  const minimumTipCenter = Math.min(POPUP_TIP_EDGE_PADDING_PX, popupWidth / 2);
  const maximumTipCenter = Math.max(minimumTipCenter, popupWidth - POPUP_TIP_EDGE_PADDING_PX);
  const markerOffsetWithinPopup = Number(markerScreenPoint.x) - popupRect.left;

  return Math.round(clamp(markerOffsetWithinPopup, minimumTipCenter, maximumTipCenter));
}

export function getAdaptivePopupLayout({
  currentLayout = DEFAULT_POPUP_LAYOUT,
  popupRect,
  mapRect,
  markerScreenPoint,
} = {}) {
  const normalizedOffset = normalizeOffset(currentLayout?.offset);
  const basePopupRect = translateRect(popupRect, -normalizedOffset[0], -normalizedOffset[1]);
  const [offsetAdjustmentX, offsetAdjustmentY] = getViewportCorrection({
    popupRect: basePopupRect,
    mapRect,
  });
  const correctedPopupRect = translateRect(basePopupRect, offsetAdjustmentX, offsetAdjustmentY);

  return {
    className: buildPopupClassName(
      shouldOpenPopupBelow({
        currentLayout,
        markerScreenPoint,
        popupRect: basePopupRect,
        verticalCorrection: offsetAdjustmentY,
      })
    ),
    offset: [offsetAdjustmentX, offsetAdjustmentY],
    tipLeft: getPopupTipLeft({
      popupRect: correctedPopupRect,
      markerScreenPoint,
    }),
  };
}
