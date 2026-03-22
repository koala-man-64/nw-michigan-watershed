import { ApplicationInsights } from "@microsoft/applicationinsights-web";
import { getRuntimeEnv } from "../config/runtimeEnv";

let telemetryClient = null;
let initializationFailed = false;

function getConnectionString() {
  const env = getRuntimeEnv();
  return String(
    env.REACT_APP_APPLICATIONINSIGHTS_CONNECTION_STRING ||
      env.VITE_APPLICATIONINSIGHTS_CONNECTION_STRING ||
      ""
  ).trim();
}

function serializeValue(value) {
  if (value == null) {
    return undefined;
  }

  if (typeof value === "string") {
    return value;
  }

  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint"
  ) {
    return String(value);
  }

  try {
    return JSON.stringify(value);
  } catch (error) {
    return String(value);
  }
}

function normalizeProperties(properties = {}) {
  return Object.fromEntries(
    Object.entries(properties)
      .map(([key, value]) => [key, serializeValue(value)])
      .filter(([, value]) => value !== undefined)
  );
}

function getTelemetryClient() {
  if (telemetryClient || initializationFailed) {
    return telemetryClient;
  }

  const connectionString = getConnectionString();
  if (!connectionString) {
    return null;
  }

  try {
    const pageTitle =
      typeof document !== "undefined" && document.title
        ? document.title
        : "NW Michigan Watershed";
    const pageUri =
      typeof window !== "undefined" && window.location
        ? window.location.href
        : undefined;

    telemetryClient = new ApplicationInsights({
      config: {
        connectionString,
        enableAutoRouteTracking: true,
        autoTrackPageVisitTime: true,
      },
    });
    telemetryClient.loadAppInsights();
    telemetryClient.trackPageView({
      name: pageTitle,
      uri: pageUri,
    });
  } catch (error) {
    initializationFailed = true;
    telemetryClient = null;
    console.warn("Application Insights initialization failed.", error);
  }

  return telemetryClient;
}

export function initializeTelemetry() {
  return getTelemetryClient();
}

export function isTelemetryEnabled() {
  return Boolean(getConnectionString());
}

export function trackEvent(name, properties = {}, measurements) {
  const client = getTelemetryClient();
  if (!client || !name) {
    return false;
  }

  const normalizedProperties = normalizeProperties(properties);
  client.trackEvent(
    {
      name,
      measurements,
    },
    normalizedProperties
  );
  return true;
}

export function trackException(error, properties = {}) {
  const client = getTelemetryClient();
  if (!client || !error) {
    return false;
  }

  const exception =
    error instanceof Error ? error : new Error(serializeValue(error) || "Unknown error");
  const normalizedProperties = normalizeProperties(properties);

  client.trackException(
    {
      exception,
    },
    normalizedProperties
  );
  return true;
}

export function trackMetric(name, value, properties = {}) {
  const client = getTelemetryClient();
  if (!client || !name || !Number.isFinite(value)) {
    return false;
  }

  client.trackMetric(
    {
      name,
      average: value,
      sampleCount: 1,
    },
    normalizeProperties(properties)
  );
  return true;
}

export function trackWebVital(metric) {
  if (!metric || !metric.name || !Number.isFinite(metric.value)) {
    return false;
  }

  return trackMetric(metric.name, metric.value, {
    id: metric.id,
    navigationType: metric.navigationType,
    rating: metric.rating,
    delta: Number.isFinite(metric.delta) ? metric.delta : undefined,
  });
}

export function resetTelemetryForTests() {
  telemetryClient = null;
  initializationFailed = false;
}
