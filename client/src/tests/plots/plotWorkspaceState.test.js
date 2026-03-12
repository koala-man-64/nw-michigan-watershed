/* eslint-env jest */
import {
  cloneDraft,
  createEmptyDraft,
  createInitialPlotState,
  draftMatchesApplied,
  getNextWorkspaceNumber,
  getWorkspaceTabLabel,
  hasRequiredPlotFields,
  hydrateDraftWithYearBounds,
  normalizeAppliedPlot,
  sanitizePlotState,
} from "../../plots/plotWorkspaceState";

describe("plotWorkspaceState", () => {
  test("creates an empty draft with year bounds when provided", () => {
    expect(createEmptyDraft({ min: 2020, max: 2025 })).toEqual({
      selectedSites: [],
      parameter: "",
      startYear: 2020,
      endYear: 2025,
      chartType: "trend",
    });
  });

  test("clones draft fields without sharing selectedSites", () => {
    const source = {
      selectedSites: ["Lake Alpha"],
      parameter: "Conductivity",
      startYear: 2024,
      endYear: 2025,
      chartType: "comparison",
    };

    const clone = cloneDraft(source);
    clone.selectedSites.push("Lake Beta");

    expect(source.selectedSites).toEqual(["Lake Alpha"]);
    expect(clone.chartType).toBe("comparison");
  });

  test("hydrates missing years from available bounds", () => {
    expect(
      hydrateDraftWithYearBounds(
        {
          selectedSites: ["Lake Alpha"],
          parameter: "Conductivity",
          startYear: null,
          endYear: null,
          chartType: "trend",
        },
        { min: 2024, max: 2025 }
      )
    ).toEqual({
      selectedSites: ["Lake Alpha"],
      parameter: "Conductivity",
      startYear: 2024,
      endYear: 2025,
      chartType: "trend",
    });
  });

  test("normalizes trend plots with a trend index and preserves site order in dirty checks", () => {
    const draft = {
      selectedSites: ["Lake Alpha", "Lake Gamma"],
      parameter: "Total Phosphorus",
      startYear: 2024,
      endYear: 2025,
      chartType: "trend",
    };

    expect(normalizeAppliedPlot(draft)).toEqual({
      ...draft,
      trendIndex: 1,
    });

    expect(
      draftMatchesApplied(draft, {
        ...draft,
        trendIndex: 0,
      })
    ).toBe(true);

    expect(
      draftMatchesApplied(draft, {
        ...draft,
        selectedSites: ["Lake Gamma", "Lake Alpha"],
        trendIndex: 1,
      })
    ).toBe(false);
  });

  test("sanitizes restored plot state against the current catalog", () => {
    expect(
      sanitizePlotState(
        {
          plotWorkspaces: [
            {
              id: "plot-2",
              draft: {
                selectedSites: ["Lake Alpha", "Lake Alpha", "Missing Site"],
                parameter: "Conductivity",
                startYear: 2018,
                endYear: 2030,
                chartType: "comparison",
              },
              applied: {
                selectedSites: ["Lake Alpha", "Missing Site"],
                parameter: "Conductivity",
                startYear: 2018,
                endYear: 2030,
                chartType: "trend",
                trendIndex: 9,
              },
            },
            {
              id: "plot-3",
              draft: {
                selectedSites: ["Missing Site"],
                parameter: "Missing Parameter",
                startYear: 2010,
                endYear: 2011,
                chartType: "trend",
              },
              applied: {
                selectedSites: ["Missing Site"],
                parameter: "Missing Parameter",
                startYear: 2010,
                endYear: 2011,
                chartType: "trend",
                trendIndex: 0,
              },
            },
          ],
          activePlotId: "missing-plot",
        },
        {
          sites: ["Lake Alpha", "Lake Gamma"],
          parameters: ["Conductivity"],
          yearBounds: { min: 2024, max: 2025 },
        }
      )
    ).toEqual({
      plotWorkspaces: [
        {
          id: "plot-2",
          draft: {
            selectedSites: ["Lake Alpha"],
            parameter: "Conductivity",
            startYear: 2024,
            endYear: 2025,
            chartType: "comparison",
          },
          applied: {
            selectedSites: ["Lake Alpha"],
            parameter: "Conductivity",
            startYear: 2024,
            endYear: 2025,
            chartType: "trend",
            trendIndex: 0,
          },
        },
        {
          id: "plot-3",
          draft: {
            selectedSites: [],
            parameter: "",
            startYear: 2024,
            endYear: 2024,
            chartType: "trend",
          },
          applied: null,
        },
      ],
      activePlotId: "plot-2",
    });
  });

  test("collapses fully invalid restored workspaces to a single empty draft", () => {
    expect(
      sanitizePlotState(
        {
          plotWorkspaces: [
            {
              id: "plot-2",
              draft: {
                selectedSites: ["Missing Site"],
                parameter: "Missing Parameter",
                startYear: 2010,
                endYear: 2011,
                chartType: "trend",
              },
              applied: {
                selectedSites: ["Missing Site"],
                parameter: "Missing Parameter",
                startYear: 2010,
                endYear: 2011,
                chartType: "trend",
                trendIndex: 0,
              },
            },
          ],
          activePlotId: "plot-2",
        },
        {
          sites: ["Lake Alpha"],
          parameters: ["Conductivity"],
          yearBounds: { min: 2024, max: 2025 },
        }
      )
    ).toEqual(createInitialPlotState({ min: 2024, max: 2025 }, "plot-2"));
  });

  test("reports required plot fields and calculates the next workspace number", () => {
    expect(
      hasRequiredPlotFields({
        selectedSites: ["Lake Alpha"],
        parameter: "Conductivity",
        startYear: 2024,
        endYear: 2025,
        chartType: "trend",
      })
    ).toBe(true);

    expect(
      hasRequiredPlotFields({
        selectedSites: [],
        parameter: "",
        startYear: 2024,
        endYear: 2025,
        chartType: "trend",
      })
    ).toBe(false);

    expect(
      getNextWorkspaceNumber({
        plotWorkspaces: [
          { id: "plot-2" },
          { id: "plot-9" },
        ],
      })
    ).toBe(10);
  });

  test("returns descriptive tab labels for saved plots and new plot labels for drafts", () => {
    expect(
      getWorkspaceTabLabel({
        id: "plot-1",
        draft: createEmptyDraft(),
        applied: null,
      })
    ).toEqual({
      primary: "New Plot",
      secondary: "Draft",
      title: "New Plot",
    });

    expect(
      getWorkspaceTabLabel({
        id: "plot-2",
        draft: {
          selectedSites: ["Boardman River"],
          parameter: "Conductivity",
          startYear: 2024,
          endYear: 2024,
          chartType: "comparison",
        },
        applied: {
          selectedSites: ["Boardman River"],
          parameter: "Conductivity",
          startYear: 2024,
          endYear: 2024,
          chartType: "comparison",
        },
      })
    ).toEqual({
      primary: "Conductivity (uS/cm)",
      secondary: "Comparison",
      title: "Conductivity (uS/cm) - Comparison",
    });
  });
});
