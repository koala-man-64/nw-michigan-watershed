/* eslint-env jest */
import {
  WATER_QUALITY_PARAMETER_UNITS,
  formatParameterLabel,
  getCanonicalParameterName,
  getParameterUnit,
} from "../parameterMetadata";

describe("parameterMetadata", () => {
  test("defines units for each supported water quality parameter", () => {
    expect(WATER_QUALITY_PARAMETER_UNITS).toEqual({
      Chlorophyll: "ug/L",
      Chloride: "mg/L",
      Conductivity: "uS/cm",
      "Flow Rate": "cfs",
      Nitrate: "mg/L",
      "Secchi Depth": "m",
      "Total Phosphorus": "ug/L",
      "Trophic State Index": "unitless",
    });
  });

  test("normalizes known aliases to their canonical parameter names", () => {
    expect(getCanonicalParameterName(" chlorophyll-a ")).toBe("Chlorophyll");
    expect(getCanonicalParameterName("Cloride")).toBe("Chloride");
    expect(getCanonicalParameterName("TP")).toBe("Total Phosphorus");
    expect(getCanonicalParameterName("Total Phosphorous")).toBe("Total Phosphorus");
  });

  test("formats labels with units when metadata exists", () => {
    expect(getParameterUnit("Chloride")).toBe("mg/L");
    expect(formatParameterLabel("Chloride")).toBe("Chloride (mg/L)");
  });

  test("falls back to the raw parameter label when metadata is missing", () => {
    expect(getParameterUnit("Dissolved Oxygen")).toBe("");
    expect(formatParameterLabel("Dissolved Oxygen")).toBe("Dissolved Oxygen");
  });
});
