/* eslint-env jest */

function loadModuleWithEnv(overrides = {}) {
  jest.resetModules();
  const processRef = globalThis.process;
  const previousEnv = processRef.env;
  processRef.env = { ...previousEnv, ...overrides };
  const module = require("./dataSources");
  processRef.env = previousEnv;
  return module;
}

describe("dataSources", () => {
  afterEach(() => {
    jest.resetModules();
  });

  it("builds read-csv API URLs by default", () => {
    const { buildReadCsvUrl, buildDataUrl } = loadModuleWithEnv({
      REACT_APP_PUBLIC_DATA_BASE_URL: "",
    });

    expect(buildReadCsvUrl("locations.csv")).toBe(
      "/api/read-csv?blob=locations.csv&format=csv"
    );
    expect(buildDataUrl("locations.csv")).toBe(
      "/api/read-csv?blob=locations.csv&format=csv"
    );
  });

  it("builds direct blob URLs when a public base URL is configured", () => {
    const { buildDataUrl, PUBLIC_DATA_BASE_URL } = loadModuleWithEnv({
      REACT_APP_PUBLIC_DATA_BASE_URL: "https://example.blob.core.windows.net/nwmiws/",
    });

    expect(PUBLIC_DATA_BASE_URL).toBe("https://example.blob.core.windows.net/nwmiws");
    expect(buildDataUrl("NWMIWS Site Data.csv")).toBe(
      "https://example.blob.core.windows.net/nwmiws/NWMIWS%20Site%20Data.csv"
    );
  });

  it("falls back to API URL for non-csv formats", () => {
    const { buildDataUrl } = loadModuleWithEnv({
      REACT_APP_PUBLIC_DATA_BASE_URL: "https://example.blob.core.windows.net/nwmiws",
    });

    expect(buildDataUrl("locations.csv", "json")).toBe(
      "/api/read-csv?blob=locations.csv&format=json"
    );
  });

  it("uses the default cache revalidation window when env is missing", () => {
    const { DEFAULT_DATA_REVALIDATE_AFTER_MS } = loadModuleWithEnv({
      REACT_APP_PUBLIC_DATA_REVALIDATE_AFTER_MS: "",
    });

    expect(DEFAULT_DATA_REVALIDATE_AFTER_MS).toBe(3600000);
  });
});
