import React, { useLayoutEffect, useMemo, useRef, useState } from "react";
import PropTypes from "prop-types";
import * as d3 from "d3";
import { Chart as ReactChart } from "react-chartjs-2";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowLeft,
  faArrowRight,
  faDownload,
  faHashtag,
} from "@fortawesome/free-solid-svg-icons";
import { getNoDataMessage } from "../utils/plotEmptyState";
import {
  chartFontFamily,
  chartFontScale,
  computeYRangeForChart,
  getPaddedYDomain,
  makeOptions,
} from "./chartOptions";

function formatMetricValue(value) {
  return Number.isFinite(value)
    ? Number(value).toFixed(3).replace(/\.0+$/, "").replace(/\.([^0]*)0+$/, ".$1")
    : "--";
}

const labelItemType = PropTypes.oneOfType([
  PropTypes.string,
  PropTypes.number,
  PropTypes.arrayOf(PropTypes.oneOfType([PropTypes.string, PropTypes.number])),
]);

function D3Boxplot({ labels, series, color = "#37474f", yDomain, counts = [] }) {
  const margin = { top: 8, right: 8, bottom: 28, left: 42 };
  const [hover, setHover] = useState(null);

  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }}>
      <svg width="100%" height="100%" viewBox="0 0 800 400" preserveAspectRatio="none">
        <BoxplotInner
          labels={labels}
          series={series}
          color={color}
          counts={counts}
          yDomain={yDomain}
          margin={margin}
          width={800}
          height={400}
          onHover={(event, _, stats, label) => {
            setHover({
              x: event.clientX,
              y: event.clientY,
              label: Array.isArray(label) ? label.join(" ") : String(label),
              stats,
            });
          }}
          onLeave={() => setHover(null)}
        />
      </svg>
      {hover ? (
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
              fontSize: 14 * chartFontScale,
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
            <strong style={{ gridColumn: "1 / -1", marginBottom: 4, fontWeight: 900 }}>
              {hover.label}
            </strong>
            <span style={{ textAlign: "right" }}>Max:</span>
            <span style={{ fontVariantNumeric: "tabular-nums" }}>
              {formatMetricValue(hover.stats.max)}
            </span>
            {Number.isFinite(hover.stats.mean) ? (
              <>
                <span style={{ textAlign: "right" }}>Mean:</span>
                <span style={{ fontVariantNumeric: "tabular-nums" }}>
                  {formatMetricValue(hover.stats.mean)}
                </span>
              </>
            ) : null}
            <span style={{ textAlign: "right" }}>Min:</span>
            <span style={{ fontVariantNumeric: "tabular-nums" }}>
              {formatMetricValue(hover.stats.min)}
            </span>
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
      ) : null}
    </div>
  );
}

D3Boxplot.propTypes = {
  labels: PropTypes.arrayOf(
    PropTypes.oneOfType([PropTypes.string, PropTypes.number])
  ).isRequired,
  series: PropTypes.arrayOf(
    PropTypes.shape({
      min: PropTypes.number.isRequired,
      q1: PropTypes.number.isRequired,
      median: PropTypes.number.isRequired,
      q3: PropTypes.number.isRequired,
      max: PropTypes.number.isRequired,
      mean: PropTypes.number,
    })
  ).isRequired,
  color: PropTypes.string,
  yDomain: PropTypes.shape({
    min: PropTypes.number,
    max: PropTypes.number,
  }),
  counts: PropTypes.arrayOf(
    PropTypes.oneOfType([PropTypes.number, PropTypes.oneOf([null])])
  ),
};

D3Boxplot.defaultProps = {
  color: "#37474f",
  yDomain: undefined,
  counts: [],
};

function D3Bar({ labels, values, counts = [], color = "#37474f", yDomain }) {
  const margin = { top: 16, right: 8, bottom: 40, left: 48 };
  const [hover, setHover] = useState(null);

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
          onHover={(event, _, value, label) => {
            setHover({
              x: event.clientX,
              y: event.clientY,
              label: Array.isArray(label) ? label.join(" ") : String(label),
              value,
            });
          }}
          onLeave={() => setHover(null)}
        />
      </svg>
      {hover ? (
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
              fontSize: 14 * chartFontScale,
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
            <strong style={{ marginBottom: 4, fontWeight: 900 }}>{hover.label}</strong>
            <span style={{ fontVariantNumeric: "tabular-nums" }}>
              {formatMetricValue(hover.value)}
            </span>
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
      ) : null}
    </div>
  );
}

D3Bar.propTypes = {
  labels: PropTypes.arrayOf(labelItemType).isRequired,
  values: PropTypes.arrayOf(PropTypes.number).isRequired,
  counts: PropTypes.arrayOf(
    PropTypes.oneOfType([PropTypes.number, PropTypes.oneOf([null])])
  ),
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
  const domainMin = Number.isFinite(yDomain?.min) ? yDomain.min : 0;
  const domainMax = Number.isFinite(yDomain?.max)
    ? yDomain.max
    : Math.max(...values, 1);
  const y = d3.scaleLinear().domain([domainMin, domainMax]).nice().range([innerH, 0]);
  const labelKeys = labels.map(String);
  const x = d3.scaleBand().domain(labelKeys).range([0, innerW]).padding(0.2);
  const ticks = y.ticks(Math.max(2, Math.floor(innerH / 60)));
  const barWidth = Math.max(8, Math.min(48, x.bandwidth()));

  return (
    <g transform={`translate(${margin.left},${margin.top})`}>
      {ticks.map((tick) => {
        const py = y(tick);
        return (
          <g key={`tick-${tick}`} transform={`translate(0,${py})`} shapeRendering="crispEdges">
            <line x1={0} x2={innerW} stroke="#e5e7eb" strokeWidth={0.75} />
            <text
              x={-10}
              y={3}
              textAnchor="end"
              fontSize={14 * chartFontScale}
              fill="#37474f"
              fontFamily={chartFontFamily}
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
        const x0 = xBand + (x.bandwidth() - barWidth) / 2;
        const barHeight = Math.max(0, innerH - y(value));
        const top = y(value);
        const centerX = x0 + barWidth / 2;
        const fillColor = Array.isArray(color) ? color[index % color.length] : color;
        const labelText = Array.isArray(labels[index]) ? labels[index].join(" ") : labels[index];

        return (
          <g
            key={`bar-${index}`}
            onMouseEnter={(event) => onHover?.(event, index, value, labels[index])}
            onMouseMove={(event) => onHover?.(event, index, value, labels[index])}
            onMouseLeave={onLeave}
          >
            <rect
              x={x0}
              y={top}
              width={barWidth}
              height={barHeight}
              fill={fillColor}
              opacity={0.9}
              shapeRendering="crispEdges"
            />
            {Number.isFinite(counts?.[index]) ? (
              <text
                x={centerX}
                y={top - 10 * chartFontScale}
                textAnchor="middle"
                fontSize={14 * chartFontScale}
                fontWeight="700"
                fill="#37474f"
                fontFamily={chartFontFamily}
                style={{ pointerEvents: "none", userSelect: "none" }}
              >
                {counts[index]}
              </text>
            ) : null}
            {barHeight > 10 ? (
              <text
                x={centerX}
                y={top + barHeight / 2}
                transform={`rotate(-90, ${centerX}, ${top + barHeight / 2})`}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={14 * chartFontScale}
                fontFamily={chartFontFamily}
                fill="#ffffff"
                style={{ pointerEvents: "none", userSelect: "none" }}
              >
                {labelText}
              </text>
            ) : null}
          </g>
        );
      })}
    </g>
  );
}

D3BarInner.propTypes = {
  labels: PropTypes.arrayOf(labelItemType).isRequired,
  values: PropTypes.arrayOf(PropTypes.number).isRequired,
  counts: PropTypes.arrayOf(
    PropTypes.oneOfType([PropTypes.number, PropTypes.oneOf([null])])
  ),
  color: PropTypes.oneOfType([PropTypes.string, PropTypes.arrayOf(PropTypes.string)])
    .isRequired,
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

D3BarInner.defaultProps = {
  counts: [],
  yDomain: undefined,
  onHover: undefined,
  onLeave: undefined,
};

function BoxplotInner({
  labels,
  series,
  color,
  counts,
  yDomain,
  margin,
  width,
  height,
  onHover,
  onLeave,
}) {
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;
  const dataMin = d3.min(series, (datum) => datum.min);
  const dataMax = d3.max(series, (datum) => datum.max);
  const domainMin = yDomain?.min ?? dataMin ?? 0;
  const domainMax = yDomain?.max ?? dataMax ?? 1;
  const y = d3.scaleLinear().domain([domainMin, domainMax]).nice().range([innerH, 0]);
  const labelKeys = labels.map(String);
  const x = d3.scaleBand().domain(labelKeys).range([0, innerW]).padding(0.15);
  const xLabelStep = 2;
  const boxWidth = Math.max(8, Math.min(40, x.bandwidth() * 0.6));
  const ticks = y.ticks(Math.max(2, Math.floor(innerH / 60)));
  const points = series
    .map((datum, index) => {
      const label = labelKeys[index];
      const x0 = (x(label) ?? 0) + (x.bandwidth() - boxWidth) / 2;
      const centerX = x0 + boxWidth / 2;
      return Number.isFinite(datum?.median) ? [centerX, y(datum.median)] : null;
    })
    .filter(Boolean);

  return (
    <g transform={`translate(${margin.left},${margin.top})`}>
      {ticks.map((tick) => {
        const py = y(tick);
        return (
          <g key={`tick-${tick}`} transform={`translate(0,${py})`} shapeRendering="crispEdges">
            <line x1={0} x2={innerW} stroke="#e5e7eb" strokeWidth={0.75} />
            <text
              x={-10}
              y={3}
              textAnchor="end"
              fontSize={14 * chartFontScale}
              fill="#37474f"
              fontFamily={chartFontFamily}
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

        const centerX = (x(label) ?? 0) + x.bandwidth() / 2;
        return (
          <text
            key={`label-${index}`}
            x={centerX}
            y={innerH + 18 * chartFontScale}
            textAnchor="middle"
            fontSize={14 * chartFontScale}
            fill="#37474f"
            style={{ pointerEvents: "none", userSelect: "none" }}
          >
            {Array.isArray(labels[index]) ? labels[index].join(" ") : labels[index]}
          </text>
        );
      })}

      {series.map((datum, index) => {
        const label = labelKeys[index];
        const x0 = (x(label) ?? 0) + (x.bandwidth() - boxWidth) / 2;
        const centerX = x0 + boxWidth / 2;

        return (
          <g
            key={`box-${index}`}
            onMouseEnter={(event) => onHover?.(event, index, datum, labels[index])}
            onMouseMove={(event) => onHover?.(event, index, datum, labels[index])}
            onMouseLeave={onLeave}
          >
            <line
              x1={centerX}
              x2={centerX}
              y1={y(datum.min)}
              y2={y(datum.max)}
              stroke={color}
              strokeWidth={1.5}
            />
            <rect
              x={x0}
              width={boxWidth}
              y={Math.min(y(datum.q1), y(datum.q3))}
              height={Math.abs(y(datum.q1) - y(datum.q3))}
              stroke={color}
              fill="#ffffff"
              strokeWidth={1}
              shapeRendering="crispEdges"
            />
            <circle cx={centerX} cy={y(datum.median)} r={4} fill={color} />
            {Number.isFinite(counts[index]) ? (
              <text
                x={centerX}
                y={y(datum.max) - 14 * chartFontScale}
                textAnchor="middle"
                fontSize={14 * chartFontScale}
                fontWeight="700"
                fill="#37474f"
              >
                {counts[index]}
              </text>
            ) : null}
          </g>
        );
      })}

      {points.length > 1 ? (
        <path
          d={`M ${points.map(([px, py]) => `${px},${py}`).join(" L ")}`}
          fill="none"
          stroke={color}
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
          opacity={0.9}
        />
      ) : null}
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
      mean: PropTypes.number,
    })
  ).isRequired,
  color: PropTypes.string.isRequired,
  counts: PropTypes.arrayOf(
    PropTypes.oneOfType([PropTypes.number, PropTypes.oneOf([null])])
  ),
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

BoxplotInner.defaultProps = {
  counts: [],
  yDomain: undefined,
  onHover: undefined,
  onLeave: undefined,
};

function IconWithTooltip({ icon, label, onClick, active = false, disabled = false }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const btnRef = useRef(null);

  const recalc = () => {
    const el = btnRef.current;
    if (!el) {
      return;
    }

    const rect = el.getBoundingClientRect();
    setPos({ x: rect.left + rect.width / 2, y: rect.top });
  };

  useLayoutEffect(() => {
    if (!open) {
      return undefined;
    }

    recalc();
    const onScroll = () => recalc();
    const onResize = () => recalc();
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize, true);

    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize, true);
    };
  }, [open]);

  const handleKeyDown = (event) => {
    if (disabled) {
      return;
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onClick?.();
    }
  };

  return (
    <span
      ref={btnRef}
      role="button"
      aria-label={label}
      title={label}
      tabIndex={disabled ? -1 : 0}
      onClick={disabled ? undefined : onClick}
      onKeyDown={handleKeyDown}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      style={{
        position: "relative",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 22,
        height: 22,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.45 : active ? 1 : 0.9,
      }}
    >
      <FontAwesomeIcon icon={icon} />
      {open && !disabled ? (
        <>
          <span
            style={{
              position: "fixed",
              left: pos.x,
              top: Math.max(8, pos.y - 12),
              transform: "translate(-50%, -100%)",
              background: "rgba(31, 41, 55, 0.98)",
              color: "#fff",
              fontSize: 12 * chartFontScale,
              lineHeight: 1.2,
              padding: "6px 8px",
              borderRadius: 6,
              pointerEvents: "none",
              zIndex: 999999,
              whiteSpace: "nowrap",
              boxShadow: "0 6px 18px rgba(0,0,0,.28)",
            }}
          >
            {label}
          </span>
          <span
            style={{
              position: "fixed",
              left: pos.x,
              top: Math.max(8, pos.y - 12),
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
      ) : null}
    </span>
  );
}

IconWithTooltip.propTypes = {
  icon: PropTypes.oneOfType([PropTypes.object, PropTypes.array, PropTypes.string]).isRequired,
  label: PropTypes.string.isRequired,
  onClick: PropTypes.func,
  active: PropTypes.bool,
  disabled: PropTypes.bool,
};

IconWithTooltip.defaultProps = {
  onClick: undefined,
  active: false,
  disabled: false,
};

function ChartPanel({ chartObj, cfg, slotLabel, notice, onDownload, nav }) {
  const containerRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [showCounts, setShowCounts] = useState(false);

  useLayoutEffect(() => {
    let raf1;
    let raf2;
    const element = containerRef.current;
    setReady(false);

    const ensureReady = () => {
      const inDocument =
        element && element.ownerDocument && element.ownerDocument.body.contains(element);
      const hasSize = element && element.clientWidth > 0 && element.clientHeight > 0;

      if (inDocument && hasSize) {
        setReady(true);
      } else {
        raf2 = requestAnimationFrame(ensureReady);
      }
    };

    raf1 = requestAnimationFrame(ensureReady);
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [cfg?.parameter, cfg?.chartType, chartObj?.type, chartObj?.data?.labels?.length]);

  const chartData = useMemo(() => {
    if (!chartObj) {
      return null;
    }

    const datasets = chartObj.data.datasets.map((dataset) => {
      const counts = dataset.customCounts || [];
      return {
        ...dataset,
        customCounts: showCounts ? counts : counts.map(() => null),
      };
    });

    return {
      ...chartObj.data,
      datasets,
    };
  }, [chartObj, showCounts]);

  const options = useMemo(
    () => makeOptions(cfg?.parameter, chartObj),
    [cfg?.parameter, chartObj]
  );

  const navControls =
    nav && nav.hasMultipleSites ? (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
        <IconWithTooltip icon={faArrowLeft} label="Previous site" onClick={nav.prev} />
        <IconWithTooltip icon={faArrowRight} label="Next site" onClick={nav.next} />
      </span>
    ) : null;

  const titleText = chartObj?.title
    ? `${slotLabel} - ${chartObj.title}`
    : `${slotLabel}${cfg?.parameter ? `: ${cfg.parameter}` : ""}`;
  const headerTitle =
    titleText.length > 80 ? `${titleText.slice(0, 79)}...` : titleText;

  const buildDownloadIcon = () =>
    onDownload ? (
      <IconWithTooltip icon={faDownload} label="Download raw data" onClick={onDownload} />
    ) : null;

  if (!cfg) {
    return (
      <div className="plot-panel">
        <div
          className="plot-header"
          style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}
        >
          <h4
            style={{
              margin: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              flexGrow: 1,
              flexShrink: 1,
              minWidth: 0,
            }}
          >
            {chartObj?.title ? `${slotLabel} - ${chartObj.title}` : slotLabel}
          </h4>
          <div className="plot-icons" style={{ opacity: 0.4 }} />
        </div>
        <div className="plot-content">
          <div className="no-plot-message">{getNoDataMessage()}</div>
        </div>
      </div>
    );
  }

  if (!chartObj || !chartObj.data?.labels?.length) {
    return (
      <div className="plot-panel">
        <div
          className="plot-header"
          style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}
        >
          <h4
            style={{
              margin: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              flexGrow: 1,
              flexShrink: 1,
              minWidth: 0,
            }}
          >
            {slotLabel}: {cfg.parameter}
          </h4>
          <div className="plot-icons" style={{ display: "flex", gap: 12 }}>
            {buildDownloadIcon()}
          </div>
        </div>
        {notice ? <div className="plot-notice">{notice}</div> : null}
        <div className="plot-content">
          <div className="no-plot-message">{getNoDataMessage(cfg)}</div>
        </div>
      </div>
    );
  }

  const chartKey = `${chartObj.type}-${cfg.parameter}-${cfg.chartType}-${chartObj.data.labels.length}-${showCounts}`;
  const yDomain =
    chartObj.type === "d3bar"
      ? getPaddedYDomain(chartObj, { floorAtZero: true })
      : getPaddedYDomain(chartObj);
  const range = computeYRangeForChart(chartObj);
  const d3BarDomain =
    yDomain ||
    (range
      ? {
          min: Math.max(0, range.min),
          max: range.max,
        }
      : undefined);

  return (
    <div className="plot-panel">
      <div
        className="plot-header"
        style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-start",
            gap: 8,
            flex: "1 1 auto",
            minWidth: 0,
          }}
        >
          <h4
            style={{
              margin: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              flex: "0 1 auto",
              minWidth: 0,
            }}
            title={titleText}
          >
            {headerTitle}
          </h4>
          {navControls}
        </div>
        <div className="plot-icons" style={{ display: "flex", gap: 12, alignItems: "center", opacity: 0.9 }}>
          {buildDownloadIcon()}
          <IconWithTooltip
            icon={faHashtag}
            label={showCounts ? "Hide counts" : "Show counts"}
            onClick={() => setShowCounts((prev) => !prev)}
            active={showCounts}
          />
        </div>
      </div>
      {notice ? <div className="plot-notice">{notice}</div> : null}
      <div className="plot-content" ref={containerRef} style={{ position: "relative", flex: 1 }}>
        {!ready ? (
          <div style={{ height: "100%" }} />
        ) : chartObj.type === "boxplot" ? (
          <D3Boxplot
            key={chartKey}
            labels={chartObj.data.labels}
            series={chartData.datasets[0].data}
            counts={chartData.datasets[0].customCounts || []}
            color={chartData.datasets[0].borderColor || "#37474f"}
            yDomain={yDomain}
          />
        ) : chartObj.type === "d3bar" ? (
          <D3Bar
            key={chartKey}
            labels={chartObj.data.labels}
            values={chartData.datasets[0].data}
            counts={chartData.datasets[0].customCounts || []}
            color={chartData.datasets[0].backgroundColor || "#37474f"}
            yDomain={d3BarDomain}
          />
        ) : (
          <ReactChart
            key={chartKey}
            datasetIdKey={`${cfg.parameter}-${chartObj.type}`}
            type={chartObj.type}
            data={chartData}
            options={options}
            updateMode="none"
            style={{ width: "100%", height: "100%" }}
          />
        )}
      </div>
    </div>
  );
}

ChartPanel.propTypes = {
  chartObj: PropTypes.object,
  cfg: PropTypes.object,
  slotLabel: PropTypes.string.isRequired,
  notice: PropTypes.node,
  onDownload: PropTypes.func,
  nav: PropTypes.shape({
    prev: PropTypes.func,
    next: PropTypes.func,
    hasMultipleSites: PropTypes.bool,
  }),
};

ChartPanel.defaultProps = {
  chartObj: null,
  cfg: null,
  notice: null,
  onDownload: undefined,
  nav: null,
};

export default ChartPanel;
