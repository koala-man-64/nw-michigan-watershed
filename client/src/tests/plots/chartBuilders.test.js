/* eslint-env jest */
jest.mock("../../plots/chartUtils", () => ({
  round3: (value) => (
    Number.isFinite(value) ? Math.round(value * 1000) / 1000 : value
  ),
  wrapLabel: (label) => label,
}));

import { buildComparisonChart, buildTrendChart } from "../../plots/chartBuilders";

describe("chartBuilders", () => {
  test("buildTrendChart uses the unit-aware parameter label while filtering by the raw parameter", () => {
    const rawData = [
      {
        Site: "Lake Alpha",
        Parameter: "Total Phosphorus",
        Year: "2024",
        Avg: "12.4",
        Min: "10.2",
        Max: "15.1",
        Count: "3",
      },
      {
        Site: "Lake Alpha",
        Parameter: "Total Phosphorus",
        Year: "2025",
        Avg: "11.1",
        Min: "9.7",
        Max: "13.4",
        Count: "2",
      },
      {
        Site: "Lake Alpha",
        Parameter: "Chloride",
        Year: "2025",
        Avg: "1.2",
        Min: "0.9",
        Max: "1.4",
        Count: "4",
      },
    ];

    const chart = buildTrendChart(
      rawData,
      {
        parameter: "Total Phosphorus",
        selectedSites: ["Lake Alpha"],
        startYear: 2024,
        endYear: 2025,
        trendIndex: 0,
      },
      ["#123456"]
    );

    expect(chart.title).toBe("Total Phosphorus (ug/L) Trend for Lake Alpha");
    expect(chart.subtitle).toBe("Total Phosphorus (ug/L) by year");
    expect(chart.data.datasets[0].label).toBe("Total Phosphorus (ug/L)");
    expect(chart.data.labels).toEqual(["2024", "2025"]);
    expect(chart.data.datasets[0].data).toHaveLength(2);
  });

  test("buildComparisonChart uses the unit-aware parameter label", () => {
    const rawData = [
      {
        Site: "Boardman River",
        Parameter: "Conductivity",
        Year: "2024",
        Avg: "155.2",
        Min: "150.1",
        Max: "160.9",
        Count: "4",
      },
      {
        Site: "Platte River",
        Parameter: "Conductivity",
        Year: "2024",
        Avg: "143.6",
        Min: "140.2",
        Max: "147.8",
        Count: "5",
      },
    ];

    const chart = buildComparisonChart(
      rawData,
      {
        parameter: "Conductivity",
        selectedSites: ["Boardman River", "Platte River"],
        startYear: 2024,
        endYear: 2024,
      },
      ["#123456", "#abcdef"]
    );

    expect(chart.title).toBe("Conductivity (uS/cm) Comparison by Site");
    expect(chart.data.datasets[0].label).toBe("Conductivity (uS/cm)");
    expect(chart.data.datasets[0].data).toEqual([155.2, 143.6]);
  });
});
