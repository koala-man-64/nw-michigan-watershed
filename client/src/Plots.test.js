/* eslint-env jest */
import React from "react";
import { render, screen } from "@testing-library/react";

import Plots from "./Plots";

jest.mock("./plots/chartBuilders", () => ({
  buildComparisonChart: jest.fn(() => null),
  buildTrendChart: jest.fn(() => null),
}));

jest.mock("./plots/chartUtils", () => ({
  defaultColors: [],
  makeOptions: jest.fn(() => ({})),
}));

jest.mock("./plots/ChartPanel", () => ({
  ChartPanel: ({ slotLabel }) => <div data-testid={`chart-panel-${slotLabel}`}>{slotLabel}</div>,
  IconWithTooltip: () => null,
  LightModal: () => null,
}));

describe("Plots", () => {
  test("shows the mock data disclaimer while loading", () => {
    render(
      <Plots
        plotConfigs={[]}
        setPlotConfigs={jest.fn()}
        rawData={[]}
        infoData={{}}
        loading
      />
    );

    expect(
      screen.getByText(/Disclaimer: This plot panel is currently displaying mock data\./i)
    ).toBeInTheDocument();
    expect(screen.getByText(/Loading data/i)).toBeInTheDocument();
  });

  test("shows the mock data disclaimer above the chart slots", () => {
    render(
      <Plots
        plotConfigs={[]}
        setPlotConfigs={jest.fn()}
        rawData={[{ Site: "Mock Site", Parameter: "Total Phosphorus", Year: "2024" }]}
        infoData={{}}
        loading={false}
      />
    );

    expect(
      screen.getByText(/Disclaimer: This plot panel is currently displaying mock data\./i)
    ).toBeInTheDocument();
    expect(screen.getByTestId("chart-panel-Plot 1")).toBeInTheDocument();
    expect(screen.getByTestId("chart-panel-Plot 2")).toBeInTheDocument();
  });
});
