import { formatParameterLabel } from "../parameterMetadata";

const DEFAULT_WORKSPACE_ID = "plot-1";
const WORKSPACE_ID_PATTERN = /^plot-(\d+)$/;

function normalizeChartType(chartType) {
  return chartType === "comparison" ? "comparison" : "trend";
}

function normalizeYear(year) {
  return Number.isFinite(year) ? year : null;
}

function normalizeSelectedSites(selectedSites) {
  return Array.isArray(selectedSites) ? [...selectedSites] : [];
}

function normalizeParameter(parameter) {
  return parameter ? String(parameter) : "";
}

function normalizeYearRange(startYear, endYear, yearBounds = null, fillMissing = false) {
  let nextStart = normalizeYear(startYear);
  let nextEnd = normalizeYear(endYear);

  if (Number.isFinite(yearBounds?.min) && Number.isFinite(yearBounds?.max)) {
    const minYear = yearBounds.min;
    const maxYear = yearBounds.max;

    if (fillMissing) {
      if (nextStart == null) {
        nextStart = minYear;
      }
      if (nextEnd == null) {
        nextEnd = maxYear;
      }
    }

    if (nextStart != null) {
      nextStart = Math.min(Math.max(nextStart, minYear), maxYear);
    }
    if (nextEnd != null) {
      nextEnd = Math.min(Math.max(nextEnd, minYear), maxYear);
    }
  }

  if (nextStart != null && nextEnd != null && nextStart > nextEnd) {
    nextEnd = nextStart;
  }

  return {
    startYear: nextStart,
    endYear: nextEnd,
  };
}

function normalizeTrendIndex(trendIndex, siteCount) {
  if (siteCount <= 0) {
    return 0;
  }

  const fallbackIndex = siteCount - 1;
  if (!Number.isFinite(trendIndex)) {
    return fallbackIndex;
  }

  return Math.min(Math.max(Math.trunc(trendIndex), 0), fallbackIndex);
}

function normalizeWorkspaceId(id, usedIds, fallbackNumber) {
  const rawId = typeof id === "string" ? id.trim() : "";
  if (rawId && !usedIds.has(rawId)) {
    usedIds.add(rawId);
    return rawId;
  }

  let nextNumber = fallbackNumber;
  let nextId = `${DEFAULT_WORKSPACE_ID}`;
  while (usedIds.has(nextId)) {
    nextId = `plot-${nextNumber}`;
    nextNumber += 1;
  }

  usedIds.add(nextId);
  return nextId;
}

function buildCatalogSets(catalog = null) {
  const siteSet = Array.isArray(catalog?.sites) ? new Set(catalog.sites.map((site) => String(site))) : null;
  const parameterSet = Array.isArray(catalog?.parameters)
    ? new Set(catalog.parameters.map((parameter) => String(parameter)))
    : null;

  return {
    siteSet,
    parameterSet,
    yearBounds: catalog?.yearBounds ?? null,
  };
}

function sanitizeSelectedSites(selectedSites, validSites = null) {
  const seen = new Set();
  const nextSelectedSites = [];

  for (const site of normalizeSelectedSites(selectedSites)) {
    const normalizedSite = String(site);
    if (validSites && !validSites.has(normalizedSite)) {
      continue;
    }
    if (seen.has(normalizedSite)) {
      continue;
    }

    seen.add(normalizedSite);
    nextSelectedSites.push(normalizedSite);
  }

  return nextSelectedSites;
}

function toComparableConfig(config = {}) {
  return {
    selectedSites: normalizeSelectedSites(config.selectedSites),
    parameter: normalizeParameter(config?.parameter),
    startYear: normalizeYear(config?.startYear),
    endYear: normalizeYear(config?.endYear),
    chartType: normalizeChartType(config?.chartType),
  };
}

export function createEmptyDraft(yearBounds = null) {
  const nextYears = normalizeYearRange(null, null, yearBounds, true);

  return {
    selectedSites: [],
    parameter: "",
    startYear: nextYears.startYear,
    endYear: nextYears.endYear,
    chartType: "trend",
  };
}

export function createInitialPlotState(yearBounds = null, initialWorkspaceId = DEFAULT_WORKSPACE_ID) {
  return {
    plotWorkspaces: [
      {
        id: initialWorkspaceId,
        draft: createEmptyDraft(yearBounds),
        applied: null,
      },
    ],
    activePlotId: initialWorkspaceId,
  };
}

export function cloneDraft(draft = {}) {
  return toComparableConfig(draft);
}

export function hydrateDraftWithYearBounds(draft = {}, yearBounds = null) {
  const nextDraft = cloneDraft(draft);
  const nextYears = normalizeYearRange(nextDraft.startYear, nextDraft.endYear, yearBounds, true);

  nextDraft.startYear = nextYears.startYear;
  nextDraft.endYear = nextYears.endYear;

  return nextDraft;
}

export function hasRequiredPlotFields(config) {
  return Boolean(
    config?.parameter &&
    config?.selectedSites?.length &&
    config?.startYear != null &&
    config?.endYear != null
  );
}

export function normalizeAppliedPlot(draft = {}) {
  const nextPlot = toComparableConfig(draft);

  if (nextPlot.chartType === "trend") {
    const siteCount = nextPlot.selectedSites.length;
    return {
      ...nextPlot,
      trendIndex: normalizeTrendIndex(draft?.trendIndex, siteCount),
    };
  }

  return nextPlot;
}

export function sanitizeDraftWithCatalog(draft = {}, catalog = null) {
  const baseDraft = cloneDraft(draft);
  const { siteSet, parameterSet, yearBounds } = buildCatalogSets(catalog);
  const nextYears = normalizeYearRange(baseDraft.startYear, baseDraft.endYear, yearBounds, true);
  const nextParameter = parameterSet && !parameterSet.has(baseDraft.parameter)
    ? ""
    : baseDraft.parameter;

  return {
    ...baseDraft,
    selectedSites: sanitizeSelectedSites(baseDraft.selectedSites, siteSet),
    parameter: nextParameter,
    startYear: nextYears.startYear,
    endYear: nextYears.endYear,
  };
}

export function sanitizeAppliedPlotWithCatalog(applied = null, catalog = null) {
  if (!applied) {
    return null;
  }

  const nextApplied = sanitizeDraftWithCatalog(applied, catalog);
  if (!hasRequiredPlotFields(nextApplied)) {
    return null;
  }

  if (nextApplied.chartType === "trend") {
    return {
      ...nextApplied,
      trendIndex: normalizeTrendIndex(applied?.trendIndex, nextApplied.selectedSites.length),
    };
  }

  return nextApplied;
}

export function sanitizePlotState(plotState = null, catalog = null) {
  const sourceWorkspaces = Array.isArray(plotState?.plotWorkspaces)
    ? plotState.plotWorkspaces.slice(0, 2)
    : [];

  if (!sourceWorkspaces.length) {
    return createInitialPlotState(catalog?.yearBounds ?? null);
  }

  const usedIds = new Set();
  let fallbackNumber = 2;
  const nextWorkspaces = sourceWorkspaces.map((workspace) => {
    const nextWorkspace = {
      id: normalizeWorkspaceId(workspace?.id, usedIds, fallbackNumber),
      draft: sanitizeDraftWithCatalog(workspace?.draft, catalog),
      applied: sanitizeAppliedPlotWithCatalog(workspace?.applied, catalog),
    };

    const idMatch = WORKSPACE_ID_PATTERN.exec(nextWorkspace.id);
    if (idMatch) {
      fallbackNumber = Math.max(fallbackNumber, Number(idMatch[1]) + 1);
    }

    return nextWorkspace;
  });

  const hasMeaningfulWorkspace = nextWorkspaces.some((workspace) => (
    workspace.applied ||
    workspace.draft.selectedSites.length > 0 ||
    Boolean(workspace.draft.parameter)
  ));

  const normalizedWorkspaces = hasMeaningfulWorkspace
    ? nextWorkspaces
    : [
      {
        id: nextWorkspaces[0]?.id || DEFAULT_WORKSPACE_ID,
        draft: createEmptyDraft(catalog?.yearBounds ?? null),
        applied: null,
      },
    ];

  const activePlotId = normalizedWorkspaces.some((workspace) => workspace.id === plotState?.activePlotId)
    ? plotState.activePlotId
    : normalizedWorkspaces[0].id;

  return {
    plotWorkspaces: normalizedWorkspaces,
    activePlotId,
  };
}

export function getNextWorkspaceNumber(plotState = null) {
  const maxWorkspaceNumber = Array.isArray(plotState?.plotWorkspaces)
    ? plotState.plotWorkspaces.reduce((currentMax, workspace) => {
      const match = WORKSPACE_ID_PATTERN.exec(workspace?.id || "");
      if (!match) {
        return currentMax;
      }

      return Math.max(currentMax, Number(match[1]));
    }, 1)
    : 1;

  return maxWorkspaceNumber + 1;
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
