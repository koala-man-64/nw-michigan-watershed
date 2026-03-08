/* eslint-env jest */

import { buildPlotSummary } from "../../plots/plotSummary";

describe("buildPlotSummary", () => {
  test("omits year and count tiles from the displayed-data summary", () => {
    const summary = buildPlotSummary({
      cfg: {
        parameter: "Conductivity",
        chartType: "comparison",
        selectedSites: ["Boardman River", "Platte River"],
        startYear: 2023,
        endYear: 2024,
      },
      chartObj: {
        type: "d3bar",
        data: {
          labels: ["Boardman River", "Platte River"],
          datasets: [
            {
              data: [155.2, 143.6],
              customCounts: [987, 654],
            },
          ],
        },
      },
      siteLocations: [],
    });

    expect(summary.metrics.title).toBeUndefined();
    expect(summary.metrics.items).toEqual([
      { label: "Field samples", value: "1,641" },
      { label: "Observed range", value: "143.6 to 155.2 uS/cm" },
    ]);
  });
});
