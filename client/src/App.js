import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BrowserRouter as Router, Navigate, Route, Routes } from "react-router-dom";
import PropTypes from "prop-types";

import "./App.css";
import comparison_plot_icon from "./comparison_plot_icon.png";
import trend_plot_icon from "./trend_plot_icon.png";
import FiltersPanel from "./FiltersPanel";
import Header from "./Header";
import MapPanel from "./MapPanel";
import Plots from "./Plots";
import useSiteLocations from "./hooks/useSiteLocations";
import {
  cloneDraft,
  createEmptyDraft,
  createInitialPlotState,
  draftMatchesApplied,
  getNextWorkspaceNumber,
  hasRequiredPlotFields,
  hydrateDraftWithYearBounds,
  normalizeAppliedPlot,
  sanitizePlotState,
} from "./plots/plotWorkspaceState";
import { readSession, writeSession } from "./plots/plotSessionStorage";

function mergeDraft(draft, partial) {
  return {
    ...draft,
    ...partial,
    selectedSites: Array.isArray(partial?.selectedSites)
      ? [...partial.selectedSites]
      : draft.selectedSites,
  };
}

function FilterMapPanel({
  activeDraft,
  onFiltersChange,
  onDataLoaded,
  siteLocations,
  siteLocationsError,
  updateEnabled = false,
}) {
  const handleMarkerClick = useCallback((siteName) => {
    const selectedSites = Array.isArray(activeDraft?.selectedSites)
      ? activeDraft.selectedSites
      : [];
    const nextSelected = selectedSites.includes(siteName)
      ? selectedSites.filter((name) => name !== siteName)
      : [...selectedSites, siteName];

    onFiltersChange({ selectedSites: nextSelected });
  }, [activeDraft?.selectedSites, onFiltersChange]);

  return (
    <div className="filter-map-panel">
      <FiltersPanel
        filters={activeDraft}
        onFiltersChange={onFiltersChange}
        onDataLoaded={onDataLoaded}
        updateEnabled={updateEnabled}
      />

      <section className="map">
        <MapPanel
          locations={siteLocations}
          loadError={siteLocationsError ? "Unable to load site locations." : null}
          selectedSites={activeDraft?.selectedSites || []}
          onMarkerClick={handleMarkerClick}
        />
      </section>
    </div>
  );
}

FilterMapPanel.propTypes = {
  activeDraft: PropTypes.shape({
    selectedSites: PropTypes.arrayOf(PropTypes.string).isRequired,
    startYear: PropTypes.number,
    endYear: PropTypes.number,
    parameter: PropTypes.string,
    chartType: PropTypes.oneOf(["trend", "comparison"]),
  }).isRequired,
  onFiltersChange: PropTypes.func.isRequired,
  onDataLoaded: PropTypes.func,
  siteLocations: PropTypes.arrayOf(PropTypes.object),
  siteLocationsError: PropTypes.object,
  updateEnabled: PropTypes.bool,
};

function WelcomePanel({ onContinue }) {
  return (
    <div className="plots" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ flex: 1, overflowY: "auto" }}>
        <h1
          style={{
            marginTop: 0,
            marginBottom: 12,
            fontSize: 28,
            fontFamily: "Lora, Georgia, serif",
            color: "var(--color-secondary)",
          }}
        >
          Welcome to the NW Michigan Water Quality Database!
        </h1>

        <p style={{ marginBottom: 10, lineHeight: 1.5, fontSize: "calc(1em * var(--font-scale, 1))" }}>
          This database can be used to retrieve, display, and download water quality data
          for lakes and streams in northern Michigan. Click the markers on the map
          or use the dropdown list to identify sites that are included in the database.
        </p>
        <p style={{ marginBottom: 10, lineHeight: 1.5, fontSize: "calc(1em * var(--font-scale, 1))" }}>
          You can display data for the following parameters (measurements) for lakes:
          Chlorophyll, Chloride, Nitrate, Secchi Depth, Total Phosphorus, and Trophic
          State Index and Chloride, Nitrate, Total Phosphorus, Flow Rate, and Conductivity
          for streams.
        </p>
        <p style={{ marginBottom: 10, lineHeight: 1.5, fontSize: "calc(1em * var(--font-scale, 1))" }}>
          Data can be displayed as <strong>Trend</strong> lines <img src={trend_plot_icon} alt="" /> that
          show how a parameter changes over time. This allows you to determine if a parameter is
          increasing or decreasing. You can compare the trend of a single parameter for two different
          sites or compare two different parameters for the same site.
        </p>
        <p style={{ marginBottom: 10, lineHeight: 1.5, fontSize: "calc(1em * var(--font-scale, 1))" }}>
          Data can also be displayed as a bar graph <img src={comparison_plot_icon} alt="" /> to
          <strong> Compare</strong> the overall water quality of up to 10 different sites. This allows
          you to attain an overview of conditions on a more regional basis.
        </p>
        <p style={{ marginBottom: 10, lineHeight: 1.5, fontSize: "calc(1em * var(--font-scale, 1))" }}>
          Click the Continue button below to proceed to the database. There you will be able to
          select one or more sites, select the parameter, select the time interval, and choose
          between <strong>Trend</strong> and <strong>Comparison</strong> options.
        </p>
        <p style={{ marginBottom: 10, lineHeight: 1.5, fontSize: "calc(1em * var(--font-scale, 1))" }}>
          If you have questions or comments, please contact John Ransom at the Benzie County
          Conservation District at 231-882-4391 or email at john@benziecd.org.
        </p>
      </div>

      <div className="welcome-actions">
        <button
          type="button"
          className="reset-btn"
          onClick={onContinue}
          title="Enable plotting and show the charts panel"
        >
          Continue
        </button>
      </div>
    </div>
  );
}

WelcomePanel.propTypes = {
  onContinue: PropTypes.func.isRequired,
};

function App() {
  const { data: siteLocationsData, error: siteLocationsError } = useSiteLocations();
  const [bootSession] = useState(() => {
    const restoredSession = readSession();
    if (!restoredSession) {
      return {
        showWelcome: true,
        plotState: createInitialPlotState(),
      };
    }

    return {
      showWelcome: restoredSession.showWelcome,
      plotState: sanitizePlotState(restoredSession.plotState),
    };
  });
  const nextWorkspaceIdRef = useRef(getNextWorkspaceNumber(bootSession.plotState));
  const [yearBounds, setYearBounds] = useState(null);
  const [plotState, setPlotState] = useState(() => bootSession.plotState);
  const [rawData, setRawData] = useState(null);
  const [infoData, setInfoData] = useState({});
  const [loading, setLoading] = useState(true);
  const [showWelcome, setShowWelcome] = useState(() => bootSession.showWelcome);
  const updateEnabled = !showWelcome;

  const createWorkspace = useCallback((seedDraft = null, nextYearBounds = yearBounds) => ({
    id: `plot-${nextWorkspaceIdRef.current++}`,
    draft: hydrateDraftWithYearBounds(
      seedDraft ? cloneDraft(seedDraft) : createEmptyDraft(nextYearBounds),
      nextYearBounds
    ),
    applied: null,
  }), [yearBounds]);

  const plotWorkspaces = plotState.plotWorkspaces;
  const activePlotId = plotState.activePlotId;

  const activeWorkspace = useMemo(
    () => plotWorkspaces.find((workspace) => workspace.id === activePlotId) || plotWorkspaces[0] || null,
    [plotWorkspaces, activePlotId]
  );
  const siteLocations = siteLocationsData || [];

  const activeDraft = activeWorkspace?.draft || createEmptyDraft(yearBounds);
  const activeApplied = activeWorkspace?.applied || null;
  const emptyDraft = useMemo(() => createEmptyDraft(yearBounds), [yearBounds]);
  const hasRequiredDraftFields = hasRequiredPlotFields(activeDraft);
  const hasDraftChanges = activeApplied
    ? !draftMatchesApplied(activeDraft, activeApplied)
    : !draftMatchesApplied(activeDraft, emptyDraft);
  const applyLabel = activeApplied ? "Save Changes" : "Save Plot";
  const applyDisabled = !updateEnabled || !hasRequiredDraftFields || !hasDraftChanges;
  const canSaveAsNewPlot = Boolean(activeApplied) && plotWorkspaces.length < 2;
  const applyTitle = !updateEnabled
    ? "Click Continue in the welcome panel to enable plotting."
    : !hasDraftChanges
      ? "Change filters to reveal the save action."
      : applyDisabled
        ? "Select sites, years, and a parameter before saving this plot."
        : `${applyLabel} for the selected plot.`;
  const saveAsNewDisabled = !updateEnabled || !hasRequiredDraftFields || !hasDraftChanges || !canSaveAsNewPlot;
  const saveAsNewTitle = !updateEnabled
    ? "Click Continue in the welcome panel to enable plotting."
    : !hasDraftChanges
      ? "Change filters to reveal the save-as-new action."
      : plotWorkspaces.length >= 2
        ? "Remove a plot before saving these changes as a new plot."
        : saveAsNewDisabled
          ? "Select sites, years, and a parameter before saving this plot as a new plot."
          : "Save current changes as a new plot and keep the original plot unchanged.";

  useEffect(() => {
    writeSession({
      showWelcome,
      plotState,
    });
  }, [showWelcome, plotState]);

  const handleFiltersChange = useCallback((partialOrFull) => {
    setPlotState((prev) => ({
      ...prev,
      plotWorkspaces: prev.plotWorkspaces.map((workspace) => (
        workspace.id === prev.activePlotId
          ? { ...workspace, draft: mergeDraft(workspace.draft, partialOrFull) }
          : workspace
      )),
    }));
  }, []);

  const handleDataLoaded = useCallback(({
    rawData: nextRawData,
    infoData: nextInfoData,
    yearBounds: nextYearBounds,
    catalog: nextCatalog,
  }) => {
    const normalizedYearBounds = Number.isFinite(nextYearBounds?.min) && Number.isFinite(nextYearBounds?.max)
      ? nextYearBounds
      : null;
    const normalizedCatalog = normalizedYearBounds &&
      nextCatalog &&
      Array.isArray(nextCatalog.sites) &&
      Array.isArray(nextCatalog.parameters)
      ? {
        sites: nextCatalog.sites,
        parameters: nextCatalog.parameters,
        yearBounds: normalizedYearBounds,
      }
      : null;

    setRawData(Array.isArray(nextRawData) ? nextRawData : []);
    setInfoData(nextInfoData && typeof nextInfoData === "object" ? nextInfoData : {});
    setYearBounds(normalizedYearBounds);
    setLoading(false);

    if (!normalizedCatalog) {
      return;
    }

    setPlotState((prev) => sanitizePlotState(prev, normalizedCatalog));
  }, []);

  const handleApplyPlot = useCallback(() => {
    setPlotState((prev) => ({
      ...prev,
      plotWorkspaces: prev.plotWorkspaces.map((workspace) => (
        workspace.id === prev.activePlotId
          ? { ...workspace, applied: normalizeAppliedPlot(workspace.draft) }
          : workspace
      )),
    }));
  }, []);

  const handleSaveAsNewPlot = useCallback(() => {
    setPlotState((prev) => {
      if (prev.plotWorkspaces.length >= 2) {
        return prev;
      }

      const sourceWorkspace = prev.plotWorkspaces.find((workspace) => workspace.id === prev.activePlotId);
      if (!sourceWorkspace?.applied || draftMatchesApplied(sourceWorkspace.draft, sourceWorkspace.applied)) {
        return prev;
      }

      const hasCompleteDraft = hasRequiredPlotFields(sourceWorkspace.draft);
      if (!hasCompleteDraft) {
        return prev;
      }

      const nextWorkspace = createWorkspace(sourceWorkspace.draft, yearBounds);
      const restoredDraft = cloneDraft(sourceWorkspace.applied);

      return {
        plotWorkspaces: [
          ...prev.plotWorkspaces.map((workspace) => (
            workspace.id === sourceWorkspace.id
              ? { ...workspace, draft: restoredDraft }
              : workspace
          )),
          {
            ...nextWorkspace,
            applied: normalizeAppliedPlot(sourceWorkspace.draft),
          },
        ],
        activePlotId: nextWorkspace.id,
      };
    });
  }, [createWorkspace, yearBounds]);

  const handleSelectPlot = useCallback((workspaceId) => {
    setPlotState((prev) => (
      prev.activePlotId === workspaceId
        ? prev
        : { ...prev, activePlotId: workspaceId }
    ));
  }, []);

  const handleAddWorkspace = useCallback(() => {
    setPlotState((prev) => {
      if (prev.plotWorkspaces.length >= 2 || prev.plotWorkspaces.some((workspace) => workspace.applied == null)) {
        return prev;
      }

      const seedDraft = prev.plotWorkspaces.find((workspace) => workspace.id === prev.activePlotId)?.draft;
      const nextWorkspace = createWorkspace(seedDraft, yearBounds);

      return {
        plotWorkspaces: [...prev.plotWorkspaces, nextWorkspace],
        activePlotId: nextWorkspace.id,
      };
    });
  }, [createWorkspace, yearBounds]);

  const handleRemovePlot = useCallback((workspaceId) => {
    setPlotState((prev) => {
      const removeIndex = prev.plotWorkspaces.findIndex((workspace) => workspace.id === workspaceId);
      if (removeIndex === -1) {
        return prev;
      }

      const remaining = prev.plotWorkspaces.filter((workspace) => workspace.id !== workspaceId);
      if (remaining.length === 0) {
        const replacement = createWorkspace(null, yearBounds);
        return {
          plotWorkspaces: [replacement],
          activePlotId: replacement.id,
        };
      }

      const nextActivePlotId = prev.activePlotId === workspaceId
        ? (remaining[Math.max(0, removeIndex - 1)] || remaining[0]).id
        : prev.activePlotId;

      return {
        plotWorkspaces: remaining,
        activePlotId: nextActivePlotId,
      };
    });
  }, [createWorkspace, yearBounds]);

  const handleUpdateAppliedPlot = useCallback((workspaceId, updater) => {
    setPlotState((prev) => ({
      ...prev,
      plotWorkspaces: prev.plotWorkspaces.map((workspace) => {
        if (workspace.id !== workspaceId || !workspace.applied) {
          return workspace;
        }

        const nextApplied = typeof updater === "function"
          ? updater(workspace.applied)
          : { ...workspace.applied, ...updater };

        return nextApplied ? { ...workspace, applied: nextApplied } : workspace;
      }),
    }));
  }, []);

  const rightSide = showWelcome ? (
    <WelcomePanel
      onContinue={() => {
        setShowWelcome(false);
      }}
    />
  ) : (
    <Plots
      plotWorkspaces={plotWorkspaces}
      activePlotId={activePlotId}
      onSelectPlot={handleSelectPlot}
      onAddWorkspace={handleAddWorkspace}
      onRemovePlot={handleRemovePlot}
      onUpdateAppliedPlot={handleUpdateAppliedPlot}
      onSavePlot={handleApplyPlot}
      onSaveAsNewPlot={handleSaveAsNewPlot}
      showSaveAction={updateEnabled && hasDraftChanges}
      showSaveAsNewAction={Boolean(activeApplied) && hasDraftChanges && plotWorkspaces.length < 2}
      saveActionLabel={applyLabel}
      saveActionDisabled={applyDisabled}
      saveActionTitle={applyTitle}
      saveAsNewDisabled={saveAsNewDisabled}
      saveAsNewTitle={saveAsNewTitle}
      rawData={rawData}
      infoData={infoData}
      siteLocations={siteLocations}
      loading={loading}
    />
  );

  return (
    <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <div className="app">
        <Header />
        <div className="app-content">
          <Routes>
            <Route
              path="/"
              element={(
                <div className="main">
                  <div className="left">
                    <FilterMapPanel
                      activeDraft={activeDraft}
                      onFiltersChange={handleFiltersChange}
                      onDataLoaded={handleDataLoaded}
                      siteLocations={siteLocations}
                      siteLocationsError={siteLocationsError}
                      updateEnabled={updateEnabled}
                    />
                  </div>

                  <div className="right">
                    {rightSide}
                  </div>
                </div>
              )}
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </div>
    </Router>
  );
}

export default App;
