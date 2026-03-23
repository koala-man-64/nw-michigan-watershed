import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import test, { afterEach, beforeEach } from "node:test";
import {
  createEmptyPublishedRelease,
} from "../src/runtime/contractDefaults";
import {
  PlatformStateUnavailableError,
  createAuditEvent,
  getActiveRelease,
  isPlatformStateUnavailableError,
  loadState,
  updateState,
} from "../src/runtime/stateStore";
import {
  cleanupRuntimeFixture,
  createRuntimeFixture,
} from "./testSupport";

let fixture = createRuntimeFixture();

beforeEach(() => {
  fixture = createRuntimeFixture();
});

afterEach(() => {
  cleanupRuntimeFixture(fixture);
});

test("loadState seeds the state file when it is missing", () => {
  const state = loadState(fixture.runtimeConfig);

  assert.equal(state.customerManifest.customerId, "nwmiws");
  assert.equal(state.activeReleaseId, "release-seed-current");
});

test("loadState throws a typed error when the state file is empty", () => {
  writeFileSync(fixture.runtimeConfig.stateFilePath, "", "utf8");

  assert.throws(
    () => loadState(fixture.runtimeConfig),
    (error) =>
      isPlatformStateUnavailableError(error) &&
      error.reason === "empty" &&
      error.stateFilePath === fixture.runtimeConfig.stateFilePath
  );
});

test("loadState throws a typed error when the state file is malformed", () => {
  writeFileSync(fixture.runtimeConfig.stateFilePath, "{bad-json", "utf8");

  assert.throws(
    () => loadState(fixture.runtimeConfig),
    (error) =>
      error instanceof PlatformStateUnavailableError &&
      error.reason === "malformed"
  );
});

test("getActiveRelease falls back to the release marked active", () => {
  const fallbackRelease = {
    ...createEmptyPublishedRelease(),
    releaseId: "release-fallback",
    datasetVersionId: "dataset-version-fallback",
    status: "active" as const,
  };

  const release = getActiveRelease({
    customerManifest: loadState(fixture.runtimeConfig).customerManifest,
    customerProfile: loadState(fixture.runtimeConfig).customerProfile,
    datasetManifest: loadState(fixture.runtimeConfig).datasetManifest,
    datasetVersions: [],
    publishedReleases: [fallbackRelease],
    auditEvents: [],
    activeReleaseId: "missing-release-id",
  });

  assert.equal(release.releaseId, "release-fallback");
});

test("updateState serializes concurrent writes against the same state file", async () => {
  await loadState(fixture.runtimeConfig);

  await Promise.all([
    updateState(async (state) => {
      await new Promise((resolve) => setTimeout(resolve, 30));
      return {
        ...state,
        customerProfile: {
          ...state.customerProfile,
          displayName: "Updated display name",
        },
        auditEvents: state.auditEvents.concat(
          createAuditEvent({
            eventType: "profile.updated",
            actor: "tester",
            customerId: state.customerManifest.customerId,
          })
        ),
      };
    }, fixture.runtimeConfig),
    updateState(async (state) => ({
      ...state,
      customerProfile: {
        ...state.customerProfile,
        organization: "Updated organization",
      },
    }), fixture.runtimeConfig),
  ]);

  const state = loadState(fixture.runtimeConfig);
  assert.equal(state.customerProfile.displayName, "Updated display name");
  assert.equal(state.customerProfile.organization, "Updated organization");
});
