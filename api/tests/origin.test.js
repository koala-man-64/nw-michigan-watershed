const test = require("node:test");
const assert = require("node:assert/strict");
const { extractRequestOrigin, isOriginAllowed } = require("../src/origin");

function createHeaders(values) {
  return {
    get(name) {
      return values[String(name).toLowerCase()] || undefined;
    },
  };
}

test("extractRequestOrigin prefers the origin header", () => {
  const result = extractRequestOrigin({
    headers: createHeaders({
      origin: "https://app.example.com",
      referer: "https://fallback.example.com/page",
    }),
  });

  assert.deepEqual(result, {
    origin: "https://app.example.com",
    source: "origin",
  });
});

test("extractRequestOrigin falls back to referer origin", () => {
  const result = extractRequestOrigin({
    headers: createHeaders({
      referer: "https://app.example.com/path/to/page",
    }),
  });

  assert.deepEqual(result, {
    origin: "https://app.example.com",
    source: "referer",
  });
});

test("isOriginAllowed matches normalized origins", () => {
  assert.equal(
    isOriginAllowed("https://app.example.com/path", ["https://app.example.com"]),
    true
  );
  assert.equal(isOriginAllowed("https://other.example.com", ["https://app.example.com"]), false);
});
