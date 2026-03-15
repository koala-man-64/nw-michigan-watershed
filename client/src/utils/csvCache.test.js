/* eslint-env jest */
jest.mock("./telemetry", () => ({
  trackEvent: jest.fn(),
  trackException: jest.fn(),
}));

import { waitFor } from "@testing-library/react";
import { fetchCachedCsvText, readCachedCsvText } from "./csvCache";
import { trackEvent, trackException } from "./telemetry";

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
  const url = "/api/read-csv?blob=locations.csv&format=csv";

  beforeEach(() => {
    window.localStorage.clear();
    window.fetch = jest.fn();
    jest.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("stores the initial response and revalidates later requests with the cached etag", async () => {
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

    await expect(fetchCachedCsvText(url)).resolves.toBe(
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

  it("returns cached text immediately and publishes refreshed text when the blob changes", async () => {
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

    await expect(fetchCachedCsvText(url, { onFreshText })).resolves.toBe(
      "Site,Latitude\nDuck Lake,44.1"
    );

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

    await expect(fetchCachedCsvText(url)).resolves.toBe(
      "Site,Latitude\nDuck Lake,44.1"
    );
    await waitFor(() => expect(console.warn).toHaveBeenCalled());
    expect(trackEvent).toHaveBeenCalledWith(
      "read_csv_fetch_failed",
      expect.objectContaining({
        url,
        cachedFallback: true,
      })
    );
    expect(trackException).toHaveBeenCalled();
  });
});
