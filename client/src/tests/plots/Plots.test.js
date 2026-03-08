/* eslint-env jest */
import React from "react";
import { render, screen } from "@testing-library/react";

import Plots from "../../Plots";

jest.mock("../../plots/chartBuilders", () => ({
  buildComparisonChart: jest.fn(() => null),
  buildTrendChart: jest.fn(() => null),
}));

jest.mock("../../plots/chartUtils", () => ({
  defaultColors: [],
  makeOptions: jest.fn(() => ({})),
}));

jest.mock("../../plots/ChartPanel", () => ({
  ChartPanel: ({ slotLabel, emptyMessage }) => (
    <div data-testid="chart-panel">{emptyMessage || slotLabel || "Chart Panel"}</div>
  ),
  IconWithTooltip: () => null,
  LightModal: () => null,
}));

describe("Plots", () => {
  test("shows the mock data disclaimer and loading state inside the plot shell", () => {
    render(
      <Plots
        plotWorkspaces={[
          {
            id: "plot-1",
            draft: {
              selectedSites: [],
              parameter: "",
              startYear: 2024,
              endYear: 2025,
              chartType: "trend",
            },
            applied: null,
          },
        ]}
        activePlotId="plot-1"
        onSelectPlot={jest.fn()}
        onAddWorkspace={jest.fn()}
        onRemovePlot={jest.fn()}
        onUpdateAppliedPlot={jest.fn()}
        rawData={[]}
        infoData={{}}
        loading
      />
    );

    expect(
      screen.getByText(/Disclaimer: This plot panel is currently displaying mock data\./i)
    ).toBeInTheDocument();
    expect(screen.getByText(/Loading data/i)).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /New Plot/i })).not.toBeInTheDocument();
  });

  test("shows the header save action for a changed draft workspace", () => {
    render(
      <Plots
        plotWorkspaces={[
          {
            id: "plot-1",
            draft: {
              selectedSites: ["Lake Alpha"],
              parameter: "Conductivity",
              startYear: 2024,
              endYear: 2025,
              chartType: "trend",
            },
            applied: null,
          },
        ]}
        activePlotId="plot-1"
        onSelectPlot={jest.fn()}
        onAddWorkspace={jest.fn()}
        onRemovePlot={jest.fn()}
        onUpdateAppliedPlot={jest.fn()}
        onSavePlot={jest.fn()}
        showSaveAction
        saveActionLabel="Save Plot"
        rawData={[{ Site: "Mock Site", Parameter: "Total Phosphorus", Year: "2024" }]}
        infoData={{}}
        loading={false}
      />
    );

    expect(screen.queryByRole("tab", { name: /New Plot/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Save Plot/i })).toBeInTheDocument();
    expect(screen.getByTestId("chart-panel")).toHaveTextContent(
      "Choose filters on the left. A save button will appear here when this plot changes."
    );
    expect(screen.queryByRole("button", { name: /New Plot/i })).not.toBeInTheDocument();
  });
});
