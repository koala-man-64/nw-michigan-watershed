import React from "react";
import * as d3 from "d3";
import PropTypes from "prop-types";

import { FONT_FAMILY, fontScale } from "./chartUtils";

function D3Boxplot({ labels, series, color = "#37474f", yDomain, counts = [], yLabel = "" }) {
  const margin = { top: 8, right: 8, bottom: 28, left: 42 };
  const [hover, setHover] = React.useState(null);
  const hideHover = React.useCallback(() => setHover(null), []);

  const format = React.useCallback((value) => (
    Number.isFinite(value)
      ? Number(value).toFixed(3).replace(/\.0+$/, "").replace(/\.([^0]*)0+$/, ".$1")
      : "—"
  ), []);

  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }}>
      <svg width="100%" height="100%" viewBox="0 0 800 400" preserveAspectRatio="none">
        <BoxplotInner
          labels={labels}
          series={series}
          color={color}
          counts={counts}
          yDomain={yDomain}
          yLabel={yLabel}
          margin={margin}
          width={800}
          height={400}
          onHover={(event, index, stats, label) => {
            setHover({
              x: event.clientX,
              y: event.clientY,
              label: Array.isArray(label) ? label.join(" ") : String(label),
              stats,
            });
          }}
          onLeave={hideHover}
        />
      </svg>

      {hover && (
        <>
          <span
            role="tooltip"
            style={{
              position: "fixed",
              left: hover.x,
              top: Math.max(8, hover.y - 12),
              transform: "translate(-50%, -100%)",
              background: "rgba(31, 41, 55, 0.98)",
              color: "#fff",
              fontSize: 14 * fontScale,
              padding: "8px 10px",
              borderRadius: 6,
              pointerEvents: "none",
              zIndex: 999999,
              boxShadow: "0 6px 18px rgba(0,0,0,.28)",
              display: "grid",
              gridTemplateColumns: "auto auto",
              columnGap: 10,
              rowGap: 2,
              whiteSpace: "nowrap",
            }}
          >
            {hover.label && (
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
            <span style={{ fontVariantNumeric: "tabular-nums" }}>{format(hover.stats.max)}</span>
            {Number.isFinite(hover.stats.mean) && (
              <>
                <span style={{ textAlign: "right", color: "#fff" }}>Mean:</span>
                <span style={{ fontVariantNumeric: "tabular-nums" }}>{format(hover.stats.mean)}</span>
              </>
            )}
            <span style={{ textAlign: "right", color: "#fff" }}>Min:</span>
            <span style={{ fontVariantNumeric: "tabular-nums" }}>{format(hover.stats.min)}</span>
          </span>
          <span
            style={{
              position: "fixed",
              left: hover.x,
              top: Math.max(8, hover.y - 12),
              transform: "translate(-50%, -2px)",
              width: 0,
              height: 0,
              borderLeft: "6px solid transparent",
              borderRight: "6px solid transparent",
              borderTop: "6px solid rgba(31, 41, 55, 0.98)",
              pointerEvents: "none",
              zIndex: 999999,
            }}
          />
        </>
      )}
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
};

D3Boxplot.defaultProps = {
  color: "#37474f",
  yDomain: undefined,
  counts: [],
  yLabel: "",
};

function D3Bar({ labels, values, counts = [], color = "#37474f", yDomain }) {
  const margin = { top: 16, right: 8, bottom: 40, left: 48 };
  const [hover, setHover] = React.useState(null);
  const hideHover = React.useCallback(() => setHover(null), []);

  const format = React.useCallback(
    (value) => (Number.isFinite(value) ? String(Number(value).toFixed(3)).replace(/\.0+$/, "").replace(/\.([^0]*)0+$/, ".$1") : "—"),
    []
  );

  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }}>
      <svg width="100%" height="100%" viewBox="0 0 800 400" preserveAspectRatio="none">
        <D3BarInner
          labels={labels}
          values={values}
          counts={counts}
          color={color}
          yDomain={yDomain}
          margin={margin}
          width={800}
          height={400}
          onHover={(event, index, value, label) => {
            setHover({
              x: event.clientX,
              y: event.clientY,
              label: Array.isArray(label) ? label.join(" ") : String(label),
              value,
            });
          }}
          onLeave={hideHover}
        />
      </svg>

      {hover && (
        <>
          <span
            role="tooltip"
            style={{
              position: "fixed",
              left: hover.x,
              top: Math.max(8, hover.y - 12),
              transform: "translate(-50%, -100%)",
              background: "rgba(31, 41, 55, 0.98)",
              color: "#fff",
              fontSize: 14 * fontScale,
              padding: "8px 10px",
              borderRadius: 6,
              pointerEvents: "none",
              zIndex: 999999,
              boxShadow: "0 6px 18px rgba(0,0,0,.28)",
              display: "inline-flex",
              flexDirection: "column",
              gap: 2,
              whiteSpace: "nowrap",
            }}
          >
            {hover.label && <strong style={{ marginBottom: 4, fontWeight: 900 }}>{hover.label}</strong>}
            <span style={{ fontVariantNumeric: "tabular-nums" }}>{format(hover.value)}</span>
          </span>
          <span
            style={{
              position: "fixed",
              left: hover.x,
              top: Math.max(8, hover.y - 12),
              transform: "translate(-50%, -2px)",
              width: 0,
              height: 0,
              borderLeft: "6px solid transparent",
              borderRight: "6px solid transparent",
              borderTop: "6px solid rgba(31, 41, 55, 0.98)",
              pointerEvents: "none",
              zIndex: 999999,
            }}
          />
        </>
      )}
    </div>
  );
}

D3Bar.propTypes = {
  labels: PropTypes.arrayOf(
    PropTypes.oneOfType([PropTypes.string, PropTypes.arrayOf(PropTypes.string)])
  ).isRequired,
  values: PropTypes.arrayOf(PropTypes.number).isRequired,
  counts: PropTypes.arrayOf(PropTypes.number),
  color: PropTypes.oneOfType([PropTypes.string, PropTypes.arrayOf(PropTypes.string)]),
  yDomain: PropTypes.shape({
    min: PropTypes.number,
    max: PropTypes.number,
  }),
};

D3Bar.defaultProps = {
  counts: [],
  color: "#37474f",
  yDomain: undefined,
};

function D3BarInner({
  labels,
  values,
  counts,
  color,
  yDomain,
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
  const labelKeys = labels.map(String);
  const x = d3.scaleBand().domain(labelKeys).range([0, innerW]).padding(0.2);
  const ticks = y.ticks(Math.max(2, Math.floor(innerH / 60)));
  const barW = Math.max(8, Math.min(48, x.bandwidth()));

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
              fontSize={14 * fontScale}
              fill="#37474f"
              fontFamily={FONT_FAMILY}
              style={{ pointerEvents: "none", userSelect: "none" }}
            >
              {tick}
            </text>
          </g>
        );
      })}

      {values.map((value, index) => {
        const label = labelKeys[index];
        const xBand = x(label) ?? 0;
        const x0 = xBand + (x.bandwidth() - barW) / 2;
        const barHeight = Math.max(0, innerH - y(value));
        const top = y(value);
        const cx = x0 + barW / 2;
        const fillColor = Array.isArray(color) ? color[index % color.length] : color;
        const labelText = Array.isArray(labels[index]) ? labels[index].join(" ") : labels[index];

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
                y={top - 10 * fontScale}
                textAnchor="middle"
                fontSize={14 * fontScale}
                fontWeight="700"
                fill="#37474f"
                fontFamily={FONT_FAMILY}
                style={{ pointerEvents: "none", userSelect: "none" }}
              >
                {counts[index]}
              </text>
            )}

            {barHeight > 10 && (
              <text
                x={cx}
                y={top + barHeight / 2}
                transform={`rotate(-90, ${cx}, ${top + barHeight / 2})`}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={14 * fontScale}
                fontFamily={FONT_FAMILY}
                fill="#ffffff"
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

D3BarInner.defaultProps = {
  counts: [],
  yDomain: undefined,
  onHover: undefined,
  onLeave: undefined,
};

D3BarInner.propTypes = {
  labels: PropTypes.arrayOf(
    PropTypes.oneOfType([PropTypes.string, PropTypes.arrayOf(PropTypes.string)])
  ).isRequired,
  values: PropTypes.arrayOf(PropTypes.number).isRequired,
  counts: PropTypes.arrayOf(PropTypes.number),
  color: PropTypes.oneOfType([PropTypes.string, PropTypes.arrayOf(PropTypes.string)]).isRequired,
  yDomain: PropTypes.shape({
    min: PropTypes.number,
    max: PropTypes.number,
  }),
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
  counts,
  yDomain,
  yLabel,
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
  const labelKeys = labels.map(String);
  const x = d3.scaleBand().domain(labelKeys).range([0, innerW]).padding(0.15);
  const xLabelStep = 2;
  const bw = Math.max(8, Math.min(40, x.bandwidth() * 0.6));
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
              fontSize={14 * fontScale}
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
        if (index % xLabelStep !== 0) {
          return null;
        }
        const cx = (x(label) ?? 0) + x.bandwidth() / 2;
        return (
          <text
            key={`x-${index}`}
            x={cx}
            y={innerH + 18 * fontScale}
            textAnchor="middle"
            fontSize={14 * fontScale}
            fill="#37474f"
            style={{ pointerEvents: "none", userSelect: "none" }}
          >
            {Array.isArray(labels[index]) ? labels[index].join(" ") : labels[index]}
          </text>
        );
      })}

      {yLabel ? (
        <text
          transform={`translate(-34, ${innerH / 2}) rotate(-90)`}
          textAnchor="middle"
          fontSize={14 * fontScale}
          fill="#37474f"
        />
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
                y={yMax - 14 * fontScale}
                textAnchor="middle"
                fontSize={14 * fontScale}
                fontWeight="700"
                fill="#37474f"
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

BoxplotInner.defaultProps = {
  counts: [],
  yDomain: undefined,
  yLabel: "",
};

export { D3Bar, D3Boxplot };
