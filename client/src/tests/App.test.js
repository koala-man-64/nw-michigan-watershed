/* eslint-env jest */
import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import App from "../App";
import { PLOT_SESSION_STORAGE_KEY } from "../plots/plotSessionStorage";

const mockCatalog = {
  sites: ["Site Alpha", "Site Beta"],
  parameters: ["Chloride (mg/L)", "Nitrate (mg/L)"],
  yearBounds: { min: 2020, max: 2025 },
};

jest.mock("../FiltersPanel", () => {
  const React = require("react");

  return function MockFiltersPanel({ filters, onFiltersChange, onDataLoaded }) {
    React.useEffect(() => {
      onDataLoaded?.({
        rawData: [
          { Site: "Site Alpha", Parameter: "Chloride (mg/L)", Year: "2020" },
          { Site: "Site Beta", Parameter: "Nitrate (mg/L)", Year: "2021" },
        ],
        infoData: {},
        yearBounds: mockCatalog.yearBounds,
        catalog: mockCatalog,
      });
    }, [onDataLoaded]);

    const selectedSites = Array.isArray(filters?.selectedSites) && filters.selectedSites.length
      ? filters.selectedSites.join(",")
      : "none";
    const selectedParameter = filters?.parameter || "none";
    const startYear = filters?.startYear ?? "none";
    const endYear = filters?.endYear ?? "none";

    return (
      <div data-testid="filters-panel">
        <div data-testid="filters-state">
          {`sites=${selectedSites};parameter=${selectedParameter};years=${startYear}-${endYear};chart=${filters?.chartType || "trend"}`}
        </div>
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
  };
});

jest.mock("../MapPanel", () => function MockMapPanel() {
  return <div data-testid="map-panel">Map Panel</div>;
});

jest.mock("../hooks/useSiteLocations", () => function mockUseSiteLocations() {
  return { data: [], error: null };
});

jest.mock("../Plots", () => function MockPlots({
  plotWorkspaces,
  activePlotId,
  onAddWorkspace,
  onSelectPlot,
  onSavePlot,
  onSaveAsNewPlot,
  showSaveAction,
  showSaveAsNewAction,
  saveActionDisabled,
  saveAsNewDisabled,
}) {
  const activeWorkspace = plotWorkspaces.find((workspace) => workspace.id === activePlotId) || plotWorkspaces[0];
  const workspaceSummary = plotWorkspaces.map((workspace) => (
    `${workspace.id}:applied=${workspace.applied?.parameter || "none"};draft=${workspace.draft?.parameter || "none"};trend=${workspace.applied?.trendIndex ?? "none"}`
  )).join("|");

  return (
    <div data-testid="plots-panel">
      {`workspaces:${plotWorkspaces.length};active:${activeWorkspace?.id};draft:${activeWorkspace?.applied ? "saved" : "new"}`}
      <div data-testid="plots-workspaces">{workspaceSummary}</div>
      <button type="button" onClick={onAddWorkspace}>
        Mock New Plot
      </button>
      {plotWorkspaces.map((workspace) => (
        <button key={workspace.id} type="button" onClick={() => onSelectPlot?.(workspace.id)}>
          {`Select ${workspace.id}`}
        </button>
      ))}
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

function seedSession(session) {
  window.localStorage.setItem(
    PLOT_SESSION_STORAGE_KEY,
    JSON.stringify({
      version: 1,
      ...session,
    })
  );
}

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

  test("restores the persisted workspace state and skips the welcome panel on revisit", () => {
    seedSession({
      showWelcome: false,
      plotState: {
        plotWorkspaces: [
          {
            id: "plot-1",
            draft: {
              selectedSites: ["Site Alpha"],
              parameter: "Chloride (mg/L)",
              startYear: 2020,
              endYear: 2025,
              chartType: "trend",
            },
            applied: {
              selectedSites: ["Site Alpha"],
              parameter: "Chloride (mg/L)",
              startYear: 2020,
              endYear: 2025,
              chartType: "trend",
              trendIndex: 0,
            },
          },
          {
            id: "plot-2",
            draft: {
              selectedSites: ["Site Beta"],
              parameter: "Chloride (mg/L)",
              startYear: 2021,
              endYear: 2025,
              chartType: "trend",
            },
            applied: {
              selectedSites: ["Site Beta"],
              parameter: "Nitrate (mg/L)",
              startYear: 2021,
              endYear: 2025,
              chartType: "comparison",
            },
          },
        ],
        activePlotId: "plot-2",
      },
    });

    render(<App />);

    expect(screen.queryByText(/Welcome to the NW Michigan Water Quality Database/i)).not.toBeInTheDocument();
    expect(screen.getByTestId("plots-panel")).toHaveTextContent("workspaces:2");
    expect(screen.getByTestId("plots-panel")).toHaveTextContent("active:plot-2");
    expect(screen.getByTestId("plots-workspaces")).toHaveTextContent(
      "plot-1:applied=Chloride (mg/L);draft=Chloride (mg/L);trend=0"
    );
    expect(screen.getByTestId("plots-workspaces")).toHaveTextContent(
      "plot-2:applied=Nitrate (mg/L);draft=Chloride (mg/L);trend=none"
    );
    expect(screen.getByTestId("filters-state")).toHaveTextContent(
      "sites=Site Beta;parameter=Chloride (mg/L);years=2021-2025;chart=trend"
    );
  });

  test("salvages valid persisted values against the live catalog", async () => {
    seedSession({
      showWelcome: false,
      plotState: {
        plotWorkspaces: [
          {
            id: "plot-2",
            draft: {
              selectedSites: ["Site Alpha", "Site Alpha", "Missing Site"],
              parameter: "Missing Parameter",
              startYear: 2018,
              endYear: 2030,
              chartType: "trend",
            },
            applied: {
              selectedSites: ["Site Alpha", "Missing Site"],
              parameter: "Missing Parameter",
              startYear: 2018,
              endYear: 2030,
              chartType: "trend",
              trendIndex: 4,
            },
          },
        ],
        activePlotId: "missing-plot",
      },
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByTestId("filters-state")).toHaveTextContent(
        "sites=Site Alpha;parameter=none;years=2020-2025;chart=trend"
      );
    });
    expect(screen.getByTestId("plots-panel")).toHaveTextContent("active:plot-2");
    expect(screen.getByTestId("plots-workspaces")).toHaveTextContent(
      "plot-2:applied=none;draft=none;trend=none"
    );
  });

  test("writes the dismissed welcome state and reloads it on the next visit", async () => {
    const firstRender = render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /Continue/i }));

    await waitFor(() => {
      const persistedSession = JSON.parse(window.localStorage.getItem(PLOT_SESSION_STORAGE_KEY));
      expect(persistedSession.showWelcome).toBe(false);
    });

    firstRender.unmount();
    render(<App />);

    expect(screen.queryByText(/Welcome to the NW Michigan Water Quality Database/i)).not.toBeInTheDocument();
    expect(screen.getByTestId("plots-panel")).toHaveTextContent("workspaces:1");
  });

  test("continues workspace numbering from restored plot ids", () => {
    seedSession({
      showWelcome: false,
      plotState: {
        plotWorkspaces: [
          {
            id: "plot-2",
            draft: {
              selectedSites: ["Site Alpha"],
              parameter: "Chloride (mg/L)",
              startYear: 2020,
              endYear: 2025,
              chartType: "trend",
            },
            applied: {
              selectedSites: ["Site Alpha"],
              parameter: "Chloride (mg/L)",
              startYear: 2020,
              endYear: 2025,
              chartType: "trend",
              trendIndex: 0,
            },
          },
        ],
        activePlotId: "plot-2",
      },
    });

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /Mock New Plot/i }));

    expect(screen.getByTestId("plots-panel")).toHaveTextContent("active:plot-3");
    expect(screen.getByTestId("plots-workspaces")).toHaveTextContent("plot-3:applied=none;draft=Chloride (mg/L)");
  });

  test("falls back cleanly when persisted session reads fail", () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    const getItemSpy = jest.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("storage unavailable");
    });

    render(<App />);

    expect(screen.getByText(/Welcome to the NW Michigan Water Quality Database/i)).toBeInTheDocument();
    expect(warnSpy).toHaveBeenCalledWith(
      "[nwmiws:plot-session] Unable to read persisted plot session.",
      expect.any(Error)
    );

    getItemSpy.mockRestore();
    warnSpy.mockRestore();
  });

  test("redirects the retired chat route back to the home experience", () => {
    window.history.pushState({}, "", "/chat-rudy");

    render(<App />);

    expect(screen.getByText(/Welcome to the NW Michigan Water Quality Database/i)).toBeInTheDocument();
  });
});
