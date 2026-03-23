const fs = require("node:fs");
const path = require("node:path");

const FIXTURES_DIR = __dirname;

function normalizeFixtureName(name) {
  return String(name || "").trim().replace(/\\/g, "/").replace(/^\//, "");
}

function fixturePath(name) {
  const normalizedName = normalizeFixtureName(name);
  if (!normalizedName) {
    throw new Error("Fixture name is required.");
  }

  return path.join(FIXTURES_DIR, normalizedName);
}

function readTextFixture(name) {
  return fs.readFileSync(fixturePath(name), "utf8");
}

function readJsonFixture(name) {
  return JSON.parse(readTextFixture(name));
}

module.exports = {
  fixturePath,
  readJsonFixture,
  readTextFixture,
};
