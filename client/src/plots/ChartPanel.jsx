import React, { useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import PropTypes from "prop-types";
import { Chart as ReactChart } from "react-chartjs-2";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowLeft,
  faArrowRight,
  faChevronDown,
  faChevronUp,
  faHashtag,
  faTimes,
} from "@fortawesome/free-solid-svg-icons";

import { D3Bar, D3Boxplot } from "./D3Charts";
import { computeYRangeForChart, fontScale } from "./chartUtils";
import { formatParameterLabel } from "../parameterMetadata";

const PANEL_HEADING_FONT = '"Lora", Georgia, "Times New Roman", serif';
const PLOT_ICON_BUTTON_SIZE = 36;
const PLOT_ICON_FONT_SIZE = 16 * fontScale;
const ICON_TOOLTIP_FONT_SIZE = 12 * fontScale;
const ICON_TOOLTIP_PADDING = "6px 8px";
const LIGHT_MODAL_TITLE_FONT_SIZE = 18 * fontScale;

function LightModal({ title, body, onClose }) {
  React.useEffect(() => {
    const handler = (event) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0, 0, 0, 0.35)",
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        style={{
          width: "min(720px, 92vw)",
          maxHeight: "80vh",
          background: "#ffffff",
          color: "#1f2937",
          borderRadius: 12,
          boxShadow: "0 10px 28px rgba(0,0,0,0.25)",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "12px 16px",
            borderBottom: "1px solid rgba(0,0,0,0.08)",
          }}
        >
          <h5
            style={{
              margin: 0,
              fontSize: LIGHT_MODAL_TITLE_FONT_SIZE,
              fontWeight: 600,
              fontFamily: PANEL_HEADING_FONT,
            }}
          >
            {title}
          </h5>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              border: 0,
              background: "transparent",
              cursor: "pointer",
              width: 36,
              height: 36,
              display: "grid",
              placeItems: "center",
            }}
          >
            <FontAwesomeIcon icon={faTimes} />
          </button>
        </div>
        <div style={{ padding: 16, overflow: "auto", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
          {body}
        </div>
      </div>
    </div>
  );
}

LightModal.propTypes = {
  title: PropTypes.string.isRequired,
  body: PropTypes.oneOfType([PropTypes.string, PropTypes.node]).isRequired,
  onClose: PropTypes.func.isRequired,
};

function IconWithTooltip({ icon, label, onClick, disabled = false, style = {}, active = false }) {
  const [open, setOpen] = React.useState(false);
  const [pos, setPos] = React.useState({ x: 0, y: 0 });
  const btnRef = React.useRef(null);

  const recalc = React.useCallback(() => {
    const element = btnRef.current;
    if (!element) {
      return;
    }

    const rect = element.getBoundingClientRect();
    setPos({ x: rect.left + rect.width / 2, y: rect.top });
  }, []);

  React.useEffect(() => {
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
  }, [open, recalc]);

  return (
    <button
      ref={btnRef}
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={disabled ? undefined : onClick}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      style={{
        position: "relative",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: PLOT_ICON_BUTTON_SIZE,
        height: PLOT_ICON_BUTTON_SIZE,
        border: 0,
        borderRadius: 9999,
        background: "transparent",
        fontSize: PLOT_ICON_FONT_SIZE,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.45 : active ? 1 : 0.9,
        ...style,
      }}
    >
      <FontAwesomeIcon icon={icon} />
      {open && !disabled && (
        <>
          <span
            role="tooltip"
            style={{
              position: "fixed",
              left: pos.x,
              top: Math.max(8, pos.y - 18),
              transform: "translate(-50%, -100%)",
              background: "rgba(31, 41, 55, 0.98)",
              color: "#fff",
              borderRadius: 6,
              padding: ICON_TOOLTIP_PADDING,
              fontSize: ICON_TOOLTIP_FONT_SIZE,
              lineHeight: 1.2,
              whiteSpace: "nowrap",
              pointerEvents: "none",
              zIndex: 999999,
            }}
          >
            {label}
          </span>
          <span
            style={{
              position: "fixed",
              left: pos.x,
              top: Math.max(8, pos.y - 18),
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
    </button>
  );
}

IconWithTooltip.propTypes = {
  icon: PropTypes.oneOfType([PropTypes.object, PropTypes.array, PropTypes.string]).isRequired,
  label: PropTypes.string.isRequired,
  onClick: PropTypes.func,
  disabled: PropTypes.bool,
  style: PropTypes.object,
  active: PropTypes.bool,
};

function SummaryCard({ eyebrow, title, description, items = [], link = null, tone = "default" }) {
  const className = ["plot-summary-card", `plot-summary-card--${tone}`].join(" ");
  const hasHeadingContent = Boolean(title || items.length);

  return (
    <section className={className}>
      {eyebrow && <p className="plot-summary-eyebrow">{eyebrow}</p>}
      {hasHeadingContent ? (
        <div className="plot-summary-heading-row">
          {title && <h5 className="plot-summary-title">{title}</h5>}
          {items.length ? (
            <dl className="plot-summary-metrics">
              {items.map((item) => (
                <div className="plot-summary-metric" key={`${item.label}-${item.value}`}>
                  <dt>{item.label}</dt>
                  <dd>{item.value}</dd>
                </div>
              ))}
            </dl>
          ) : null}
        </div>
      ) : null}
      {description && <p className="plot-summary-description">{description}</p>}
      {link?.href ? (
        <a
          className="plot-summary-link"
          href={link.href}
          target="_blank"
          rel="noopener noreferrer"
        >
          {link.label || "Visit site page"}
        </a>
      ) : null}
    </section>
  );
}

SummaryCard.propTypes = {
  eyebrow: PropTypes.string,
  title: PropTypes.string,
  description: PropTypes.string,
  items: PropTypes.arrayOf(PropTypes.shape({
    label: PropTypes.string.isRequired,
    value: PropTypes.string.isRequired,
  })),
  link: PropTypes.shape({
    href: PropTypes.string.isRequired,
    label: PropTypes.string,
  }),
  tone: PropTypes.oneOf(["default", "context", "metrics"]),
};

function joinTitle(left, right, separator) {
  if (left && right) {
    return `${left}${separator}${right}`;
  }
  return left || right || "";
}

function ChartPanel({
  chartObj = null,
  cfg = null,
  slotLabel = "",
  options = {},
  icons = null,
  notice = null,
  nav = null,
  embedded = false,
  titleOverride = "",
  emptyMessage = "",
  summary = null,
}) {
  const containerRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [showCounts, setShowCounts] = useState(false);
  const [summaryCollapsed, setSummaryCollapsed] = useState(false);
  const summaryRegionId = useId();
  const hasSummary = Boolean(summary?.context || summary?.metrics);
  const parameterLabel = formatParameterLabel(cfg?.parameter);
  const summaryToggleLabel = summaryCollapsed ? "Show plot details" : "Hide plot details";
  const panelTypeClass = cfg?.chartType === "trend"
    ? "plot-panel--trend"
    : cfg?.chartType === "comparison"
      ? "plot-panel--comparison"
      : "";
  const panelClassName = [
    "plot-panel",
    panelTypeClass,
    embedded ? "plot-panel--embedded" : "",
  ].filter(Boolean).join(" ");

  useLayoutEffect(() => {
    let raf1;
    let raf2;
    const element = containerRef.current;
    setReady(false);

    const ensureReady = () => {
      const inDocument = element && element.ownerDocument && element.ownerDocument.body.contains(element);
      const hasBox = element && element.clientWidth > 0 && element.clientHeight > 0;
      if (inDocument && hasBox) {
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

    return { ...chartObj.data, datasets };
  }, [chartObj, showCounts]);

  if (!cfg) {
    const emptyTitle = titleOverride || slotLabel || "Saved Plot";
    const promptMessage = emptyMessage || (
      slotLabel
        ? `Click "Update ${slotLabel}" to populate this plot.`
        : "Choose filters to create this plot."
    );

    return (
      <div className={panelClassName}>
        <div className="plot-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
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
            {emptyTitle}
          </h4>
          <div className="plot-icons" style={{ opacity: 0.4 }} />
        </div>
        <div className="plot-content">
          <div className="no-plot-message">{promptMessage}</div>
        </div>
      </div>
    );
  }

  if (!chartObj || !chartObj.data?.labels?.length) {
    const noDataTitle = titleOverride || joinTitle(slotLabel, parameterLabel || cfg.parameter, slotLabel ? ": " : "");

    return (
      <div className={panelClassName}>
        <div className="plot-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
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
            {noDataTitle || "Saved Plot"}
          </h4>
          {icons}
        </div>
        {notice && <div className="plot-notice">{notice}</div>}
        <div className="plot-content">
          <div className="no-plot-message">No data for the current filters.</div>
        </div>
      </div>
    );
  }

  const chartKey = `${chartObj.type}-${cfg.parameter}-${cfg.chartType}-${chartObj.data.labels.length}-${showCounts}`;
  const title = titleOverride || chartObj?.title || joinTitle(slotLabel, parameterLabel, slotLabel ? ": " : "");
  const headerTitle = title.length > 80 ? `${title.slice(0, 79)}...` : title;
  const range = computeYRangeForChart(chartObj);
  const yDomain = range
    ? (() => {
      const span = range.max - range.min;
      let pad = span * 0.1;
      if (!Number.isFinite(pad) || pad === 0) {
        pad = 1;
      }
      return { min: range.min - pad, max: range.max + pad };
    })()
    : undefined;

  return (
    <div className={panelClassName}>
      <div className="plot-header">
        <div className="plot-header-title-row">
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
            title={title}
          >
            {headerTitle}
          </h4>
        </div>
        <div className={`plot-header-toolbar${hasSummary ? "" : " plot-header-toolbar--end"}`}>
          {hasSummary ? (
            <button
              type="button"
              className="plot-details-toggle"
              aria-expanded={!summaryCollapsed}
              aria-controls={summaryRegionId}
              onClick={() => setSummaryCollapsed((prev) => !prev)}
            >
              <span>{summaryToggleLabel}</span>
              <FontAwesomeIcon icon={summaryCollapsed ? faChevronDown : faChevronUp} />
            </button>
          ) : null}
          <div className="plot-header-toolbar-right">
            {icons}
            {nav && nav.hasMultipleSites ? (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <IconWithTooltip icon={faArrowLeft} label="Previous site" onClick={nav.prev} />
                <IconWithTooltip icon={faArrowRight} label="Next site" onClick={nav.next} />
              </span>
            ) : null}
            <IconWithTooltip
              icon={faHashtag}
              label={showCounts ? "Hide counts" : "Show counts"}
              onClick={() => setShowCounts((prev) => !prev)}
              active={showCounts}
            />
          </div>
        </div>
      </div>
      {notice && <div className="plot-notice">{notice}</div>}
      {hasSummary && (
        <div
          id={summaryRegionId}
          className="plot-summary"
          aria-label="Plot summary"
          hidden={summaryCollapsed}
          style={summaryCollapsed ? { display: "none" } : undefined}
        >
          {summary.context && <SummaryCard {...summary.context} tone="context" />}
          {summary.metrics && <SummaryCard {...summary.metrics} tone="metrics" />}
        </div>
      )}
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
            yLabel={parameterLabel}
            xLabel={chartObj.xLabel}
          />
        ) : chartObj.type === "d3bar" ? (
          <D3Bar
            key={chartKey}
            labels={chartObj.data.labels}
            values={chartData.datasets[0].data}
            counts={chartData.datasets[0].customCounts || []}
            color={chartData.datasets[0].backgroundColor || "#37474f"}
            yDomain={(() => {
              const d3Range = computeYRangeForChart(chartObj);
              if (!d3Range) {
                return undefined;
              }
              const span = d3Range.max - d3Range.min;
              const pad = !Number.isFinite(span) || span === 0 ? 1 : span * 0.1;
              return { min: Math.max(0, d3Range.min - pad), max: d3Range.max + pad };
            })()}
            yLabel={parameterLabel}
            xLabel={chartObj.xLabel}
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
  slotLabel: PropTypes.string,
  options: PropTypes.object,
  icons: PropTypes.node,
  notice: PropTypes.node,
  nav: PropTypes.shape({
    prev: PropTypes.func,
    next: PropTypes.func,
    hasMultipleSites: PropTypes.bool,
  }),
  embedded: PropTypes.bool,
  titleOverride: PropTypes.string,
  emptyMessage: PropTypes.string,
  summary: PropTypes.shape({
    context: PropTypes.shape({
      eyebrow: PropTypes.string,
      title: PropTypes.string,
      description: PropTypes.string,
      items: PropTypes.arrayOf(PropTypes.shape({
        label: PropTypes.string.isRequired,
        value: PropTypes.string.isRequired,
      })),
      link: PropTypes.shape({
        href: PropTypes.string.isRequired,
        label: PropTypes.string,
      }),
    }),
    metrics: PropTypes.shape({
      eyebrow: PropTypes.string,
      title: PropTypes.string,
      description: PropTypes.string,
      items: PropTypes.arrayOf(PropTypes.shape({
        label: PropTypes.string.isRequired,
        value: PropTypes.string.isRequired,
      })),
      link: PropTypes.shape({
        href: PropTypes.string.isRequired,
        label: PropTypes.string,
      }),
    }),
  }),
};

export { ChartPanel, IconWithTooltip, LightModal };
