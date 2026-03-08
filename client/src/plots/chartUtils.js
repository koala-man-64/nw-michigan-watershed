import { Chart, registerables } from "chart.js";

Chart.register(...registerables);

Chart.defaults.font.family =
  'Lato, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

function getFontScale() {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return 1;
  }

  try {
    const rootStyle = getComputedStyle(document.documentElement);
    const raw = rootStyle.getPropertyValue("--font-scale");
    const scale = parseFloat(raw);
    return Number.isFinite(scale) ? scale : 1;
  } catch {
    return 1;
  }
}

export const fontScale = getFontScale();
export const FONT_FAMILY = Chart.defaults.font.family;
export const CHART_FONT = 13 * fontScale;
export const CHART_AXIS_FONT = 14 * fontScale;
export const COUNT_FONT_PX = 14 * fontScale;
export const COUNT_FONT = `700 ${COUNT_FONT_PX}px ${FONT_FAMILY}`;
export const defaultColors = ["#37474f", "#6faecb", "#90a4ae", "#b0c4d6", "#5f7d95", "#a5b8c8", "#adb5bd"];

Chart.defaults.font.size = CHART_FONT;
Chart.defaults.color = "#37474f";

export const round3 = (value) => (
  Number.isFinite(value) ? Math.round(value * 1000) / 1000 : value
);

export function computeYRangeForChart(chartObj) {
  try {
    const dataset = chartObj?.data?.datasets?.[0];
    if (!dataset) {
      return null;
    }

    if (chartObj.type === "boxplot") {
      const mins = dataset.data.map((item) => Number(item?.min)).filter((item) => Number.isFinite(item));
      const maxs = dataset.data.map((item) => Number(item?.max)).filter((item) => Number.isFinite(item));
      if (!mins.length || !maxs.length) {
        return null;
      }
      return { min: Math.min(...mins), max: Math.max(...maxs) };
    }

    const values = dataset.data.map((item) => Number(item)).filter((item) => Number.isFinite(item));
    if (!values.length) {
      return null;
    }
    return { min: 0, max: Math.max(...values) };
  } catch {
    return null;
  }
}

export function wrapLabel(label, maxChars = 12) {
  if (!label) {
    return label;
  }

  const words = String(label).split(/\s+/);
  const lines = [];
  let line = "";

  words.forEach((word) => {
    if ((`${line} ${word}`).trim().length <= maxChars) {
      line = (line ? `${line} ` : "") + word;
    } else {
      if (line) {
        lines.push(line);
      }
      line = word;
    }
  });

  if (line) {
    lines.push(line);
  }

  return lines.length ? lines : [String(label)];
}

const countPlugin = {
  id: "countPlugin",
  afterDatasetsDraw(chart) {
    const dataset = chart.data?.datasets?.[0];
    if (!dataset) {
      return;
    }

    const counts = dataset.customCounts || [];
    const meta = chart.getDatasetMeta(0);
    const ctx = chart.ctx;
    const options = chart.options?.plugins?.countPlugin || {};
    const baseOffset = Number.isFinite(options.offset) ? options.offset : 10;

    ctx.save();
    meta.data.forEach((element, index) => {
      const count = counts[index];
      if (count == null) {
        return;
      }
      const position = element.tooltipPosition ? element.tooltipPosition() : element;
      const x = position.x;
      const y = position.y - baseOffset;
      ctx.fillStyle = options.color || "#37474f";
      ctx.textAlign = "center";
      ctx.font = options.font || COUNT_FONT;
      ctx.fillText(String(count), x, y);
    });
    ctx.restore();
  },
};

Chart.register(countPlugin);

export function makeOptions(parameterLabel, chartObj) {
  const range = computeYRangeForChart(chartObj);
  let yMin;
  let yMax;
  if (range) {
    const span = range.max - range.min;
    let pad = Number(span) * 0.16;
    if (!Number.isFinite(pad) || pad === 0) {
      pad = Math.max(Math.abs(range.max) * 0.02, 0.1);
    }
    if (chartObj.type === "boxplot") {
      yMin = Math.floor(range.min - pad);
      yMax = Math.ceil(range.max + pad * 2);
    } else {
      yMin = Math.floor(range.min);
      yMax = Math.ceil(range.max + pad * 2);
    }
    if (range.min >= 0 && yMin < 0 && span < 0.5) {
      yMin = 0;
    }
  }

  const isBox = chartObj?.type === "boxplot";
  return {
    responsive: true,
    maintainAspectRatio: false,
    resizeDelay: 200,
    animation: false,
    responsiveAnimationDuration: 0,
    animations: { colors: false, x: { duration: 0 }, y: { duration: 0 } },
    interaction: { mode: "nearest", intersect: true },
    layout: { padding: { top: 12 } },
    scales: {
      y: {
        beginAtZero: !isBox,
        min: isBox && Number.isFinite(yMin) ? yMin : undefined,
        max: isBox && Number.isFinite(yMax) ? yMax : undefined,
        suggestedMin: !isBox && Number.isFinite(yMin) ? Math.max(0, yMin) : undefined,
        suggestedMax: !isBox && Number.isFinite(yMax) ? yMax : undefined,
        grace: !isBox ? "10%" : 0,
        ticks: {
          color: "#37474f",
          precision: 0,
          includeBounds: true,
          font: {
            size: CHART_FONT,
          },
        },
        grid: { color: "#e5e7eb", tickColor: "#e5e7eb" },
        title: {
          display: Boolean(parameterLabel),
          text: parameterLabel || "",
          color: "#37474f",
          font: {
            size: CHART_AXIS_FONT,
            weight: "600",
          },
        },
      },
      x: {
        offset: true,
        ticks: {
          color: "#37474f",
          maxRotation: 0,
          minRotation: 0,
          autoSkip: true,
          autoSkipPadding: 8,
          padding: 10,
          font: {
            size: CHART_FONT,
          },
        },
        grid: { color: "#e5e7eb", tickColor: "#e5e7eb" },
        title: {
          color: "#37474f",
          font: {
            size: CHART_AXIS_FONT,
            weight: "600",
          },
        },
      },
    },
    plugins: {
      legend: { display: false },
      countPlugin: {
        gapAboveWhisker: 16 * fontScale,
        offset: 10 * fontScale,
        font: COUNT_FONT,
      },
      tooltip: {
        titleFont: {
          size: CHART_FONT,
          weight: "700",
        },
        bodyFont: {
          size: CHART_FONT,
        },
        callbacks: {
          label: (ctx) => {
            if (ctx.chart.config.type === "boxplot") {
              const raw = ctx.raw || {};
              const format = (value) => (
                Number.isFinite(value)
                  ? Number(value)
                    .toFixed(3)
                    .replace(/\.0+$/, "")
                    .replace(/\.([^0]*)0+$/, ".$1")
                  : "—"
              );
              const lines = [];
              const series = ctx.dataset?.label || parameterLabel || "";
              if (series) {
                lines.push(series);
              }
              lines.push(`Min: ${format(raw.min)}`);
              if (Number.isFinite(raw.q1)) {
                lines.push(`Q1 (25%): ${format(raw.q1)}`);
              }
              lines.push(`Median: ${format(raw.median)}`);
              if (Number.isFinite(raw.mean)) {
                lines.push(`Mean: ${format(raw.mean)}`);
              }
              if (Number.isFinite(raw.q3)) {
                lines.push(`Q3 (75%): ${format(raw.q3)}`);
              }
              lines.push(`Max: ${format(raw.max)}`);
              return lines;
            }

            const value = ctx.parsed?.y ?? ctx.parsed;
            return `${ctx.dataset?.label ?? ""}: ${value}`;
          },
        },
      },
    },
  };
}
