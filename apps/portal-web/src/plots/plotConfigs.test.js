/* eslint-env jest */
import {
  createPlotConfig,
  cycleTrendSite,
  upsertPlotConfig,
} from "./plotConfigs";

describe("plotConfigs", () => {
  it("creates a trend config with the last selected site as the default trend index", () => {
    expect(
      createPlotConfig({
        selectedSites: ["Lake Alpha", "Lake Beta"],
        chartType: "trend",
        parameter: "Total Phosphorus",
      })
    ).toMatchObject({
      selectedSites: ["Lake Alpha", "Lake Beta"],
      chartType: "trend",
      trendIndex: 1,
    });
  });

  it("removes stale trendIndex state from comparison configs", () => {
    expect(
      createPlotConfig({
        selectedSites: ["Lake Alpha"],
        chartType: "comparison",
        trendIndex: 99,
      })
    ).toEqual({
      selectedSites: ["Lake Alpha"],
      chartType: "comparison",
    });
  });

  it("upserts plot configs into stable two-slot state", () => {
    const first = upsertPlotConfig([], 0, {
      selectedSites: ["Lake Alpha"],
      chartType: "trend",
    });
    const second = upsertPlotConfig(first, 1, {
      selectedSites: ["Lake Beta"],
      chartType: "comparison",
    });

    expect(first).toHaveLength(2);
    expect(first[0]).toMatchObject({ trendIndex: 0 });
    expect(first[1]).toBeNull();
    expect(second[1]).toMatchObject({
      selectedSites: ["Lake Beta"],
      chartType: "comparison",
    });
  });

  it("cycles the active trend site in either direction with wraparound", () => {
    const startingState = [
      {
        selectedSites: ["Lake Alpha", "Lake Beta", "Lake Gamma"],
        chartType: "trend",
        trendIndex: 0,
      },
      null,
    ];

    const previous = cycleTrendSite(startingState, 0, -1);
    const next = cycleTrendSite(startingState, 0, 1);

    expect(previous[0].trendIndex).toBe(2);
    expect(next[0].trendIndex).toBe(1);
  });
});
