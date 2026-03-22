import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import * as Papa from "papaparse";
import type {
  MeasurementRecord,
  ParameterRecord,
  ReleaseArtifactName,
  SiteRecord,
} from "@nwmiws/contracts";
import { getPlatformRuntimeConfig, type PlatformRuntimeConfig } from "../config";

export interface MeasurementFilter {
  site?: string;
  siteType?: string;
  parameter?: string;
  year?: string | number;
}

export interface SourceDataBundle {
  sites: SiteRecord[];
  parameters: ParameterRecord[];
  measurements: MeasurementRecord[];
}

let cachedBundle: { sourceDir: string; bundle: SourceDataBundle } | null = null;

function resolveSourcePath(runtimeConfig: PlatformRuntimeConfig, fileName: string): string {
  return path.join(runtimeConfig.sourceDataDir, fileName);
}

function readCsvRows<T extends Record<string, unknown>>(filePath: string): T[] {
  if (!existsSync(filePath)) {
    throw new Error(`Missing source data file: ${filePath}`);
  }

  const content = readFileSync(filePath, "utf8");
  const parsed = Papa.parse<T>(content, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header) => String(header).trim(),
  });

  if (parsed.errors.length) {
    const firstError = parsed.errors[0];
    throw new Error(`Failed to parse ${path.basename(filePath)}: ${firstError.message}`);
  }

  return (parsed.data || []).filter((row) => row && Object.keys(row).length > 0);
}

function toNumber(value: unknown): number | null {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) {
    return null;
  }

  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeText(value: unknown): string {
  return String(value ?? "").trim();
}

function loadBundle(runtimeConfig: PlatformRuntimeConfig = getPlatformRuntimeConfig()): SourceDataBundle {
  const sourceDir = runtimeConfig.sourceDataDir;
  if (cachedBundle?.sourceDir === sourceDir) {
    return cachedBundle.bundle;
  }

  const sites = readCsvRows<Record<string, string>>(resolveSourcePath(runtimeConfig, "locations.csv")).map((row) => ({
    name: normalizeText(row.name),
    latitude: Number(normalizeText(row.latitude)),
    longitude: Number(normalizeText(row.longitude)),
    surfaceAreaAcres: toNumber(row.surface_area_acres),
    maxDepthFt: toNumber(row.max_depth_ft),
    avgDepthFt: toNumber(row.avg_depth_ft),
    description: normalizeText(row.description),
  }));

  const parameters = readCsvRows<Record<string, string>>(resolveSourcePath(runtimeConfig, "info.csv")).map((row) => ({
    parameter: normalizeText(row.Parameter),
    contactInfo: normalizeText(row.ContactInfo),
    associationInfo: normalizeText(row.AssociationInfo),
    parameterInfo: normalizeText(row.ParameterInfo),
  }));

  const measurements = readCsvRows<Record<string, string>>(
    resolveSourcePath(runtimeConfig, "NWMIWS_Site_Data_testing_varied.csv")
  ).map((row) => ({
    site: normalizeText(row.Site),
    siteType: normalizeText(row.SiteType),
    year: Number.parseInt(normalizeText(row.Year), 10),
    parameter: normalizeText(row.Parameter),
    max: Number(normalizeText(row.Max)),
    min: Number(normalizeText(row.Min)),
    avg: Number(normalizeText(row.Avg)),
    count: Number.parseInt(normalizeText(row.Count), 10),
  }));

  cachedBundle = {
    sourceDir,
    bundle: { sites, parameters, measurements },
  };

  return cachedBundle.bundle;
}

function applyFilter(items: MeasurementRecord[], filter: MeasurementFilter = {}): MeasurementRecord[] {
  return items.filter((item) => {
    if (filter.site && item.site.toLowerCase() !== String(filter.site).trim().toLowerCase()) {
      return false;
    }

    if (filter.siteType && item.siteType.toLowerCase() !== String(filter.siteType).trim().toLowerCase()) {
      return false;
    }

    if (filter.parameter && item.parameter.toLowerCase() !== String(filter.parameter).trim().toLowerCase()) {
      return false;
    }

    if (
      filter.year !== undefined &&
      filter.year !== null &&
      String(item.year) !== String(filter.year).trim()
    ) {
      return false;
    }

    return true;
  });
}

export function loadSites(runtimeConfig: PlatformRuntimeConfig = getPlatformRuntimeConfig()): SiteRecord[] {
  return loadBundle(runtimeConfig).sites;
}

export function loadParameters(runtimeConfig: PlatformRuntimeConfig = getPlatformRuntimeConfig()): ParameterRecord[] {
  return loadBundle(runtimeConfig).parameters;
}

export function loadMeasurements(
  runtimeConfig: PlatformRuntimeConfig = getPlatformRuntimeConfig(),
  filter: MeasurementFilter = {}
): MeasurementRecord[] {
  return applyFilter(loadBundle(runtimeConfig).measurements, filter);
}

export function exportArtifactAsCsv(
  runtimeConfig: PlatformRuntimeConfig,
  artifact: ReleaseArtifactName
): string {
  const bundle = loadBundle(runtimeConfig);

  if (artifact === "sites.csv") {
    return Papa.unparse(
      bundle.sites.map((site) => ({
        name: site.name,
        latitude: site.latitude,
        longitude: site.longitude,
        surface_area_acres: site.surfaceAreaAcres,
        max_depth_ft: site.maxDepthFt,
        avg_depth_ft: site.avgDepthFt,
        description: site.description,
      }))
    );
  }

  if (artifact === "parameters.csv") {
    return Papa.unparse(
      bundle.parameters.map((parameter) => ({
        Parameter: parameter.parameter,
        ContactInfo: parameter.contactInfo,
        AssociationInfo: parameter.associationInfo,
        ParameterInfo: parameter.parameterInfo,
      }))
    );
  }

  if (artifact === "measurements.csv") {
    return Papa.unparse(
      bundle.measurements.map((measurement) => ({
        Site: measurement.site,
        SiteType: measurement.siteType,
        Year: measurement.year,
        Parameter: measurement.parameter,
        Max: measurement.max,
        Min: measurement.min,
        Avg: measurement.avg,
        Count: measurement.count,
      }))
    );
  }

  throw new Error(`Unsupported CSV artifact: ${artifact}`);
}
