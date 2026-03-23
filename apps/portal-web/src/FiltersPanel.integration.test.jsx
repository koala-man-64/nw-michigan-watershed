import React from "react";
import PropTypes from "prop-types";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import FiltersPanel from "./FiltersPanel";
import { RuntimeConfigProvider } from "./runtime/runtimeConfigContext";
import { resetRuntimeConfigForTests } from "./config/runtimeConfig";

const fixtureSupport = require("../../../test-support/fixtures/index.cjs");

function createJsonResponse(body, init = {}) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
      ...init,
    })
  );
}

function createFetchRouter(overrides = {}) {
  const routes = {
    "/api/portal/bootstrap": () => createJsonResponse(fixtureSupport.readJsonFixture("portal-bootstrap.json")),
    "/api/measurements": () => createJsonResponse(fixtureSupport.readJsonFixture("measurements.json")),
    "/api/parameters": () => createJsonResponse(fixtureSupport.readJsonFixture("parameters.json")),
    ...overrides,
  };

  return vi.fn((input) => {
    const url = typeof input === "string" ? input : input.url;
    const route = routes[url];
    if (!route) {
      return Promise.reject(new Error(`Unexpected fetch request: ${url}`));
    }
    return route();
  });
}

function FiltersHarness({
  onDataLoaded = vi.fn(),
  onFiltersChange = vi.fn(),
  onUpdatePlot1 = vi.fn(),
  onUpdatePlot2 = vi.fn(),
  resetSignal = 0,
}) {
  return (
    <RuntimeConfigProvider>
      <FiltersPanel
        selectedSites={[]}
        onDataLoaded={onDataLoaded}
        onFiltersChange={onFiltersChange}
        onUpdatePlot1={onUpdatePlot1}
        onUpdatePlot2={onUpdatePlot2}
        resetSignal={resetSignal}
        updateEnabled
      />
    </RuntimeConfigProvider>
  );
}

FiltersHarness.propTypes = {
  onDataLoaded: PropTypes.func,
  onFiltersChange: PropTypes.func,
  onUpdatePlot1: PropTypes.func,
  onUpdatePlot2: PropTypes.func,
  resetSignal: PropTypes.number,
};

describe("FiltersPanel integration", () => {
  afterEach(() => {
    resetRuntimeConfigForTests();
    vi.unstubAllGlobals();
  });

  it("loads runtime config and datasets through the real provider path", async () => {
    const onDataLoaded = vi.fn();
    const onFiltersChange = vi.fn();
    vi.stubGlobal("fetch", createFetchRouter());

    render(<FiltersHarness onDataLoaded={onDataLoaded} onFiltersChange={onFiltersChange} />);

    await waitFor(() => {
      expect(onDataLoaded).toHaveBeenCalled();
    });

    expect(onDataLoaded).toHaveBeenCalledWith(
      expect.objectContaining({
        rawData: expect.arrayContaining([
          expect.objectContaining({
            Site: "Bear Lake (Manistee)",
            Parameter: "Chloro",
            Year: "2000",
          }),
        ]),
        infoData: expect.objectContaining({
          Chloro: expect.objectContaining({
            Parameter: "Chloro",
          }),
        }),
      })
    );
    expect(onFiltersChange).toHaveBeenCalledWith({ startYear: 2000, endYear: 2001 });
    expect(await screen.findByRole("option", { name: "Chloro" })).toBeInTheDocument();
    expect(screen.getAllByRole("option", { name: "2000" })).toHaveLength(2);
  });

  it("resets the filter state back to the loaded year range", async () => {
    const user = userEvent.setup();
    const onFiltersChange = vi.fn();
    vi.stubGlobal("fetch", createFetchRouter());

    const { rerender } = render(<FiltersHarness onFiltersChange={onFiltersChange} resetSignal={0} />);

    await waitFor(() => {
      expect(onFiltersChange).toHaveBeenCalledWith({ startYear: 2000, endYear: 2001 });
    });

    const selects = await screen.findAllByRole("combobox");
    await user.selectOptions(selects[0], "2001");
    await user.selectOptions(selects[2], "TP");

    rerender(<FiltersHarness onFiltersChange={onFiltersChange} resetSignal={1} />);

    await waitFor(() => {
      expect(onFiltersChange).toHaveBeenLastCalledWith({
        selectedSites: [],
        parameter: "",
        startYear: 2000,
        endYear: 2001,
        chartType: "trend",
      });
    });
  });

  it("falls back to empty loaded data when dataset fetch fails", async () => {
    const onDataLoaded = vi.fn();
    vi.stubGlobal(
      "fetch",
      createFetchRouter({
        "/api/parameters": () => Promise.reject(new Error("parameters unavailable")),
      })
    );

    render(<FiltersHarness onDataLoaded={onDataLoaded} />);

    await waitFor(() => {
      expect(onDataLoaded).toHaveBeenCalledWith({
        rawData: [],
        infoData: {},
      });
    });
  });
});
