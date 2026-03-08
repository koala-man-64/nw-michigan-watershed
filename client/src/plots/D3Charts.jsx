import React from "react";
import * as d3 from "d3";
import PropTypes from "prop-types";

import { FONT_FAMILY, fontScale } from "./chartUtils";

const BOXPLOT_VIEWBOX = { width: 800, height: 420 };
const D3BAR_VIEWBOX = { width: 800, height: 440 };
const TOOLTIP_FADE_MS = 180;
const AXIS_LABEL_ROTATION = -90;
const TICK_FONT_SIZE = 13 * fontScale;
const TOOLTIP_FONT_SIZE = 13 * fontScale;
const COUNT_LABEL_FONT_SIZE = 14 * fontScale;
const BAR_INTERIOR_LABEL_FONT_SIZE = 14 * fontScale;
const AXIS_LABEL_FONT_SIZE = 14 * fontScale;
const AXIS_LABEL_X_OFFSET = -52;
const X_AXIS_LABEL_FONT_SIZE = 14 * fontScale;
const D3_CHART_HORIZONTAL_MARGIN = { left: 84, right: 28 };

function wrapLabelLines(label) {
  const items = (Array.isArray(label) ? label : [label])
    .map((item) => String(item ?? "").trim())
    .filter(Boolean);
  return items.length ? items.slice(0, 2) : ["—"];
}

function flattenLabel(label) {
  return wrapLabelLines(label).join(" ");
}

function extractUnits(label) {
  if (typeof label !== "string") {
    return "";
  }

  const match = label.trim().match(/\(([^)]+)\)\s*$/);
  return match ? match[1].trim() : "";
}

function formatValueWithUnits(value, units) {
  return units ? `${value} ${units}` : value;
}

function getBarLabelColor(fillColor) {
  if (typeof fillColor !== "string") {
    return "#ffffff";
  }

  const normalized = fillColor.trim();
  const match = normalized.match(/^#([0-9a-f]{6})$/i);
  if (!match) {
    return "#ffffff";
  }

  const hex = match[1];
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return luminance > 0.62 ? "#1f2937" : "#ffffff";
}

function useFadingTooltip() {
  const [tooltip, setTooltip] = React.useState(null);
  const tooltipRef = React.useRef(null);
  const hideTimeoutRef = React.useRef(null);

  const clearHideTimeout = React.useCallback(() => {
    if (hideTimeoutRef.current != null) {
      window.clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
  }, []);

  React.useEffect(() => {
    tooltipRef.current = tooltip;
  }, [tooltip]);

  React.useEffect(() => clearHideTimeout, [clearHideTimeout]);

  const showTooltip = React.useCallback((nextTooltip) => {
    clearHideTimeout();
    setTooltip({ ...nextTooltip, isFading: false });
  }, [clearHideTimeout]);

  const hideTooltip = React.useCallback(() => {
    if (!tooltipRef.current) {
      return;
    }

    clearHideTimeout();
    setTooltip((current) => (current ? { ...current, isFading: true } : current));
    hideTimeoutRef.current = window.setTimeout(() => {
      setTooltip(null);
      hideTimeoutRef.current = null;
    }, TOOLTIP_FADE_MS);
  }, [clearHideTimeout]);

  return { tooltip, showTooltip, hideTooltip };
}

function TooltipOverlay({ tooltip, children, contentStyle = {} }) {
  if (!tooltip) {
    return null;
  }

  const fadeStyle = {
    opacity: tooltip.isFading ? 0 : 1,
    transition: `opacity ${TOOLTIP_FADE_MS}ms ease`,
  };

  return (
    <>
      <span
        role="tooltip"
        style={{
          position: "fixed",
          left: tooltip.x,
          top: Math.max(8, tooltip.y - 12),
          transform: "translate(-50%, -100%)",
          background: "rgba(31, 41, 55, 0.98)",
          color: "#fff",
          borderRadius: 6,
          pointerEvents: "none",
          zIndex: 999999,
          boxShadow: "0 6px 18px rgba(0,0,0,.28)",
          ...fadeStyle,
          ...contentStyle,
        }}
      >
        {children}
      </span>
      <span
        style={{
          position: "fixed",
          left: tooltip.x,
          top: Math.max(8, tooltip.y - 12),
          transform: "translate(-50%, -2px)",
          width: 0,
          height: 0,
          borderLeft: "6px solid transparent",
          borderRight: "6px solid transparent",
          borderTop: "6px solid rgba(31, 41, 55, 0.98)",
          pointerEvents: "none",
          zIndex: 999999,
          ...fadeStyle,
        }}
      />
    </>
  );
}

TooltipOverlay.propTypes = {
  tooltip: PropTypes.shape({
    x: PropTypes.number.isRequired,
    y: PropTypes.number.isRequired,
    isFading: PropTypes.bool,
  }),
  children: PropTypes.node.isRequired,
  contentStyle: PropTypes.object,
};

function D3Boxplot({ labels, series, color = "#37474f", yDomain, counts = [], yLabel = "", xLabel = "" }) {
  const margin = { top: 16, right: D3_CHART_HORIZONTAL_MARGIN.right, bottom: 48, left: D3_CHART_HORIZONTAL_MARGIN.left };
  const { tooltip: hover, showTooltip, hideTooltip } = useFadingTooltip();
  const units = React.useMemo(() => extractUnits(yLabel), [yLabel]);

  const format = React.useCallback((value) => (
    Number.isFinite(value)
      ? Number(value).toFixed(3).replace(/\.0+$/, "").replace(/\.([^0]*)0+$/, ".$1")
      : "—"
  ), []);

  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }}>
      <svg
        width="100%"
        height="100%"
        viewBox={`0 0 ${BOXPLOT_VIEWBOX.width} ${BOXPLOT_VIEWBOX.height}`}
        preserveAspectRatio="xMidYMid meet"
      >
        <BoxplotInner
          labels={labels}
          series={series}
          color={color}
          counts={counts}
          yDomain={yDomain}
          yLabel={yLabel}
          xLabel={xLabel}
          margin={margin}
          width={BOXPLOT_VIEWBOX.width}
          height={BOXPLOT_VIEWBOX.height}
          onHover={(event, index, stats, label) => {
            showTooltip({
              x: event.clientX,
              y: event.clientY,
              label: Array.isArray(label) ? label.join(" ") : String(label),
              stats,
            });
          }}
          onLeave={hideTooltip}
        />
      </svg>

      <TooltipOverlay
        tooltip={hover}
        contentStyle={{
          fontSize: TOOLTIP_FONT_SIZE,
          padding: "8px 10px",
          display: "grid",
          gridTemplateColumns: "auto auto",
          columnGap: 10,
          rowGap: 2,
          whiteSpace: "nowrap",
        }}
      >
        {hover?.label && (
          <strong
            style={{
              gridColumn: "1 / -1",
              marginBottom: 4,
              fontWeight: 900,
            }}
          >
            {hover.label}
          </strong>
        )}
        <span style={{ textAlign: "right", color: "#fff" }}>Max:</span>
        <span style={{ fontVariantNumeric: "tabular-nums" }}>{hover ? formatValueWithUnits(format(hover.stats.max), units) : ""}</span>
        {Number.isFinite(hover?.stats?.mean) && (
          <>
            <span style={{ textAlign: "right", color: "#fff" }}>Mean:</span>
            <span style={{ fontVariantNumeric: "tabular-nums" }}>{formatValueWithUnits(format(hover.stats.mean), units)}</span>
          </>
        )}
        <span style={{ textAlign: "right", color: "#fff" }}>Min:</span>
        <span style={{ fontVariantNumeric: "tabular-nums" }}>{hover ? formatValueWithUnits(format(hover.stats.min), units) : ""}</span>
      </TooltipOverlay>
    </div>
  );
}

D3Boxplot.propTypes = {
  labels: PropTypes.arrayOf(
    PropTypes.oneOfType([PropTypes.string, PropTypes.number, PropTypes.arrayOf(PropTypes.oneOfType([PropTypes.string, PropTypes.number]))])
  ).isRequired,
  series: PropTypes.arrayOf(
    PropTypes.shape({
      min: PropTypes.number.isRequired,
      q1: PropTypes.number.isRequired,
      median: PropTypes.number.isRequired,
      q3: PropTypes.number.isRequired,
      max: PropTypes.number.isRequired,
    })
  ).isRequired,
  color: PropTypes.string,
  yDomain: PropTypes.shape({
    min: PropTypes.number.isRequired,
    max: PropTypes.number.isRequired,
  }),
  counts: PropTypes.arrayOf(PropTypes.oneOfType([PropTypes.number, PropTypes.oneOf([null])])),
  yLabel: PropTypes.string,
  xLabel: PropTypes.string,
};

function D3Bar({ labels, values, counts = [], color = "#37474f", yDomain, yLabel = "", xLabel = "" }) {
  const margin = { top: 20, right: D3_CHART_HORIZONTAL_MARGIN.right, bottom: 40, left: D3_CHART_HORIZONTAL_MARGIN.left };
  const { tooltip: hover, showTooltip, hideTooltip } = useFadingTooltip();
  const units = React.useMemo(() => extractUnits(yLabel), [yLabel]);

  const format = React.useCallback(
    (value) => (Number.isFinite(value) ? String(Number(value).toFixed(3)).replace(/\.0+$/, "").replace(/\.([^0]*)0+$/, ".$1") : "—"),
    []
  );

  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }}>
      <svg
        width="100%"
        height="100%"
        viewBox={`0 0 ${D3BAR_VIEWBOX.width} ${D3BAR_VIEWBOX.height}`}
        preserveAspectRatio="xMidYMid meet"
      >
        <D3BarInner
          labels={labels}
          values={values}
          counts={counts}
          color={color}
          yDomain={yDomain}
          yLabel={yLabel}
          xLabel={xLabel}
          margin={margin}
          width={D3BAR_VIEWBOX.width}
          height={D3BAR_VIEWBOX.height}
          onHover={(event, index, value, label) => {
            showTooltip({
              x: event.clientX,
              y: event.clientY,
              label: Array.isArray(label) ? label.join(" ") : String(label),
              value,
            });
          }}
          onLeave={hideTooltip}
        />
      </svg>

      <TooltipOverlay
        tooltip={hover}
        contentStyle={{
          fontSize: TOOLTIP_FONT_SIZE,
          padding: "8px 10px",
          display: "inline-flex",
          flexDirection: "column",
          gap: 2,
          whiteSpace: "nowrap",
        }}
      >
        {hover?.label && <strong style={{ marginBottom: 4, fontWeight: 900 }}>{hover.label}</strong>}
        <span style={{ fontVariantNumeric: "tabular-nums" }}>{hover ? formatValueWithUnits(format(hover.value), units) : ""}</span>
      </TooltipOverlay>
    </div>
  );
}

D3Bar.propTypes = {
  labels: PropTypes.arrayOf(
    PropTypes.oneOfType([PropTypes.string, PropTypes.arrayOf(PropTypes.string)])
  ).isRequired,
  values: PropTypes.arrayOf(PropTypes.number).isRequired,
  counts: PropTypes.arrayOf(PropTypes.oneOfType([PropTypes.number, PropTypes.oneOf([null])])),
  color: PropTypes.oneOfType([PropTypes.string, PropTypes.arrayOf(PropTypes.string)]),
  yDomain: PropTypes.shape({
    min: PropTypes.number,
    max: PropTypes.number,
  }),
  yLabel: PropTypes.string,
  xLabel: PropTypes.string,
};

function D3BarInner({
  labels,
  values,
  counts = [],
  color,
  yDomain,
  yLabel = "",
  xLabel = "",
  margin,
  width,
  height,
  onHover,
  onLeave,
}) {
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;
  const dataMin = 0;
  const dataMax = Math.max(...values);
  const domainMin = Number.isFinite(yDomain?.min) ? yDomain.min : dataMin;
  const domainMax = Number.isFinite(yDomain?.max) ? yDomain.max : dataMax;
  const y = d3.scaleLinear().domain([domainMin, domainMax]).nice().range([innerH, 0]);
  const labelKeys = labels.map(flattenLabel);
  const bandPadding = labelKeys.length <= 4 ? 0.08 : labelKeys.length <= 8 ? 0.12 : 0.18;
  const maxBarWidth = labelKeys.length <= 4 ? 160 : labelKeys.length <= 8 ? 128 : 104;
  const x = d3.scaleBand().domain(labelKeys).range([0, innerW]).padding(bandPadding);
  const ticks = y.ticks(Math.max(2, Math.floor(innerH / 60)));
  const barW = Math.max(24, Math.min(maxBarWidth, x.bandwidth() * 0.84));

  return (
    <g transform={`translate(${margin.left},${margin.top})`}>
      {ticks.map((tick) => {
        const py = y(tick);
        return (
          <g key={`t-${tick}`} transform={`translate(0,${py})`} shapeRendering="crispEdges">
            <line x1={0} x2={innerW} stroke="#e5e7eb" strokeWidth={0.75} />
            <text
              x={-10}
              y={3}
              textAnchor="end"
              fontSize={TICK_FONT_SIZE}
              fill="#37474f"
              fontFamily={FONT_FAMILY}
              style={{ pointerEvents: "none", userSelect: "none" }}
            >
              {tick}
            </text>
          </g>
        );
      })}

      {yLabel ? (
        <text
          transform={`translate(${AXIS_LABEL_X_OFFSET}, ${innerH / 2}) rotate(${AXIS_LABEL_ROTATION})`}
          textAnchor="middle"
          fontSize={AXIS_LABEL_FONT_SIZE}
          fill="#37474f"
          fontFamily={FONT_FAMILY}
          style={{ pointerEvents: "none", userSelect: "none" }}
        >
          {yLabel}
        </text>
      ) : null}

      {xLabel ? (
        <text
          x={innerW / 2}
          y={innerH + 34 * fontScale}
          textAnchor="middle"
          fontSize={X_AXIS_LABEL_FONT_SIZE}
          fill="#37474f"
          fontFamily={FONT_FAMILY}
          style={{ pointerEvents: "none", userSelect: "none" }}
        >
          {xLabel}
        </text>
      ) : null}

      {values.map((value, index) => {
        const label = labelKeys[index];
        const xBand = x(label) ?? 0;
        const x0 = xBand + (x.bandwidth() - barW) / 2;
        const barHeight = Math.max(0, innerH - y(value));
        const top = y(value);
        const cx = x0 + barW / 2;
        const fillColor = Array.isArray(color) ? color[index % color.length] : color;
        const labelText = flattenLabel(labels[index]);
        const labelFill = getBarLabelColor(fillColor);

        return (
          <g
            key={`bar-${index}`}
            onMouseEnter={(event) => onHover && onHover(event, index, value, labels[index])}
            onMouseMove={(event) => onHover && onHover(event, index, value, labels[index])}
            onMouseLeave={onLeave}
          >
            <rect
              x={x0}
              y={top}
              width={barW}
              height={barHeight}
              fill={fillColor}
              opacity={0.9}
              shapeRendering="crispEdges"
            />

            {Number.isFinite(counts?.[index]) && (
              <text
                x={cx}
                y={Math.max(14 * fontScale, top - 10 * fontScale)}
                textAnchor="middle"
                fontSize={COUNT_LABEL_FONT_SIZE}
                fontWeight="700"
                fill="#37474f"
                fontFamily={FONT_FAMILY}
                style={{ pointerEvents: "none", userSelect: "none" }}
              >
                {counts[index]}
              </text>
            )}

            {barHeight > 64 && (
              <text
                x={cx}
                y={top + barHeight / 2}
                transform={`rotate(-90, ${cx}, ${top + barHeight / 2})`}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={BAR_INTERIOR_LABEL_FONT_SIZE}
                fontWeight="700"
                fontFamily={FONT_FAMILY}
                fill={labelFill}
                style={{ pointerEvents: "none", userSelect: "none" }}
              >
                {labelText}
              </text>
            )}
          </g>
        );
      })}
    </g>
  );
}

D3BarInner.propTypes = {
  labels: PropTypes.arrayOf(
    PropTypes.oneOfType([PropTypes.string, PropTypes.arrayOf(PropTypes.string)])
  ).isRequired,
  values: PropTypes.arrayOf(PropTypes.number).isRequired,
  counts: PropTypes.arrayOf(PropTypes.oneOfType([PropTypes.number, PropTypes.oneOf([null])])),
  color: PropTypes.oneOfType([PropTypes.string, PropTypes.arrayOf(PropTypes.string)]).isRequired,
  yDomain: PropTypes.shape({
    min: PropTypes.number,
    max: PropTypes.number,
  }),
  yLabel: PropTypes.string,
  xLabel: PropTypes.string,
  margin: PropTypes.shape({
    top: PropTypes.number.isRequired,
    right: PropTypes.number.isRequired,
    bottom: PropTypes.number.isRequired,
    left: PropTypes.number.isRequired,
  }).isRequired,
  width: PropTypes.number.isRequired,
  height: PropTypes.number.isRequired,
  onHover: PropTypes.func,
  onLeave: PropTypes.func,
};

const lengthsMatch = (props, propName, componentName) => {
  const labels = props.labels || [];
  const series = props.series || [];
  if (labels.length !== series.length) {
    return new Error(
      `${componentName}: 'labels' (len ${labels.length}) must have same length as 'series' (len ${series.length}).`
    );
  }
  if (Array.isArray(props.counts) && props.counts.length && props.counts.length !== series.length) {
    return new Error(
      `${componentName}: 'counts' (len ${props.counts.length}) must match length of 'series' (len ${series.length}).`
    );
  }
  return null;
};

const labelItemType = PropTypes.oneOfType([
  PropTypes.string,
  PropTypes.number,
  PropTypes.arrayOf(PropTypes.oneOfType([PropTypes.string, PropTypes.number])),
]);

function BoxplotInner({
  labels,
  series,
  color,
  counts = [],
  yDomain,
  yLabel = "",
  xLabel = "",
  margin,
  width,
  height,
  onHover,
  onLeave,
}) {
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;
  const dataMin = d3.min(series, (d) => d.min);
  const dataMax = d3.max(series, (d) => d.max);
  const domainMin = yDomain?.min ?? dataMin ?? 0;
  const domainMax = yDomain?.max ?? dataMax ?? 1;
  const y = d3.scaleLinear().domain([domainMin, domainMax]).nice().range([innerH, 0]);
  const labelKeys = labels.map(flattenLabel);
  const x = d3.scaleBand().domain(labelKeys).range([0, innerW]).padding(0.15);
  const xLabelStep = Math.max(1, Math.ceil(labelKeys.length / 6));
  const bw = Math.max(16, Math.min(64, x.bandwidth() * 0.65));
  const ticks = y.ticks(Math.max(2, Math.floor(innerH / 60)));
  const points = series
    .map((item, index) => {
      const label = labelKeys[index];
      const x0 = (x(label) ?? 0) + (x.bandwidth() - bw) / 2;
      const cx = x0 + bw / 2;
      return Number.isFinite(item?.median) ? [cx, y(item.median)] : null;
    })
    .filter(Boolean);

  return (
    <g transform={`translate(${margin.left},${margin.top})`}>
      {ticks.map((tick) => {
        const py = y(tick);
        return (
          <g key={`t-${tick}`} transform={`translate(0,${py})`} shapeRendering="crispEdges">
            <line x1={0} x2={innerW} stroke="#e5e7eb" strokeWidth={0.75} />
            <text
              x={-10}
              y={3}
              textAnchor="end"
              fontSize={TICK_FONT_SIZE}
              fill="#37474f"
              fontFamily={FONT_FAMILY}
              style={{ pointerEvents: "none", userSelect: "none" }}
            >
              {tick}
            </text>
          </g>
        );
      })}

      {labelKeys.map((label, index) => {
        if (index % xLabelStep !== 0 && index !== labelKeys.length - 1) {
          return null;
        }
        const cx = (x(label) ?? 0) + x.bandwidth() / 2;
        return (
          <text
            key={`x-${index}`}
            x={cx}
            y={innerH + 24 * fontScale}
            textAnchor="middle"
            fontSize={TICK_FONT_SIZE}
            fill="#37474f"
            fontFamily={FONT_FAMILY}
            style={{ pointerEvents: "none", userSelect: "none" }}
          >
            {Array.isArray(labels[index]) ? labels[index].join(" ") : labels[index]}
          </text>
        );
      })}

      {yLabel ? (
        <text
          transform={`translate(${AXIS_LABEL_X_OFFSET}, ${innerH / 2}) rotate(${AXIS_LABEL_ROTATION})`}
          textAnchor="middle"
          fontSize={AXIS_LABEL_FONT_SIZE}
          fill="#37474f"
          fontFamily={FONT_FAMILY}
          style={{ pointerEvents: "none", userSelect: "none" }}
        >
          {yLabel}
        </text>
      ) : null}

      {xLabel ? (
        <text
          x={innerW / 2}
          y={innerH + 46 * fontScale}
          textAnchor="middle"
          fontSize={X_AXIS_LABEL_FONT_SIZE}
          fill="#37474f"
          fontFamily={FONT_FAMILY}
          style={{ pointerEvents: "none", userSelect: "none" }}
        >
          {xLabel}
        </text>
      ) : null}

      {series.map((item, index) => {
        const label = labelKeys[index];
        const x0 = (x(label) ?? 0) + (x.bandwidth() - bw) / 2;
        const cx = x0 + bw / 2;
        const yMin = y(item.min);
        const yQ1 = y(item.q1);
        const yMed = y(item.median);
        const yQ3 = y(item.q3);
        const yMax = y(item.max);

        return (
          <g
            key={`box-${index}`}
            onMouseEnter={(event) => onHover && onHover(event, index, item, labels[index])}
            onMouseMove={(event) => onHover && onHover(event, index, item, labels[index])}
            onMouseLeave={onLeave}
          >
            <line x1={cx} x2={cx} y1={yMin} y2={yMax} stroke={color} strokeWidth={1.5} />
            <rect
              x={x0}
              width={bw}
              y={Math.min(yQ1, yQ3)}
              height={Math.abs(yQ1 - yQ3)}
              stroke={color}
              fill="#ffffff"
              strokeWidth={1}
              shapeRendering="crispEdges"
            />
            <circle cx={cx} cy={yMed} r={4} fill={color} />
            {Number.isFinite(counts[index]) ? (
              <text
                x={cx}
                y={Math.max(14 * fontScale, yMax - 14 * fontScale)}
                textAnchor="middle"
                fontSize={COUNT_LABEL_FONT_SIZE}
                fontWeight="700"
                fill="#37474f"
                fontFamily={FONT_FAMILY}
              >
                {counts[index]}
              </text>
            ) : null}
          </g>
        );
      })}

      {points.length > 1 && (
        <path
          d={`M ${points.map(([px, py]) => `${px},${py}`).join(" L ")}`}
          fill="none"
          stroke={color}
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
          opacity={0.9}
        />
      )}
    </g>
  );
}

BoxplotInner.propTypes = {
  labels: PropTypes.arrayOf(labelItemType).isRequired,
  series: PropTypes.arrayOf(
    PropTypes.shape({
      min: PropTypes.number.isRequired,
      q1: PropTypes.number.isRequired,
      median: PropTypes.number.isRequired,
      q3: PropTypes.number.isRequired,
      max: PropTypes.number.isRequired,
    })
  ).isRequired,
  color: PropTypes.string.isRequired,
  counts: PropTypes.arrayOf(PropTypes.oneOfType([PropTypes.number, PropTypes.oneOf([null])])),
  yDomain: PropTypes.shape({
    min: PropTypes.number.isRequired,
    max: PropTypes.number.isRequired,
  }),
  yLabel: PropTypes.string,
  xLabel: PropTypes.string,
  margin: PropTypes.shape({
    top: PropTypes.number.isRequired,
    right: PropTypes.number.isRequired,
    bottom: PropTypes.number.isRequired,
    left: PropTypes.number.isRequired,
  }).isRequired,
  width: PropTypes.number.isRequired,
  height: PropTypes.number.isRequired,
  onHover: PropTypes.func,
  onLeave: PropTypes.func,
  lengthsMatch,
};

export { D3Bar, D3Boxplot };
