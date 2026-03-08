/* eslint-env jest */
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";

import App from "../App";

jest.mock("../FiltersPanel", () => function MockFiltersPanel({ onFiltersChange }) {
  return (
    <div data-testid="filters-panel">
      <button
        type="button"
        onClick={() => onFiltersChange({
          selectedSites: ["Site Alpha"],
          parameter: "Chloride (mg/L)",
          startYear: 2020,
          endYear: 2025,
          chartType: "trend",
        })}
      >
        Set Plot A
      </button>
      <button
        type="button"
        onClick={() => onFiltersChange({
          selectedSites: ["Site Beta"],
          parameter: "Nitrate (mg/L)",
          startYear: 2021,
          endYear: 2025,
          chartType: "comparison",
        })}
      >
        Set Plot B
      </button>
    </div>
  );
});

jest.mock("../MapPanel", () => function MockMapPanel() {
  return <div data-testid="map-panel">Map Panel</div>;
});

jest.mock("../Plots", () => function MockPlots({
  plotWorkspaces,
  activePlotId,
  onSavePlot,
  onSaveAsNewPlot,
  showSaveAction,
  showSaveAsNewAction,
  saveActionDisabled,
  saveAsNewDisabled,
}) {
  const activeWorkspace = plotWorkspaces.find((workspace) => workspace.id === activePlotId) || plotWorkspaces[0];
  const workspaceSummary = plotWorkspaces.map((workspace) => (
    `${workspace.id}:applied=${workspace.applied?.parameter || "none"};draft=${workspace.draft?.parameter || "none"}`
  )).join("|");

  return (
    <div data-testid="plots-panel">
      {`workspaces:${plotWorkspaces.length};active:${activeWorkspace?.id};draft:${activeWorkspace?.applied ? "saved" : "new"}`}
      <div data-testid="plots-workspaces">{workspaceSummary}</div>
      {showSaveAction ? (
        <button type="button" onClick={onSavePlot} disabled={saveActionDisabled}>
          Mock Save
        </button>
      ) : null}
      {showSaveAsNewAction ? (
        <button type="button" onClick={onSaveAsNewPlot} disabled={saveAsNewDisabled}>
          Mock Save As New
        </button>
      ) : null}
    </div>
  );
});

describe("App", () => {
  beforeEach(() => {
    window.history.pushState({}, "", "/");
  });

  test("renders the application shell and welcome content", () => {
    const { container } = render(<App />);

    expect(screen.getByText(/Northwest Michigan Watershed Coalition/i)).toBeInTheDocument();
    expect(screen.getByTestId("filters-panel")).toBeInTheDocument();
    expect(screen.getByTestId("map-panel")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Chat with Rudy/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Exit/i })).not.toBeInTheDocument();
    expect(screen.getByText(/Welcome to the NW Michigan Water Quality Database/i)).toBeInTheDocument();

    const appShell = container.querySelector(".app");
    const mainLayout = container.querySelector(".main");
    const leftPane = container.querySelector(".left");
    const rightPane = container.querySelector(".right");

    expect(appShell).not.toBeNull();
    expect(mainLayout).not.toBeNull();
    expect(leftPane).not.toBeNull();
    expect(rightPane).not.toBeNull();
    expect(appShell.style.display).toBe("");
    expect(mainLayout.style.display).toBe("");
    expect(rightPane.style.display).toBe("");
  });

  test("shows a single new plot workspace after continuing from the welcome view", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /Continue/i }));

    expect(screen.getByTestId("plots-panel")).toHaveTextContent("workspaces:1");
    expect(screen.getByTestId("plots-panel")).toHaveTextContent("draft:new");
  });

  test("saves draft changes as a new plot without changing the original workspace", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /Continue/i }));
    fireEvent.click(screen.getByRole("button", { name: /Set Plot A/i }));
    fireEvent.click(screen.getByRole("button", { name: /Mock Save/i }));

    expect(screen.getByTestId("plots-workspaces")).toHaveTextContent(
      "plot-1:applied=Chloride (mg/L);draft=Chloride (mg/L)"
    );

    fireEvent.click(screen.getByRole("button", { name: /Set Plot B/i }));
    fireEvent.click(screen.getByRole("button", { name: /Mock Save As New/i }));

    expect(screen.getByTestId("plots-panel")).toHaveTextContent("workspaces:2");
    expect(screen.getByTestId("plots-panel")).toHaveTextContent("active:plot-2");
    expect(screen.getByTestId("plots-workspaces")).toHaveTextContent(
      "plot-1:applied=Chloride (mg/L);draft=Chloride (mg/L)"
    );
    expect(screen.getByTestId("plots-workspaces")).toHaveTextContent(
      "plot-2:applied=Nitrate (mg/L);draft=Nitrate (mg/L)"
    );
  });

  test("redirects the retired chat route back to the home experience", () => {
    window.history.pushState({}, "", "/chat-rudy");

    render(<App />);

    expect(screen.getByText(/Welcome to the NW Michigan Water Quality Database/i)).toBeInTheDocument();
  });
});
