/* eslint-env jest */
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import App from "../App";

jest.mock("../FiltersPanel", () => function MockFiltersPanel() {
  return <div data-testid="filters-panel">Filters Panel</div>;
});

jest.mock("../MapPanel", () => function MockMapPanel() {
  return <div data-testid="map-panel">Map Panel</div>;
});

jest.mock("../Plots", () => function MockPlots() {
  return <div data-testid="plots-panel">Plots Panel</div>;
});

describe("App", () => {
  beforeEach(() => {
    window.history.pushState({}, "", "/");
  });

  test("renders the application shell and welcome content", () => {
    render(<App />);

    expect(
      screen.getByText(/Northwest Michigan Watershed Coalition/i)
    ).toBeInTheDocument();
    expect(screen.getByTestId("filters-panel")).toBeInTheDocument();
    expect(screen.getByTestId("map-panel")).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /Chat with Rudy/i })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Exit/i })
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(/Welcome to the NW Michigan Water Quality Database/i)
    ).toBeInTheDocument();
  });

  test("shows the plots panel after continuing from the welcome view", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /Continue/i }));

    expect(screen.getByTestId("plots-panel")).toBeInTheDocument();
  });

  test("redirects the retired chat route back to the home experience", () => {
    window.history.pushState({}, "", "/chat-rudy");

    render(<App />);

    expect(
      screen.getByText(/Welcome to the NW Michigan Water Quality Database/i)
    ).toBeInTheDocument();
  });
});
