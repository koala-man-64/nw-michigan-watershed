/* eslint-env jest */
/* eslint-disable react/prop-types */
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import App from "./App";

jest.mock("./FiltersPanel", () => {
  const React = require("react");

  return function MockFiltersPanel({ updateEnabled }) {
    return (
      <div data-testid="filters-panel-state">
        {updateEnabled ? "enabled" : "disabled"}
      </div>
    );
  };
});

jest.mock("./MapPanel", () => {
  const React = require("react");
  return function MockMapPanel() {
    return <div data-testid="map-panel" />;
  };
});

jest.mock("./Plots", () => {
  const React = require("react");
  return function MockPlots() {
    return <div>plots view</div>;
  };
});

test("clicking the header title returns the user to the welcome entry state", () => {
  const consoleWarnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

  render(<App />);

  expect(screen.getByText(/welcome to the nw michigan water quality database/i)).toBeInTheDocument();
  expect(screen.getByTestId("filters-panel-state")).toHaveTextContent("disabled");

  fireEvent.click(screen.getByRole("button", { name: /continue/i }));

  expect(screen.queryByText(/welcome to the nw michigan water quality database/i)).not.toBeInTheDocument();
  expect(screen.getByText(/plots view/i)).toBeInTheDocument();
  expect(screen.getByTestId("filters-panel-state")).toHaveTextContent("enabled");

  fireEvent.click(screen.getByRole("link", { name: /home/i }));

  expect(screen.getByText(/welcome to the nw michigan water quality database/i)).toBeInTheDocument();
  expect(screen.queryByText(/plots view/i)).not.toBeInTheDocument();
  expect(screen.getByTestId("filters-panel-state")).toHaveTextContent("disabled");

  consoleWarnSpy.mockRestore();
});

test("clicking the back button returns the user to the welcome entry state", () => {
  const consoleWarnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

  render(<App />);

  fireEvent.click(screen.getByRole("button", { name: /continue/i }));

  expect(screen.getByText(/plots view/i)).toBeInTheDocument();
  expect(screen.getByTestId("filters-panel-state")).toHaveTextContent("enabled");

  fireEvent.click(screen.getByRole("button", { name: /^back$/i }));

  expect(screen.getByText(/welcome to the nw michigan water quality database/i)).toBeInTheDocument();
  expect(screen.queryByText(/plots view/i)).not.toBeInTheDocument();
  expect(screen.getByTestId("filters-panel-state")).toHaveTextContent("disabled");

  consoleWarnSpy.mockRestore();
});
