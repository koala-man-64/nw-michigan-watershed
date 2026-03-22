/* eslint-env jest */
import { getNoDataMessage } from "./plotEmptyState";

describe("getNoDataMessage", () => {
  it("defaults to the site-selection prompt before the user has made any selections", () => {
    expect(getNoDataMessage()).toBe("Select Sites on Map");
  });

  it("prompts the user to select sites when none are selected", () => {
    expect(
      getNoDataMessage({
        selectedSites: [],
        parameter: "Chloride",
      })
    ).toBe("Select Sites on Map");
  });

  it("prompts the user to select a parameter when sites are selected but parameter is missing", () => {
    expect(
      getNoDataMessage({
        selectedSites: ["Duck Lake"],
        parameter: "",
      })
    ).toBe("Select Parameter");
  });

  it("shows the no-data selection message when site and parameter are selected but no rows match", () => {
    expect(
      getNoDataMessage({
        selectedSites: ["Duck Lake"],
        parameter: "Chloride",
      })
    ).toBe("No Data Available for Site, Year, and Parameter Selections");
  });
});
