/* eslint-env jest */
import {
  AZURE_MAPS_AUTH_BUNDLE_STORAGE_KEY,
  getAzureMapsAuthBundle,
  isAzureMapsAuthBundleFresh,
  resetAzureMapsTokenCacheForTests,
} from "./azureMapsToken";

jest.mock("../utils/telemetry", () => ({
  trackEvent: jest.fn(),
  trackException: jest.fn(),
}));

describe("azureMapsToken", () => {
  beforeEach(() => {
    resetAzureMapsTokenCacheForTests();
  });

  test("returns cached bundles that are still fresh", async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          token: "token-1",
          clientId: "client-1",
          expiresOnUtc: "2099-01-01T00:30:00Z",
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          token: "token-2",
          clientId: "client-2",
          expiresOnUtc: "2099-01-01T00:45:00Z",
        }),
      });

    const first = await getAzureMapsAuthBundle({ fetchImpl });
    const second = await getAzureMapsAuthBundle({ fetchImpl });

    expect(first).toEqual(second);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  test("deduplicates concurrent token requests", async () => {
    let resolveFetch;
    const fetchImpl = jest.fn(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        })
    );

    const firstPromise = getAzureMapsAuthBundle({ fetchImpl });
    const secondPromise = getAzureMapsAuthBundle({ fetchImpl });

    resolveFetch({
      ok: true,
      json: async () => ({
        token: "shared-token",
        clientId: "shared-client",
        expiresOnUtc: "2099-01-01T00:30:00Z",
      }),
    });

    const [first, second] = await Promise.all([firstPromise, secondPromise]);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(first).toEqual(second);
  });

  test("reuses a fresh sessionStorage bundle across refreshes", async () => {
    window.sessionStorage.setItem(
      AZURE_MAPS_AUTH_BUNDLE_STORAGE_KEY,
      JSON.stringify({
        token: "persisted-token",
        clientId: "persisted-client",
        expiresOnUtc: "2099-01-01T00:30:00Z",
      })
    );

    await expect(getAzureMapsAuthBundle({ fetchImpl: jest.fn() })).resolves.toEqual({
      token: "persisted-token",
      clientId: "persisted-client",
      expiresOnUtc: "2099-01-01T00:30:00Z",
    });
  });

  test("detects refresh windows correctly", () => {
    expect(
      isAzureMapsAuthBundleFresh(
        {
          token: "value",
          clientId: "client",
          expiresOnUtc: "2099-01-01T01:00:00Z",
        },
        Date.parse("2099-01-01T00:40:00Z")
      )
    ).toBe(true);

    expect(
      isAzureMapsAuthBundleFresh(
        {
          token: "value",
          clientId: "client",
          expiresOnUtc: "2099-01-01T01:00:00Z",
        },
        Date.parse("2099-01-01T00:57:00Z")
      )
    ).toBe(false);
  });
});
