/* eslint-env jest */
import {
  cloneDraft,
  createEmptyDraft,
  draftMatchesApplied,
  getWorkspaceTabLabel,
  hydrateDraftWithYearBounds,
  normalizeAppliedPlot,
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
