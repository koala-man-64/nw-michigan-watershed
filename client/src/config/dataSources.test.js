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

  it("builds static data URLs", () => {
    const { buildDataUrl } = loadModuleWithEnv();

    expect(buildDataUrl("locations.csv")).toBe("/data/locations.csv");
    expect(buildDataUrl("NWMIWS Site Data.csv")).toBe(
      "/data/NWMIWS%20Site%20Data.csv"
    );
  });

  it("uses the default cache revalidation window when env is missing", () => {
    const { DEFAULT_DATA_REVALIDATE_AFTER_MS } = loadModuleWithEnv({
      REACT_APP_PUBLIC_DATA_REVALIDATE_AFTER_MS: "",
    });

    expect(DEFAULT_DATA_REVALIDATE_AFTER_MS).toBe(86400000);
  });
});
