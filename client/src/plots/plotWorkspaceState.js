import { formatParameterLabel } from "../parameterMetadata";

function normalizeChartType(chartType) {
  return chartType === "comparison" ? "comparison" : "trend";
}

function normalizeYear(year) {
  return Number.isFinite(year) ? year : null;
}

function normalizeSelectedSites(selectedSites) {
  return Array.isArray(selectedSites) ? [...selectedSites] : [];
}

function toComparableConfig(config = {}) {
  return {
    selectedSites: normalizeSelectedSites(config.selectedSites),
    parameter: config?.parameter ? String(config.parameter) : "",
    startYear: normalizeYear(config?.startYear),
    endYear: normalizeYear(config?.endYear),
    chartType: normalizeChartType(config?.chartType),
  };
}

export function createEmptyDraft(yearBounds = null) {
  return {
    selectedSites: [],
    parameter: "",
    startYear: normalizeYear(yearBounds?.min),
    endYear: normalizeYear(yearBounds?.max),
    chartType: "trend",
  };
}

export function cloneDraft(draft = {}) {
  return toComparableConfig(draft);
}

export function hydrateDraftWithYearBounds(draft = {}, yearBounds = null) {
  const nextDraft = cloneDraft(draft);

  if (nextDraft.startYear == null && Number.isFinite(yearBounds?.min)) {
    nextDraft.startYear = yearBounds.min;
  }

  if (nextDraft.endYear == null && Number.isFinite(yearBounds?.max)) {
    nextDraft.endYear = yearBounds.max;
  }

  return nextDraft;
}

export function normalizeAppliedPlot(draft = {}) {
  const nextPlot = toComparableConfig(draft);

  if (nextPlot.chartType === "trend") {
    const siteCount = nextPlot.selectedSites.length;
    return {
      ...nextPlot,
      trendIndex: siteCount > 0 ? siteCount - 1 : 0,
    };
  }

  return nextPlot;
}

export function draftMatchesApplied(draft, applied) {
  if (!applied) {
    return false;
  }

  const draftConfig = toComparableConfig(draft);
  const appliedConfig = toComparableConfig(applied);

  return (
    draftConfig.parameter === appliedConfig.parameter &&
    draftConfig.startYear === appliedConfig.startYear &&
    draftConfig.endYear === appliedConfig.endYear &&
    draftConfig.chartType === appliedConfig.chartType &&
    draftConfig.selectedSites.length === appliedConfig.selectedSites.length &&
    draftConfig.selectedSites.every((site, index) => site === appliedConfig.selectedSites[index])
  );
}

export function getWorkspaceTabLabel(workspace) {
  if (!workspace?.applied) {
    return {
      primary: "New Plot",
      secondary: "Draft",
      title: "New Plot",
    };
  }

  const source = workspace?.draft || workspace.applied;
  const primary = formatParameterLabel(source?.parameter) || source?.parameter || "Saved Plot";
  const secondary = source?.chartType === "comparison" ? "Comparison" : "Trend";

  return {
    primary,
    secondary,
    title: `${primary} - ${secondary}`,
  };
}
