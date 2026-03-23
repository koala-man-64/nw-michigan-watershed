import assert from "node:assert/strict";
import test, { afterEach, beforeEach } from "node:test";
import {
  createAdminBootstrapHandler,
  createPortalBootstrapHandler,
} from "../src/runtime/handlers";
import {
  cleanupRuntimeFixture,
  createAzureMapsConfig,
  createRuntimeFixture,
  readJsonFixture,
  writeFixtureState,
} from "./testSupport";

let fixture = createRuntimeFixture();

beforeEach(() => {
  fixture = createRuntimeFixture();
  writeFixtureState(fixture.runtimeConfig);
});

afterEach(() => {
  cleanupRuntimeFixture(fixture);
});

test("portal bootstrap matches the canonical fixture payload", async () => {
  const response = await createPortalBootstrapHandler({
    runtimeConfig: fixture.runtimeConfig,
    getAzureMapsConfig: () => createAzureMapsConfig(),
  })();

  assert.equal(response.status, 200);
  assert.deepEqual(
    JSON.parse(JSON.stringify(response.jsonBody)),
    readJsonFixture("portal-bootstrap.json")
  );
});

test("admin bootstrap matches the canonical fixture payload", async () => {
  const response = await createAdminBootstrapHandler({
    runtimeConfig: fixture.runtimeConfig,
    getAzureMapsConfig: () => createAzureMapsConfig(),
  })();

  assert.equal(response.status, 200);
  assert.deepEqual(
    JSON.parse(JSON.stringify(response.jsonBody)),
    readJsonFixture("admin-bootstrap.json")
  );
});
