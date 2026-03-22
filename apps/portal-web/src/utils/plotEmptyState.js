export function getNoDataMessage(cfg) {
  const hasSelectedSites = Array.isArray(cfg?.selectedSites) && cfg.selectedSites.length > 0;
  const hasParameter = Boolean(cfg?.parameter && String(cfg.parameter).trim());

  if (!hasSelectedSites) {
    return "Select Sites on Map";
  }

  if (!hasParameter) {
    return "Select Parameter";
  }

  return "No Data Available for Site, Year, and Parameter Selections";
}
