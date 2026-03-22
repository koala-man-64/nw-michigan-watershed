/* eslint-env jest */

async function loadModuleWithEnv(overrides = {}) {
  vi.resetModules();
  const processRef = globalThis.process;
  const previousEnv = processRef.env;
  processRef.env = { ...previousEnv, ...overrides };
  const module = await import("./dataSources");
  processRef.env = previousEnv;
  return module;
}

describe("dataSources", () => {
  afterEach(() => {
    vi.resetModules();
  });

  it("builds static data URLs", async () => {
    const { buildDataUrl } = await loadModuleWithEnv();

    expect(buildDataUrl("locations.csv")).toBe("/data/locations.csv");
    expect(buildDataUrl("NWMIWS Site Data.csv")).toBe(
      "/data/NWMIWS%20Site%20Data.csv"
    );
  });

  it("uses the default cache revalidation window when env is missing", async () => {
    const { DEFAULT_DATA_REVALIDATE_AFTER_MS } = await loadModuleWithEnv({
      REACT_APP_PUBLIC_DATA_REVALIDATE_AFTER_MS: "",
    });

    expect(DEFAULT_DATA_REVALIDATE_AFTER_MS).toBe(86400000);
  });
});
