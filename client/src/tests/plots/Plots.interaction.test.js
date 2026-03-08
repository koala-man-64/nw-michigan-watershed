/* eslint-env jest */
import React from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import Plots from "../../Plots";

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
    Site: "Lake Gamma",
    Parameter: "Total Phosphorus",
    Year: "2025",
    Avg: "9.3",
    Min: "8.7",
    Max: "10.4",
    Count: "4",
  },
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

const siteLocations = [
  {
    name: "Lake Alpha",
    lat: 44.1,
    lng: -85.6,
    description: "Test lake",
    size: "10 acres",
    maxDepth: "12 ft",
    avgDepth: "8 ft",
    url: "example.com",
    href: "https://example.com",
  },
  {
    name: "Lake Gamma",
    lat: 44.2,
    lng: -85.7,
    description: "Backup lake",
    size: "20 acres",
    maxDepth: "30 ft",
    avgDepth: "15 ft",
    url: "https://example.org",
    href: "https://example.org",
  },
  {
    name: "Boardman River",
    lat: 44.3,
    lng: -85.8,
    description: "River monitoring station",
    size: "N/A",
    maxDepth: "N/A",
    avgDepth: "N/A",
    url: "",
    href: "",
  },
  {
    name: "Platte River",
    lat: 44.4,
    lng: -85.9,
    description: "Comparison river site",
    size: "N/A",
    maxDepth: "N/A",
    avgDepth: "N/A",
    url: "",
    href: "",
  },
];

describe("Plots interactions", () => {
  test("shows site navigation only for the active multi-site trend plot", async () => {
    render(
      <Plots
        plotWorkspaces={[
          {
            id: "plot-1",
            draft: {
              parameter: "Total Phosphorus",
              chartType: "trend",
              selectedSites: ["Lake Alpha", "Lake Gamma"],
              startYear: 2024,
              endYear: 2025,
            },
            applied: {
              parameter: "Total Phosphorus",
              chartType: "trend",
              selectedSites: ["Lake Alpha", "Lake Gamma"],
              startYear: 2024,
              endYear: 2025,
              trendIndex: 0,
            },
          },
          {
            id: "plot-2",
            draft: {
              parameter: "Conductivity",
              chartType: "comparison",
              selectedSites: ["Boardman River", "Platte River"],
              startYear: 2024,
              endYear: 2024,
            },
            applied: {
              parameter: "Conductivity",
              chartType: "comparison",
              selectedSites: ["Boardman River", "Platte River"],
              startYear: 2024,
              endYear: 2024,
            },
          },
        ]}
        activePlotId="plot-1"
        onSelectPlot={jest.fn()}
        onAddWorkspace={jest.fn()}
        onRemovePlot={jest.fn()}
        onUpdateAppliedPlot={jest.fn()}
        rawData={rawData}
        infoData={{}}
        siteLocations={siteLocations}
        loading={false}
      />
    );

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Previous site/i })).toBeInTheDocument()
    );
    expect(screen.getByRole("button", { name: /Next site/i })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Download raw data/i })).toHaveLength(1);
  });

  test("shows the new-plot button when there is capacity and routes tab interactions", async () => {
    const user = userEvent.setup();
    const onSelectPlot = jest.fn();
    const onAddWorkspace = jest.fn();
    const onRemovePlot = jest.fn();

    render(
      <Plots
        plotWorkspaces={[
          {
            id: "plot-1",
            draft: {
              parameter: "Conductivity",
              chartType: "comparison",
              selectedSites: ["Boardman River", "Platte River"],
              startYear: 2024,
              endYear: 2024,
            },
            applied: {
              parameter: "Conductivity",
              chartType: "comparison",
              selectedSites: ["Boardman River", "Platte River"],
              startYear: 2024,
              endYear: 2024,
            },
          },
        ]}
        activePlotId="plot-1"
        onSelectPlot={onSelectPlot}
        onAddWorkspace={onAddWorkspace}
        onRemovePlot={onRemovePlot}
        onUpdateAppliedPlot={jest.fn()}
        rawData={rawData}
        infoData={{}}
        siteLocations={siteLocations}
        loading={false}
      />
    );

    await user.click(screen.getByRole("button", { name: /New Plot/i }));
    await user.click(screen.getByRole("button", { name: /Remove Conductivity/i }));

    expect(onAddWorkspace).toHaveBeenCalledTimes(1);
    expect(onRemovePlot).toHaveBeenCalledWith("plot-1");
  });

  test("shows a save-as-new button for dirty saved plots and invokes it", async () => {
    const user = userEvent.setup();
    const onSaveAsNewPlot = jest.fn();

    render(
      <Plots
        plotWorkspaces={[
          {
            id: "plot-1",
            draft: {
              parameter: "Chloride (mg/L)",
              chartType: "comparison",
              selectedSites: ["Boardman River", "Platte River"],
              startYear: 2023,
              endYear: 2024,
            },
            applied: {
              parameter: "Conductivity",
              chartType: "comparison",
              selectedSites: ["Boardman River", "Platte River"],
              startYear: 2024,
              endYear: 2024,
            },
          },
        ]}
        activePlotId="plot-1"
        onSelectPlot={jest.fn()}
        onAddWorkspace={jest.fn()}
        onRemovePlot={jest.fn()}
        onUpdateAppliedPlot={jest.fn()}
        onSavePlot={jest.fn()}
        onSaveAsNewPlot={onSaveAsNewPlot}
        showSaveAction
        showSaveAsNewAction
        rawData={rawData}
        infoData={{}}
        siteLocations={siteLocations}
        loading={false}
      />
    );

    await user.click(screen.getByRole("button", { name: /Save changes as a new plot/i }));

    expect(onSaveAsNewPlot).toHaveBeenCalledTimes(1);
  });

  test("downloads only the filtered rows for the active plot", async () => {
    const user = userEvent.setup();
    const clickSpy = jest
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});
    const revokeSpy = jest
      .spyOn(URL, "revokeObjectURL")
      .mockImplementation(() => {});
    let capturedBlob;
    const createSpy = jest
      .spyOn(URL, "createObjectURL")
      .mockImplementation((blob) => {
        capturedBlob = blob;
        return "blob:download";
      });

    try {
      render(
        <Plots
          plotWorkspaces={[
            {
              id: "plot-1",
              draft: {
                parameter: "Conductivity",
                chartType: "comparison",
                selectedSites: ["Boardman River", "Platte River"],
                startYear: 2024,
                endYear: 2024,
              },
              applied: {
                parameter: "Conductivity",
                chartType: "comparison",
                selectedSites: ["Boardman River", "Platte River"],
                startYear: 2024,
                endYear: 2024,
              },
            },
          ]}
          activePlotId="plot-1"
          onSelectPlot={jest.fn()}
          onAddWorkspace={jest.fn()}
          onRemovePlot={jest.fn()}
          onUpdateAppliedPlot={jest.fn()}
          rawData={rawData}
          infoData={{}}
          siteLocations={siteLocations}
          loading={false}
        />
      );

      await user.click(screen.getByRole("button", { name: /Download raw data/i }));

      expect(clickSpy).toHaveBeenCalled();
      const csvText = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsText(capturedBlob);
      });
      expect(csvText).toContain("Boardman River");
      expect(csvText).toContain("Platte River");
      expect(csvText).not.toContain("Lake Alpha");
    } finally {
      createSpy.mockRestore();
      revokeSpy.mockRestore();
      clickSpy.mockRestore();
    }
  });

  test("shows fallback parameter information when metadata is missing", async () => {
    const user = userEvent.setup();
    render(
      <Plots
        plotWorkspaces={[
          {
            id: "plot-1",
            draft: {
              parameter: "Conductivity",
              chartType: "comparison",
              selectedSites: ["Boardman River", "Platte River"],
              startYear: 2024,
              endYear: 2024,
            },
            applied: {
              parameter: "Conductivity",
              chartType: "comparison",
              selectedSites: ["Boardman River", "Platte River"],
              startYear: 2024,
              endYear: 2024,
            },
          },
        ]}
        activePlotId="plot-1"
        onSelectPlot={jest.fn()}
        onAddWorkspace={jest.fn()}
        onRemovePlot={jest.fn()}
        onUpdateAppliedPlot={jest.fn()}
        rawData={rawData}
        infoData={{}}
        siteLocations={siteLocations}
        loading={false}
      />
    );

    await user.click(screen.getByRole("button", { name: /Parameter information/i }));

    expect(
      await screen.findByRole("dialog", { name: /Parameter Information/i })
    ).toHaveTextContent("No parameter information available.");
  });

  test("shows mapped site details and chart metrics above a trend plot", async () => {
    render(
      <Plots
        plotWorkspaces={[
          {
            id: "plot-1",
            draft: {
              parameter: "Total Phosphorus",
              chartType: "trend",
              selectedSites: ["Lake Alpha"],
              startYear: 2024,
              endYear: 2025,
            },
            applied: {
              parameter: "Total Phosphorus",
              chartType: "trend",
              selectedSites: ["Lake Alpha"],
              startYear: 2024,
              endYear: 2025,
            },
          },
        ]}
        activePlotId="plot-1"
        onSelectPlot={jest.fn()}
        onAddWorkspace={jest.fn()}
        onRemovePlot={jest.fn()}
        onUpdateAppliedPlot={jest.fn()}
        rawData={rawData}
        infoData={{}}
        siteLocations={siteLocations}
        loading={false}
      />
    );

    expect(await screen.findByText("Map location")).toBeInTheDocument();
    expect(screen.getByText("Lake Alpha")).toBeInTheDocument();
    expect(screen.getByText("Test lake")).toBeInTheDocument();
    expect(screen.getByText("10 acres")).toBeInTheDocument();
    expect(screen.getByText("12 ft")).toBeInTheDocument();
    expect(screen.getByText("8 ft")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "example.com" })).toHaveAttribute(
      "href",
      "https://example.com"
    );

    expect(screen.getByText("Displayed data")).toBeInTheDocument();
    expect(
      within(screen.getByLabelText(/Plot summary/i)).queryByText("Total Phosphorus (ug/L)")
    ).not.toBeInTheDocument();
    expect(screen.getByText("Field samples")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.getByText("Observed range")).toBeInTheDocument();
    expect(screen.getByText("9.7 to 15.1 ug/L")).toBeInTheDocument();
  });
});
