/* eslint-env jest */
jest.mock("./telemetry", () => ({
  trackException: jest.fn(),
}));

import { waitFor } from "@testing-library/react";
import { fetchCachedCsvText, readCachedCsvText } from "./csvCache";
import { trackException } from "./telemetry";

function createResponse({ status = 200, text = "", headers = {} } = {}) {
  const normalizedHeaders = Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value])
  );

  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => text,
    headers: {
      get: (name) => normalizedHeaders[name.toLowerCase()] ?? null,
    },
  };
}

describe("fetchCachedCsvText", () => {
  const url = "/data/locations.csv";

  beforeEach(() => {
    jest.clearAllMocks();
    window.localStorage.clear();
    window.fetch = jest.fn();
    jest.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("stores the initial response and revalidates stale requests with the cached etag", async () => {
    window.fetch.mockResolvedValueOnce(
      createResponse({
        status: 200,
        text: "Site,Latitude\nDuck Lake,44.1",
        headers: {
          ETag: '"etag-1"',
          "Last-Modified": "Wed, 11 Mar 2026 12:00:00 GMT",
        },
      })
    );

    await expect(fetchCachedCsvText(url)).resolves.toBe(
      "Site,Latitude\nDuck Lake,44.1"
    );
    expect(readCachedCsvText(url)).toBe("Site,Latitude\nDuck Lake,44.1");

    window.fetch.mockResolvedValueOnce(createResponse({ status: 304 }));

    await expect(fetchCachedCsvText(url, { revalidateAfterMs: 0 })).resolves.toBe(
      "Site,Latitude\nDuck Lake,44.1"
    );
    expect(window.fetch).toHaveBeenLastCalledWith(
      url,
      expect.objectContaining({
        cache: "no-cache",
        headers: expect.objectContaining({
          "If-None-Match": '"etag-1"',
          "If-Modified-Since": "Wed, 11 Mar 2026 12:00:00 GMT",
        }),
      })
    );
  });

  it("returns cached text immediately and publishes refreshed text when the file changes", async () => {
    window.fetch.mockResolvedValueOnce(
      createResponse({
        status: 200,
        text: "Site,Latitude\nDuck Lake,44.1",
        headers: { ETag: '"etag-1"' },
      })
    );
    await fetchCachedCsvText(url);

    const onFreshText = jest.fn();
    window.fetch.mockResolvedValueOnce(
      createResponse({
        status: 200,
        text: "Site,Latitude\nDuck Lake,44.2",
        headers: { ETag: '"etag-2"' },
      })
    );

    await expect(
      fetchCachedCsvText(url, { onFreshText, revalidateAfterMs: 0 })
    ).resolves.toBe("Site,Latitude\nDuck Lake,44.1");

    await waitFor(() =>
      expect(onFreshText).toHaveBeenCalledWith("Site,Latitude\nDuck Lake,44.2")
    );
    expect(readCachedCsvText(url)).toBe("Site,Latitude\nDuck Lake,44.2");
  });

  it("falls back to cached text when revalidation fails", async () => {
    window.fetch.mockResolvedValueOnce(
      createResponse({
        status: 200,
        text: "Site,Latitude\nDuck Lake,44.1",
        headers: { ETag: '"etag-1"' },
      })
    );
    await fetchCachedCsvText(url);

    window.fetch.mockRejectedValueOnce(new Error("network down"));

    await expect(fetchCachedCsvText(url, { revalidateAfterMs: 0 })).resolves.toBe(
      "Site,Latitude\nDuck Lake,44.1"
    );
    await waitFor(() => expect(console.warn).toHaveBeenCalled());
    expect(trackException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        url,
        dataSource: "static",
        blobName: "locations.csv",
        cacheHit: true,
        cachedFallback: true,
      })
    );
  });

  it("returns fresh cached text without revalidating", async () => {
    window.fetch.mockResolvedValueOnce(
      createResponse({
        status: 200,
        text: "Site,Latitude\nDuck Lake,44.1",
        headers: { ETag: '"etag-1"' },
      })
    );
    await fetchCachedCsvText(url);

    await expect(fetchCachedCsvText(url)).resolves.toBe(
      "Site,Latitude\nDuck Lake,44.1"
    );

    expect(window.fetch).toHaveBeenCalledTimes(1);
  });

  it("emits static data telemetry properties on failures", async () => {
    window.fetch.mockRejectedValueOnce(new Error("network down"));

    await expect(fetchCachedCsvText(url)).rejects.toThrow("network down");

    expect(trackException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        url,
        dataSource: "static",
        blobName: "locations.csv",
        cacheHit: false,
        cachedFallback: false,
      })
    );
  });
});
