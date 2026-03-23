const fixtureSupport = require("../../../../test-support/fixtures/index.cjs");

async function loadModuleWithEnv(overrides = {}) {
  vi.resetModules();
  for (const [name, value] of Object.entries(overrides)) {
    vi.stubEnv(name, value);
  }
  return import("./runtimeConfig");
}

function createJsonResponse(body, init = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
    },
    ...init,
  });
}

describe("runtimeConfig", () => {
  afterEach(async () => {
    const module = await import("./runtimeConfig");
    module.resetRuntimeConfigForTests();
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("normalizes bootstrap payloads into the runtime config shape", async () => {
    const { normalizeRuntimeConfig } = await loadModuleWithEnv();
    const config = normalizeRuntimeConfig(fixtureSupport.readJsonFixture("portal-bootstrap.json"));

    expect(config.appTitle).toBe("NW Michigan Water Quality Database");
    expect(config.supportContact.email).toBe("john@benziecd.org");
    expect(config.featureFlags.adminEnabled).toBe(true);
    expect(config.featureFlags.privatePortal).toBe(false);
    expect(config.map.tilesetId).toBe("microsoft.base.road");
    expect(config.customerManifest.customerId).toBe("nwmiws");
  });

  it("loads bootstrap config once and reuses the cached result until reset", async () => {
    const module = await loadModuleWithEnv();
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(createJsonResponse(fixtureSupport.readJsonFixture("portal-bootstrap.json")));

    const first = await module.loadRuntimeConfig(fetchImpl);
    const second = await module.loadRuntimeConfig(fetchImpl);

    expect(first.source).toBe("bootstrap");
    expect(second.source).toBe("bootstrap");
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    module.resetRuntimeConfigForTests();
    await module.loadRuntimeConfig(fetchImpl);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("falls back to env-provided telemetry when bootstrap returns a non-ok response", async () => {
    const module = await loadModuleWithEnv({
      VITE_APPLICATIONINSIGHTS_CONNECTION_STRING: "InstrumentationKey=fallback-key",
    });
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response("unavailable", {
        status: 503,
      })
    );

    const result = await module.loadRuntimeConfig(fetchImpl);

    expect(result.source).toBe("fallback");
    expect(result.config.telemetry.connectionString).toBe("InstrumentationKey=fallback-key");
    expect(result.error).toBeInstanceOf(Error);
  });

  it("falls back when the bootstrap request times out", async () => {
    vi.useFakeTimers();
    const module = await loadModuleWithEnv();
    const fetchImpl = vi.fn((url, options) => {
      return new Promise((resolve, reject) => {
        options.signal?.addEventListener("abort", () => {
          reject(new DOMException("The operation was aborted.", "AbortError"));
        });
      });
    });

    const promise = module.loadRuntimeConfig(fetchImpl);
    await vi.advanceTimersByTimeAsync(3000);
    const result = await promise;

    expect(result.source).toBe("fallback");
    expect(result.error?.name).toBe("AbortError");
  });

  it("returns the default fallback config when fetch is unavailable", async () => {
    const module = await loadModuleWithEnv();

    const result = await module.loadRuntimeConfig(null);

    expect(result.source).toBe("fallback");
    expect(result.config.appTitle).toBe("NW Michigan Water Quality Database");
  });
});
