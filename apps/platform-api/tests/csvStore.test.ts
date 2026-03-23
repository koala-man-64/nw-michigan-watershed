import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { getPlatformRuntimeConfig } from "../src/config";
import {
  exportArtifactAsCsv,
  loadMeasurements,
  loadParameters,
  loadSites,
} from "../src/runtime/csvStore";

function createSourceDataDir(bundle: {
  locationsCsv?: string;
  infoCsv?: string;
  measurementsCsv?: string;
}) {
  const rootDir = path.join(
    os.tmpdir(),
    `nwmiws-source-data-${Date.now()}-${Math.random().toString(16).slice(2)}`
  );
  mkdirSync(rootDir, { recursive: true });
  writeFileSync(
    path.join(rootDir, "locations.csv"),
    bundle.locationsCsv ??
      [
        "name,latitude,longitude,surface_area_acres,max_depth_ft,avg_depth_ft,description",
        "Lake One,44.1,-85.1,10,20,5.5,Fixture lake one",
      ].join("\n"),
    "utf8"
  );
  writeFileSync(
    path.join(rootDir, "info.csv"),
    bundle.infoCsv ??
      [
        "Parameter,ContactInfo,AssociationInfo,ParameterInfo",
        "TP,Contact A,Association A,Fixture parameter info",
      ].join("\n"),
    "utf8"
  );
  writeFileSync(
    path.join(rootDir, "NWMIWS_Site_Data_testing_varied.csv"),
    bundle.measurementsCsv ??
      [
        "Site,SiteType,Year,Parameter,Max,Min,Avg,Count",
        "Lake One,Lake,2000,TP,10,5,7.5,2",
      ].join("\n"),
    "utf8"
  );
  return rootDir;
}

test("loadMeasurements filters seeded data by parameter and year", () => {
  const runtimeConfig = getPlatformRuntimeConfig();
  const items = loadMeasurements(runtimeConfig, {
    parameter: "Chloro",
    year: 2000,
  });

  assert.ok(items.length > 0);
  assert.ok(items.every((item) => item.parameter === "Chloro" && item.year === 2000));
});

test("exportArtifactAsCsv returns stable headers for each supported artifact", () => {
  const runtimeConfig = getPlatformRuntimeConfig();

  assert.match(exportArtifactAsCsv(runtimeConfig, "sites.csv"), /^name,latitude,longitude/m);
  assert.match(exportArtifactAsCsv(runtimeConfig, "parameters.csv"), /^Parameter,ContactInfo/m);
  assert.match(exportArtifactAsCsv(runtimeConfig, "measurements.csv"), /^Site,SiteType,Year/m);
});

test("loadSites throws when a required source file is missing", () => {
  const sourceDataDir = createSourceDataDir({
    locationsCsv: "",
  });
  const runtimeConfig = {
    ...getPlatformRuntimeConfig(),
    sourceDataDir: path.join(sourceDataDir, "missing-source-dir"),
  };

  assert.throws(() => loadSites(runtimeConfig), /Missing source data file:/);
});

test("loadParameters throws when a source CSV is malformed", () => {
  const sourceDataDir = createSourceDataDir({
    infoCsv: 'Parameter,ContactInfo,AssociationInfo,ParameterInfo\n"TP,broken',
  });
  const runtimeConfig = {
    ...getPlatformRuntimeConfig(),
    sourceDataDir,
  };

  assert.throws(() => loadParameters(runtimeConfig), /Failed to parse info\.csv/);
});

test("csvStore invalidates its cache when the source directory changes", () => {
  const sourceDataDirA = createSourceDataDir({
    locationsCsv: [
      "name,latitude,longitude,surface_area_acres,max_depth_ft,avg_depth_ft,description",
      "Lake Alpha,44.1,-85.1,10,20,5.5,Alpha",
    ].join("\n"),
  });
  const sourceDataDirB = createSourceDataDir({
    locationsCsv: [
      "name,latitude,longitude,surface_area_acres,max_depth_ft,avg_depth_ft,description",
      "Lake Beta,44.2,-85.2,12,22,6.5,Beta",
    ].join("\n"),
  });

  const configA = {
    ...getPlatformRuntimeConfig(),
    sourceDataDir: sourceDataDirA,
  };
  const configB = {
    ...getPlatformRuntimeConfig(),
    sourceDataDir: sourceDataDirB,
  };

  const itemsA = loadSites(configA);
  const itemsB = loadSites(configB);

  assert.equal(itemsA[0]?.name, "Lake Alpha");
  assert.equal(itemsB[0]?.name, "Lake Beta");
});
