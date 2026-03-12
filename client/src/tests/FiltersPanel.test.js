/* eslint-env jest */
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { rest } from "msw";

import FiltersPanel from "../FiltersPanel";
import { server } from "../test/msw/server";
import { dataCsv, infoCsv } from "../test/msw/fixtures";

jest.mock("../SearchableMultiselect.jsx", () => ({
  __esModule: true,
  default: ({ label, options, selected, onChange }) => (
    <div>
      <div>{label}</div>
      <div data-testid="site-options">{options.join(",")}</div>
      <div data-testid="selected-sites">{selected.join(",")}</div>
      <button type="button" onClick={() => onChange(["Lake Alpha"])}>
        Select Lake Alpha
      </button>
    </div>
  ),
}));

const baseFilters = {
  selectedSites: [],
  parameter: "",
  startYear: 2024,
  endYear: 2025,
  chartType: "trend",
};

describe("FiltersPanel", () => {
  test("loads CSV data and sends parsed info plus year bounds upstream", async () => {
    const onDataLoaded = jest.fn();
    const { container } = render(
      <FiltersPanel
        filters={baseFilters}
        onFiltersChange={jest.fn()}
        onDataLoaded={onDataLoaded}
        updateEnabled
      />
    );

    await waitFor(() => expect(onDataLoaded).toHaveBeenCalled());

    const selects = container.querySelectorAll("select");
    expect(selects[0]).toHaveValue("2024");
    expect(selects[1]).toHaveValue("2025");
    expect(screen.getByRole("option", { name: "Conductivity (uS/cm)" })).toBeInTheDocument();

    const payload = onDataLoaded.mock.calls.at(-1)[0];
    expect(payload.rawData).toHaveLength(5);
    expect(payload.infoData["Total Phosphorus"].ContactInfo).toBe("Call Alice");
    expect(payload.yearBounds).toEqual({ min: 2024, max: 2025 });
    expect(payload.catalog).toEqual({
      sites: ["Boardman River", "Lake Alpha", "Lake Gamma", "Platte River"],
      parameters: ["Conductivity", "Total Phosphorus"],
      yearBounds: { min: 2024, max: 2025 },
    });
  });

  test("keeps loading when info.csv fails and sends empty metadata", async () => {
    server.use(
      rest.get("/api/read-csv", (req, res, ctx) => {
        const blob = req.url.searchParams.get("blob");
        if (blob === "NWMIWS_Site_Data_testing_varied.csv") {
          return res(ctx.status(200), ctx.body(dataCsv));
        }
        if (blob === "info.csv") {
          return res(ctx.status(500), ctx.json({ error: "info unavailable" }));
        }
        return res(ctx.status(404));
      })
    );

    const onDataLoaded = jest.fn();
    render(
      <FiltersPanel
        filters={baseFilters}
        onFiltersChange={jest.fn()}
        onDataLoaded={onDataLoaded}
        updateEnabled
      />
    );

    await waitFor(() => expect(onDataLoaded).toHaveBeenCalled());

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(onDataLoaded.mock.calls.at(-1)[0]).toEqual({
      rawData: expect.any(Array),
      infoData: {},
      yearBounds: { min: 2024, max: 2025 },
      catalog: {
        sites: ["Boardman River", "Lake Alpha", "Lake Gamma", "Platte River"],
        parameters: ["Conductivity", "Total Phosphorus"],
        yearBounds: { min: 2024, max: 2025 },
      },
    });
  });

  test("shows an alert and clears loaded data when the main CSV fails", async () => {
    server.use(
      rest.get("/api/read-csv", (req, res, ctx) => {
        const blob = req.url.searchParams.get("blob");
        if (blob === "NWMIWS_Site_Data_testing_varied.csv") {
          return res(ctx.status(500), ctx.json({ error: "down" }));
        }
        if (blob === "info.csv") {
          return res(ctx.status(200), ctx.body(infoCsv));
        }
        return res(ctx.status(404));
      })
    );

    const onDataLoaded = jest.fn();
    render(
      <FiltersPanel
        filters={baseFilters}
        onFiltersChange={jest.fn()}
        onDataLoaded={onDataLoaded}
        updateEnabled
      />
    );

    expect(await screen.findByRole("alert", { name: "" })).toHaveTextContent(
      "Unable to load water quality data right now."
    );
    expect(onDataLoaded.mock.calls.at(-1)[0]).toEqual({
      rawData: [],
      infoData: {},
      yearBounds: null,
      catalog: {
        sites: [],
        parameters: [],
        yearBounds: null,
      },
    });
  });

  test("propagates user-driven filter changes without rendering a local apply action", async () => {
    const user = userEvent.setup();
    const onFiltersChange = jest.fn();
    const { container } = render(
      <FiltersPanel
        filters={baseFilters}
        onFiltersChange={onFiltersChange}
        onDataLoaded={jest.fn()}
        updateEnabled
      />
    );

    await waitFor(() => expect(screen.getByTestId("site-options")).toHaveTextContent("Lake Alpha"));

    await user.click(screen.getByRole("button", { name: /Select Lake Alpha/i }));
    const selects = container.querySelectorAll("select");
    await user.selectOptions(selects[0], "2025");
    await user.selectOptions(selects[1], "2025");
    await user.selectOptions(selects[2], "Conductivity");
    await user.selectOptions(selects[3], "comparison");

    expect(onFiltersChange).toHaveBeenCalledWith({ selectedSites: ["Lake Alpha"] });
    expect(onFiltersChange).toHaveBeenCalledWith({ startYear: 2025, endYear: 2025 });
    expect(onFiltersChange).toHaveBeenCalledWith({ parameter: "Conductivity" });
    expect(onFiltersChange).toHaveBeenCalledWith({ chartType: "comparison" });
    expect(screen.queryByRole("button", { name: /Save/i })).not.toBeInTheDocument();
  });
});
