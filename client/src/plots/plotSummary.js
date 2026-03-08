import { getParameterUnit } from "../parameterMetadata";
import { buildSiteLocationIndex } from "../siteLocations";

function formatCount(value, noun) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) {
    return "N/A";
  }

  const formatted = amount.toLocaleString();
  return `${formatted} ${noun}${amount === 1 ? "" : "s"}`;
}

function formatValue(value) {
  if (!Number.isFinite(value)) {
    return "N/A";
  }

  return value
    .toFixed(3)
    .replace(/\.0+$/, "")
    .replace(/\.([^0]*)0+$/, ".$1");
}

function formatRange(min, max, unit) {
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return "N/A";
  }

  return `${formatValue(min)} to ${formatValue(max)}${unit ? ` ${unit}` : ""}`;
}

function getTrendSite(cfg) {
  const sites = Array.isArray(cfg?.selectedSites) ? cfg.selectedSites : [];
  if (!sites.length) {
    return "";
  }

  const count = sites.length;
  let index = Number.isFinite(cfg?.trendIndex) ? cfg.trendIndex : count - 1;
  index = ((index % count) + count) % count;
  return sites[index] || sites[count - 1] || "";
}

function getObservedRange(chartObj) {
  const dataset = chartObj?.data?.datasets?.[0];
  if (!dataset) {
    return null;
  }

  if (chartObj.type === "boxplot") {
    const mins = dataset.data
      .map((item) => Number(item?.min))
      .filter((value) => Number.isFinite(value));
    const maxs = dataset.data
      .map((item) => Number(item?.max))
      .filter((value) => Number.isFinite(value));

    if (!mins.length || !maxs.length) {
      return null;
    }

    return { min: Math.min(...mins), max: Math.max(...maxs) };
  }

  const values = dataset.data
    .map((item) => Number(item))
    .filter((value) => Number.isFinite(value));

  if (!values.length) {
    return null;
  }

  return { min: Math.min(...values), max: Math.max(...values) };
}

function getSampleCount(chartObj) {
  const counts = chartObj?.data?.datasets?.[0]?.customCounts || [];
  return counts.reduce((sum, count) => (
    Number.isFinite(Number(count)) ? sum + Number(count) : sum
  ), 0);
}

function buildLocationCard(cfg, siteLocationsByName) {
  const uniqueSites = [...new Set((cfg?.selectedSites || []).filter(Boolean))];
  const singleSite = cfg?.chartType === "trend" ? getTrendSite(cfg) : (uniqueSites.length === 1 ? uniqueSites[0] : "");

  if (singleSite) {
    const site = siteLocationsByName[singleSite];

    return {
      eyebrow: "Map location",
      title: singleSite,
      description: site?.description || "Location details from the map are unavailable for this site.",
      items: [
        { label: "Size", value: site?.size || "N/A" },
        { label: "Max depth", value: site?.maxDepth || "N/A" },
        { label: "Avg depth", value: site?.avgDepth || "N/A" },
      ],
      link: site?.href
        ? {
          href: site.href,
          label: site.url,
        }
        : null,
    };
  }

  const profiledSiteCount = uniqueSites.filter((siteName) => Boolean(siteLocationsByName[siteName])).length;
  const preview = uniqueSites.slice(0, 3).join(", ");
  const remaining = uniqueSites.length - 3;
  const description = preview
    ? `${preview}${remaining > 0 ? ` + ${remaining} more` : ""}`
    : "No sites selected.";

  return {
    eyebrow: "Map selection",
    title: uniqueSites.length ? formatCount(uniqueSites.length, "selected site") : "Selected sites",
    description,
    items: [
      { label: "Profiles found", value: uniqueSites.length ? `${profiledSiteCount}/${uniqueSites.length}` : "0/0" },
      { label: "View", value: cfg?.chartType === "comparison" ? "Comparison" : "Trend" },
    ],
    link: null,
  };
}

function buildMetricCard(cfg, chartObj) {
  const unit = getParameterUnit(cfg?.parameter);
  const observedRange = getObservedRange(chartObj);

  return {
    eyebrow: "Displayed data",
    items: [
      { label: "Field samples", value: getSampleCount(chartObj).toLocaleString() },
      {
        label: "Observed range",
        value: formatRange(observedRange?.min, observedRange?.max, unit),
      },
    ],
  };
}

export function buildPlotSummary({ cfg, chartObj, siteLocations = [] }) {
  if (!cfg || !chartObj?.data?.labels?.length) {
    return null;
  }

  const siteLocationsByName = buildSiteLocationIndex(siteLocations);

  return {
    context: buildLocationCard(cfg, siteLocationsByName),
    metrics: buildMetricCard(cfg, chartObj),
  };
}
