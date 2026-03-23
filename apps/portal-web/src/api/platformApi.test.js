const fixtureSupport = require("../../../../test-support/fixtures/index.cjs");

import {
  fetchMeasurements,
  fetchParameters,
  fetchPortalBootstrap,
  fetchSites,
} from "./platformApi";

function createJsonResponse(body, init = {}) {
  const status = init.status ?? 200;
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

describe("platformApi", () => {
  it("unwraps list payloads from portal API responses", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(createJsonResponse(fixtureSupport.readJsonFixture("sites.json")))
      .mockResolvedValueOnce(createJsonResponse(fixtureSupport.readJsonFixture("parameters.json")))
      .mockResolvedValueOnce(createJsonResponse(fixtureSupport.readJsonFixture("measurements.json")));

    const [sites, parameters, measurements] = await Promise.all([
      fetchSites("/api/sites", fetchImpl),
      fetchParameters("/api/parameters", fetchImpl),
      fetchMeasurements("/api/measurements", fetchImpl),
    ]);

    expect(sites).toHaveLength(3);
    expect(parameters).toHaveLength(3);
    expect(measurements).toHaveLength(4);
  });

  it("returns object payloads unchanged for bootstrap requests", async () => {
    const bootstrapFixture = fixtureSupport.readJsonFixture("portal-bootstrap.json");
    const fetchImpl = vi.fn().mockResolvedValue(createJsonResponse(bootstrapFixture));

    const bootstrap = await fetchPortalBootstrap("/api/portal/bootstrap", fetchImpl);

    expect(bootstrap).toEqual(bootstrapFixture);
  });

  it("surfaces non-ok responses with the resource name", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      createJsonResponse({ error: "service unavailable" }, { status: 503 })
    );

    await expect(fetchSites("/api/sites", fetchImpl)).rejects.toMatchObject({
      message: "sites request failed with 503.",
    });
  });

  it("fails fast when fetch is unavailable", async () => {
    await expect(fetchPortalBootstrap("/api/portal/bootstrap", null)).rejects.toMatchObject({
      message: "Fetch API is unavailable for portal bootstrap.",
    });
  });
});
