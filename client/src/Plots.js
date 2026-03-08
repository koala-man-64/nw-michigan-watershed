import React, { useMemo, useState } from "react";
import Papa from "papaparse";
import PropTypes from "prop-types";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faDownload,
  faInfoCircle,
  faLightbulb,
  faPlus,
  faQuestionCircle,
  faTimes,
} from "@fortawesome/free-solid-svg-icons";

import { buildComparisonChart, buildTrendChart } from "./plots/chartBuilders";
import { buildPlotSummary } from "./plots/plotSummary";
import { ChartPanel, IconWithTooltip, LightModal } from "./plots/ChartPanel";
import { defaultColors, makeOptions } from "./plots/chartUtils";
import { formatParameterLabel } from "./parameterMetadata";
import { draftMatchesApplied, getWorkspaceTabLabel } from "./plots/plotWorkspaceState";

const MOCK_DATA_DISCLAIMER = "Disclaimer: This plot panel is currently displaying mock data.";

function Plots({
  plotWorkspaces = [],
  activePlotId = "",
  onSelectPlot,
  onAddWorkspace,
  onRemovePlot,
  onUpdateAppliedPlot,
  onSavePlot,
  onSaveAsNewPlot,
  showSaveAction = false,
  showSaveAsNewAction = false,
  saveActionLabel = "Save Plot",
  saveActionDisabled = false,
  saveActionTitle = "",
  saveAsNewDisabled = false,
  saveAsNewTitle = "",
  rawData = [],
  infoData = {},
  siteLocations = [],
  loading = false,
}) {
  const [modal, setModal] = useState(null);
  const activeWorkspace = plotWorkspaces.find((workspace) => workspace.id === activePlotId) || plotWorkspaces[0] || null;
  const activeApplied = activeWorkspace?.applied || null;

  const activeChart = useMemo(() => {
    if (!rawData || !activeApplied) {
      return null;
    }

    return activeApplied.chartType === "trend"
      ? buildTrendChart(rawData, activeApplied, defaultColors)
      : buildComparisonChart(rawData, activeApplied, defaultColors);
  }, [rawData, activeApplied]);

  const activeOptions = useMemo(
    () => makeOptions(formatParameterLabel(activeApplied?.parameter), activeChart),
    [activeApplied?.parameter, activeChart]
  );
  const activeSummary = useMemo(
    () => buildPlotSummary({
      cfg: activeApplied,
      chartObj: activeChart,
      rawData,
      siteLocations,
    }),
    [activeApplied, activeChart, rawData, siteLocations]
  );

  const canAddWorkspace = plotWorkspaces.length < 2 && !plotWorkspaces.some((workspace) => workspace.applied == null);
  const showWorkspaceTabs = plotWorkspaces.length > 1 || Boolean(activeWorkspace?.applied);
  const panelLabelId = showWorkspaceTabs && activeWorkspace ? `plot-tab-${activeWorkspace.id}` : undefined;
  const panelId = activeWorkspace ? `plot-panel-${activeWorkspace.id}` : undefined;
  const headerAction = showSaveAction ? (
    <button
      type="button"
      className="plots-save-btn"
      onClick={onSavePlot}
      disabled={saveActionDisabled}
      title={saveActionTitle}
    >
      {saveActionLabel}
    </button>
  ) : canAddWorkspace ? (
    <button type="button" className="plots-add-btn" onClick={onAddWorkspace}>
      <FontAwesomeIcon icon={faPlus} />
      <span>New Plot</span>
    </button>
  ) : null;

  const handleDownload = (cfg) => {
    if (!rawData || !cfg) {
      return;
    }

    const rows = rawData.filter((row) => {
      const rowParam = row?.Parameter ? String(row.Parameter).trim() : "";
      const rowSite = row?.Site ? String(row.Site).trim() : "";
      const yearNum = parseInt(row?.Year, 10);

      return (
        rowParam === cfg.parameter &&
        cfg.selectedSites.includes(rowSite) &&
        Number.isFinite(yearNum) &&
        (cfg.startYear == null || yearNum >= cfg.startYear) &&
        (cfg.endYear == null || yearNum <= cfg.endYear)
      );
    });

    const csv = Papa.unparse(rows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${cfg.parameter}_${cfg.chartType}_data.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const infoFor = (parameter, field, fallback) => {
    const row = parameter && infoData[parameter];
    return (row && row[field]) || fallback;
  };

  const iconsFor = (cfg) => (
    <div className="plot-icons" style={{ display: "flex", gap: 12 }}>
      <IconWithTooltip icon={faDownload} label="Download raw data" onClick={() => handleDownload(cfg)} />
      <IconWithTooltip
        icon={faInfoCircle}
        label="Contact information"
        onClick={() => setModal({
          title: "Contact Information",
          body: infoFor(cfg?.parameter, "ContactInfo", "No contact information available."),
        })}
      />
      <IconWithTooltip
        icon={faLightbulb}
        label="Lake association information"
        onClick={() => setModal({
          title: "Lake Association Information",
          body: infoFor(cfg?.parameter, "AssociationInfo", "No association information available."),
        })}
      />
      <IconWithTooltip
        icon={faQuestionCircle}
        label="Parameter information"
        onClick={() => setModal({
          title: "Parameter Information",
          body: infoFor(cfg?.parameter, "ParameterInfo", "No parameter information available."),
        })}
      />
    </div>
  );

  const updateTrendIndex = (workspaceId, direction) => {
    onUpdateAppliedPlot(workspaceId, (currentApplied) => {
      if (!currentApplied || currentApplied.chartType !== "trend") {
        return currentApplied;
      }

      const sites = Array.isArray(currentApplied.selectedSites) ? currentApplied.selectedSites : [];
      if (!sites.length) {
        return currentApplied;
      }

      const count = sites.length;
      const currentIndex = Number.isFinite(currentApplied.trendIndex)
        ? currentApplied.trendIndex
        : count - 1;
      const nextIndex = direction < 0
        ? ((currentIndex - 1) % count + count) % count
        : (currentIndex + 1) % count;

      return { ...currentApplied, trendIndex: nextIndex };
    });
  };

  const navFor = (workspace) => {
    const cfg = workspace?.applied;
    if (!cfg || cfg.chartType !== "trend") {
      return null;
    }

    const sites = Array.isArray(cfg.selectedSites) ? cfg.selectedSites : [];
    if (!sites.length) {
      return null;
    }

    return {
      prev: () => updateTrendIndex(workspace.id, -1),
      next: () => updateTrendIndex(workspace.id, 1),
      hasMultipleSites: sites.length > 1,
    };
  };

  const handleTabKeyDown = (event, currentIndex) => {
    if (plotWorkspaces.length < 2) {
      return;
    }

    let nextIndex = null;
    if (event.key === "ArrowRight") {
      nextIndex = (currentIndex + 1) % plotWorkspaces.length;
    } else if (event.key === "ArrowLeft") {
      nextIndex = (currentIndex - 1 + plotWorkspaces.length) % plotWorkspaces.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = plotWorkspaces.length - 1;
    }

    if (nextIndex == null) {
      return;
    }

    event.preventDefault();
    const nextId = plotWorkspaces[nextIndex].id;
    onSelectPlot?.(nextId);
    window.requestAnimationFrame(() => {
      document.getElementById(`plot-tab-${nextId}`)?.focus();
    });
  };

  return (
    <section className="plots">
      <div className="plots-tabs-row">
        {showWorkspaceTabs ? (
          <div className="plots-tabs" role="tablist" aria-label="Saved plots">
            {plotWorkspaces.map((workspace, index) => {
              const isActive = workspace.id === activeWorkspace?.id;
              const { primary, secondary, title } = getWorkspaceTabLabel(workspace);
              const isDirty = Boolean(workspace.applied && !draftMatchesApplied(workspace.draft, workspace.applied));

                return (
                  <div className="plots-tab-shell" key={workspace.id}>
                    <button
                      id={`plot-tab-${workspace.id}`}
                    type="button"
                    role="tab"
                    className={`plots-tab${isActive ? " is-active" : ""}`}
                    aria-selected={isActive}
                    aria-controls={`plot-panel-${workspace.id}`}
                    tabIndex={isActive ? 0 : -1}
                    title={title}
                    onClick={() => onSelectPlot?.(workspace.id)}
                    onKeyDown={(event) => handleTabKeyDown(event, index)}
                  >
                    <span className="plots-tab-copy">
                      <span className="plots-tab-primary">{primary}</span>
                      <span className="plots-tab-secondary">{secondary}</span>
                    </span>
                      {isDirty && <span className="plots-tab-badge">Unsaved</span>}
                    </button>

                    {isActive && showSaveAsNewAction ? (
                      <button
                        type="button"
                        className="plots-tab-save-as-new"
                        aria-label="Save changes as a new plot"
                        title={saveAsNewTitle || "Save changes as a new plot"}
                        onClick={onSaveAsNewPlot}
                        disabled={saveAsNewDisabled}
                      >
                        <FontAwesomeIcon icon={faPlus} />
                      </button>
                    ) : null}

                    <button
                      type="button"
                      className="plots-tab-remove"
                      aria-label={`Remove ${primary}`}
                    onClick={() => onRemovePlot?.(workspace.id)}
                  >
                    <FontAwesomeIcon icon={faTimes} />
                  </button>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="plots-tabs-spacer" aria-hidden="true" />
        )}

        <div className="plots-header-meta">
          <div className="plots-disclaimer" role="note">
            {MOCK_DATA_DISCLAIMER}
          </div>
          {headerAction}
        </div>
      </div>

      <div
        className="plots-tabpanel"
        id={panelId}
        role={showWorkspaceTabs ? "tabpanel" : undefined}
        aria-labelledby={panelLabelId}
      >
        {loading || !rawData || rawData.length === 0 ? (
          <div className="plots-loading">Loading data...</div>
        ) : activeWorkspace?.applied ? (
          <ChartPanel
            embedded
            chartObj={activeChart}
            cfg={activeApplied}
            options={activeOptions}
            icons={iconsFor(activeApplied)}
            nav={navFor(activeWorkspace)}
            summary={activeSummary}
          />
        ) : (
          <ChartPanel
            embedded
            chartObj={null}
            cfg={null}
            slotLabel="New Plot"
            emptyMessage={"Choose filters on the left. A save button will appear here when this plot changes."}
          />
        )}
      </div>

      {modal && <LightModal title={modal.title} body={modal.body} onClose={() => setModal(null)} />}
    </section>
  );
}

Plots.propTypes = {
  plotWorkspaces: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string.isRequired,
      draft: PropTypes.shape({
        selectedSites: PropTypes.arrayOf(PropTypes.string).isRequired,
        parameter: PropTypes.string.isRequired,
        chartType: PropTypes.oneOf(["trend", "comparison"]).isRequired,
        startYear: PropTypes.number,
        endYear: PropTypes.number,
      }).isRequired,
      applied: PropTypes.shape({
        selectedSites: PropTypes.arrayOf(PropTypes.string).isRequired,
        parameter: PropTypes.string.isRequired,
        chartType: PropTypes.oneOf(["trend", "comparison"]).isRequired,
        startYear: PropTypes.number,
        endYear: PropTypes.number,
        trendIndex: PropTypes.number,
      }),
    })
  ).isRequired,
  activePlotId: PropTypes.string,
  onSelectPlot: PropTypes.func.isRequired,
  onAddWorkspace: PropTypes.func.isRequired,
  onRemovePlot: PropTypes.func.isRequired,
  onUpdateAppliedPlot: PropTypes.func.isRequired,
  onSavePlot: PropTypes.func,
  onSaveAsNewPlot: PropTypes.func,
  showSaveAction: PropTypes.bool,
  showSaveAsNewAction: PropTypes.bool,
  saveActionLabel: PropTypes.string,
  saveActionDisabled: PropTypes.bool,
  saveActionTitle: PropTypes.string,
  saveAsNewDisabled: PropTypes.bool,
  saveAsNewTitle: PropTypes.string,
  rawData: PropTypes.arrayOf(PropTypes.object),
  infoData: PropTypes.object,
  siteLocations: PropTypes.arrayOf(PropTypes.object),
  loading: PropTypes.bool,
};

export default Plots;
