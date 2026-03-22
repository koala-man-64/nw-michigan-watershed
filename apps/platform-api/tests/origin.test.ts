import assert from "node:assert/strict";
import test from "node:test";
import { extractRequestOrigin, getHeader, isOriginAllowed, normalizeOrigin } from "../src/origin";

test("normalizeOrigin returns only the origin portion", () => {
  assert.equal(normalizeOrigin("https://example.org/path?q=1"), "https://example.org");
  assert.equal(normalizeOrigin("invalid"), null);
});

test("getHeader supports plain objects and fetch-style headers", () => {
  assert.equal(getHeader({ origin: "https://example.org" }, "Origin"), "https://example.org");
  assert.equal(
    getHeader(
      {
        get(name: string) {
          return name.toLowerCase() === "origin" ? "https://example.org" : undefined;
        },
      },
      "origin"
    ),
    "https://example.org"
  );
});

test("extractRequestOrigin falls back from origin to referer", () => {
  assert.deepEqual(
    extractRequestOrigin({
      headers: {
        referer: "https://example.org/path",
      },
    }),
    {
      origin: "https://example.org",
      source: "referer",
    }
  );
});

test("isOriginAllowed matches normalized origins", () => {
  assert.equal(isOriginAllowed("https://example.org/path", ["https://example.org"]), true);
  assert.equal(isOriginAllowed("https://denied.example.org", ["https://example.org"]), false);
});
