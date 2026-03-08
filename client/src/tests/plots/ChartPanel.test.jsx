/* eslint-env jest */
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ChartPanel, LightModal } from "../../plots/ChartPanel";

const d3BarChart = {
  title: "Conductivity Comparison by Site",
  type: "d3bar",
  data: {
    labels: ["Boardman River", "Platte River"],
    datasets: [
      {
        label: "Conductivity (uS/cm)",
        data: [155.2, 143.6],
        backgroundColor: ["#123456", "#abcdef"],
        customCounts: [987, 654],
      },
    ],
  },
};

const trendChart = {
  title: "Conductivity Trend for Boardman River",
  type: "boxplot",
  data: {
    labels: ["2023", "2024"],
    datasets: [
      {
        label: "Conductivity (uS/cm)",
        data: [
          { min: 120, q1: 130, median: 140, q3: 150, max: 160, mean: 141 },
          { min: 125, q1: 135, median: 145, q3: 155, max: 165, mean: 146 },
        ],
        borderColor: "#123456",
        customCounts: [12, 13],
      },
    ],
  },
};

const plotSummary = {
  context: {
    eyebrow: "Map selection",
    title: "2 selected sites",
    description: "Boardman River, Platte River",
    items: [
      { label: "Profiles found", value: "2/2" },
      { label: "View", value: "Comparison" },
    ],
  },
  metrics: {
    eyebrow: "Displayed data",
    items: [
      { label: "Field samples", value: "1,641" },
      { label: "Observed range", value: "143.6 to 155.2 uS/cm" },
    ],
  },
};

describe("ChartPanel", () => {
  test("renders modal titles at a normal readable size", () => {
    render(
      <LightModal
        title="Lake Association Information"
        body="Sample body"
        onClose={jest.fn()}
      />
    );

    const heading = screen.getByRole("heading", { name: "Lake Association Information" });
    expect(parseFloat(heading.style.fontSize)).toBeGreaterThanOrEqual(16);
    expect(parseFloat(heading.style.fontSize)).toBeLessThanOrEqual(20);
  });

  test("shows the empty prompt when no config has been applied", () => {
    render(<ChartPanel chartObj={null} cfg={null} slotLabel="Plot 1" options={{}} icons={null} />);

    expect(screen.getByText(/Click "Update Plot 1" to populate this plot\./i)).toBeInTheDocument();
  });

  test("supports an embedded empty-state prompt for new plots", () => {
    const { container } = render(
      <ChartPanel
        embedded
        chartObj={null}
        cfg={null}
        slotLabel="New Plot"
        emptyMessage={"Choose filters on the left. A save button will appear here when this plot changes."}
      />
    );

    expect(screen.getByText(/Choose filters on the left\. A save button will appear here/i)).toBeInTheDocument();
    expect(container.querySelector(".plot-panel--embedded")).not.toBeNull();
  });

  test("shows the no-data state when the chart has no labels", () => {
    render(
      <ChartPanel
        chartObj={{ type: "d3bar", data: { labels: [], datasets: [] } }}
        cfg={{ parameter: "Conductivity", chartType: "comparison" }}
        slotLabel="Plot 1"
        options={{}}
        icons={null}
      />
    );

    expect(screen.getByText(/No data for the current filters\./i)).toBeInTheDocument();
  });

  test("toggles counts on and off for rendered charts", async () => {
    const user = userEvent.setup();
    render(
      <ChartPanel
        chartObj={d3BarChart}
        cfg={{ parameter: "Conductivity", chartType: "comparison" }}
        slotLabel="Plot 1"
        options={{}}
        icons={null}
      />
    );

    await waitFor(() => expect(screen.getByText("Boardman River")).toBeInTheDocument());
    expect(screen.queryByText("987")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Show counts/i }));
    expect(await screen.findByText("987")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Hide counts/i })).toBeInTheDocument();
  });

  test("uses a compact font size for plot icon tooltips", async () => {
    const user = userEvent.setup();

    render(
      <ChartPanel
        chartObj={d3BarChart}
        cfg={{ parameter: "Conductivity", chartType: "comparison" }}
        slotLabel="Plot 1"
        options={{}}
        icons={null}
      />
    );

    const countsButton = screen.getByRole("button", { name: /Show counts/i });
    await user.hover(countsButton);

    const tooltip = await screen.findByRole("tooltip");
    expect(tooltip).toHaveTextContent("Show counts");
    expect(tooltip).toHaveStyle({ fontSize: "12px", padding: "6px 8px" });
  });

  test("renders larger plot icon buttons", () => {
    render(
      <ChartPanel
        chartObj={d3BarChart}
        cfg={{ parameter: "Conductivity", chartType: "comparison" }}
        slotLabel="Plot 1"
        options={{}}
        icons={null}
      />
    );

    expect(screen.getByRole("button", { name: /Show counts/i })).toHaveStyle({
      width: "36px",
      height: "36px",
      fontSize: "16px",
    });
  });

  test("adds chart-type modifier classes for comparison and trend plots", async () => {
    const { container, rerender } = render(
      <ChartPanel
        chartObj={d3BarChart}
        cfg={{ parameter: "Conductivity", chartType: "comparison" }}
        slotLabel="Plot 1"
        options={{}}
        icons={null}
      />
    );

    await waitFor(() => expect(container.querySelector(".plot-panel--comparison")).not.toBeNull());

    rerender(
      <ChartPanel
        chartObj={trendChart}
        cfg={{ parameter: "Conductivity", chartType: "trend" }}
        slotLabel="Plot 1"
        options={{}}
        icons={null}
      />
    );

    await waitFor(() => expect(container.querySelector(".plot-panel--trend")).not.toBeNull());
  });

  test("renders site navigation controls and invokes callbacks", async () => {
    const user = userEvent.setup();
    const prev = jest.fn();
    const next = jest.fn();

    render(
      <ChartPanel
        chartObj={d3BarChart}
        cfg={{ parameter: "Conductivity", chartType: "comparison" }}
        slotLabel="Plot 1"
        options={{}}
        icons={null}
        nav={{ prev, next, hasMultipleSites: true }}
      />
    );

    await user.click(screen.getByRole("button", { name: /Previous site/i }));
    await user.click(screen.getByRole("button", { name: /Next site/i }));

    expect(prev).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledTimes(1);
  });

  test("collapses and expands the plot summary", async () => {
    const user = userEvent.setup();

    render(
      <ChartPanel
        chartObj={d3BarChart}
        cfg={{ parameter: "Conductivity", chartType: "comparison" }}
        slotLabel="Plot 1"
        options={{}}
        icons={null}
        summary={plotSummary}
      />
    );

    const summaryRegion = screen.getByLabelText(/Plot summary/i);
    expect(summaryRegion).toBeInTheDocument();
    expect(summaryRegion).not.toHaveAttribute("hidden");
    expect(summaryRegion.style.display).toBe("");

    const collapseButton = screen.getByRole("button", { name: /Hide plot details/i });
    expect(collapseButton).toHaveAttribute("aria-expanded", "true");

    await user.click(collapseButton);

    expect(summaryRegion).toHaveAttribute("hidden");
    expect(summaryRegion).toHaveStyle({ display: "none" });
    expect(screen.getByRole("button", { name: /Show plot details/i })).toHaveAttribute("aria-expanded", "false");

    await user.click(screen.getByRole("button", { name: /Show plot details/i }));

    expect(summaryRegion).not.toHaveAttribute("hidden");
    expect(summaryRegion.style.display).toBe("");
    expect(screen.getByText("Map selection")).toBeInTheDocument();
  });

  test("renders only the remaining displayed-data metrics", () => {
    render(
      <ChartPanel
        chartObj={d3BarChart}
        cfg={{ parameter: "Conductivity", chartType: "comparison" }}
        slotLabel="Plot 1"
        options={{}}
        icons={null}
        summary={plotSummary}
      />
    );

    expect(screen.getByText("Field samples")).toBeInTheDocument();
    expect(screen.getByText("Observed range")).toBeInTheDocument();
    expect(screen.queryByText("Conductivity (uS/cm)")).not.toBeInTheDocument();
    expect(screen.queryByText("Year span")).not.toBeInTheDocument();
    expect(screen.queryByText("Sites shown")).not.toBeInTheDocument();
    expect(screen.queryByText("Years shown")).not.toBeInTheDocument();
  });

  test("renders summary metrics inline with the heading content", () => {
    const { container } = render(
      <ChartPanel
        chartObj={d3BarChart}
        cfg={{ parameter: "Conductivity", chartType: "comparison" }}
        slotLabel="Plot 1"
        options={{}}
        icons={null}
        summary={plotSummary}
      />
    );

    const contextHeadingRow = container.querySelector(".plot-summary-card--context .plot-summary-heading-row");
    const metricsHeadingRow = container.querySelector(".plot-summary-card--metrics .plot-summary-heading-row");

    expect(contextHeadingRow).not.toBeNull();
    expect(metricsHeadingRow).not.toBeNull();
    expect(contextHeadingRow).toHaveTextContent("2 selected sites");
    expect(contextHeadingRow).toHaveTextContent("Profiles found");
    expect(contextHeadingRow).toHaveTextContent("2/2");
    expect(metricsHeadingRow).toHaveTextContent("Field samples");
    expect(metricsHeadingRow).toHaveTextContent("1,641");
    expect(metricsHeadingRow).toHaveTextContent("Observed range");
  });

  test("renders chart actions in a toolbar row beneath the title", () => {
    const { container } = render(
      <ChartPanel
        chartObj={trendChart}
        cfg={{ parameter: "Conductivity", chartType: "trend" }}
        slotLabel="Plot 1"
        options={{}}
        icons={null}
        nav={{ prev: jest.fn(), next: jest.fn(), hasMultipleSites: true }}
        summary={plotSummary}
      />
    );

    expect(container.querySelector(".plot-header-toolbar")).not.toBeNull();
    expect(container.querySelector(".plot-header-toolbar-right")).not.toBeNull();
  });
});
