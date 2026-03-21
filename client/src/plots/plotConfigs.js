function normalizeSelectedSites(selectedSites) {
  return Array.isArray(selectedSites) ? selectedSites : [];
}

export function createPlotConfig(plotFilters = {}) {
  const selectedSites = normalizeSelectedSites(plotFilters.selectedSites);
  const cfg = {
    ...plotFilters,
    selectedSites,
  };

  if (cfg.chartType === "trend") {
    return {
      ...cfg,
      trendIndex: selectedSites.length > 0 ? selectedSites.length - 1 : 0,
    };
  }

  const next = { ...cfg };
  delete next.trendIndex;
  return next;
}

export function upsertPlotConfig(prevConfigs = [], slot, plotFilters) {
  const next = [...prevConfigs];
  while (next.length <= slot) {
    next.push(null);
  }
  while (next.length < 2) {
    next.push(null);
  }

  next[slot] = createPlotConfig(plotFilters);
  return next;
}

export function cycleTrendSite(prevConfigs = [], slot, step) {
  const cfg = prevConfigs[slot];
  if (!cfg) {
    return prevConfigs;
  }

  const selectedSites = normalizeSelectedSites(cfg.selectedSites);
  if (selectedSites.length === 0) {
    return prevConfigs;
  }

  const count = selectedSites.length;
  let index = Number.isFinite(cfg.trendIndex) ? cfg.trendIndex : count - 1;
  index = ((index + step) % count + count) % count;

  const next = [...prevConfigs];
  next[slot] = {
    ...cfg,
    trendIndex: index,
  };

  return next;
}
