/* eslint-env jest */
jest.mock("@microsoft/applicationinsights-web", () => {
  const trackEvent = jest.fn();
  const trackException = jest.fn();
  const trackMetric = jest.fn();
  const trackPageView = jest.fn();
  const loadAppInsights = jest.fn();

  return {
    ApplicationInsights: jest.fn().mockImplementation(() => ({
      loadAppInsights,
      trackEvent,
      trackException,
      trackMetric,
      trackPageView,
    })),
    __mocks: {
      loadAppInsights,
      trackEvent,
      trackException,
      trackMetric,
      trackPageView,
    },
  };
});

describe("telemetry", () => {
  const originalConnectionString =
    globalThis.process?.env?.REACT_APP_APPLICATIONINSIGHTS_CONNECTION_STRING;

  beforeEach(() => {
    jest.resetModules();
    globalThis.process.env.REACT_APP_APPLICATIONINSIGHTS_CONNECTION_STRING = "";
  });

  afterEach(() => {
    globalThis.process.env.REACT_APP_APPLICATIONINSIGHTS_CONNECTION_STRING =
      originalConnectionString;
    jest.clearAllMocks();
  });

  it("is a no-op when the connection string is not configured", async () => {
    const telemetry = await import("./telemetry");

    expect(telemetry.initializeTelemetry()).toBeNull();
    expect(telemetry.trackEvent("plot_updated", { slot: 1 })).toBe(false);
    expect(telemetry.trackException(new Error("boom"))).toBe(false);
    expect(telemetry.trackMetric("CLS", 0.01)).toBe(false);
  });

  it("initializes once and forwards events to Application Insights", async () => {
    globalThis.process.env.REACT_APP_APPLICATIONINSIGHTS_CONNECTION_STRING =
      "InstrumentationKey=test-key";

    const telemetry = await import("./telemetry");
    const aiModule = await import("@microsoft/applicationinsights-web");

    telemetry.resetTelemetryForTests();
    const client = telemetry.initializeTelemetry();

    expect(client).not.toBeNull();
    expect(aiModule.ApplicationInsights).toHaveBeenCalledTimes(1);
    expect(aiModule.__mocks.loadAppInsights).toHaveBeenCalledTimes(1);
    expect(aiModule.__mocks.trackPageView).toHaveBeenCalledTimes(1);

    expect(telemetry.trackEvent("plot_updated", { slot: 1 })).toBe(true);
    expect(aiModule.__mocks.trackEvent).toHaveBeenCalledWith(
      expect.objectContaining({ name: "plot_updated" }),
      expect.objectContaining({ slot: "1" })
    );

    expect(telemetry.trackException(new Error("boom"), { source: "test" })).toBe(
      true
    );
    expect(aiModule.__mocks.trackException).toHaveBeenCalled();

    expect(telemetry.trackMetric("CLS", 0.01, { rating: "good" })).toBe(true);
    expect(aiModule.__mocks.trackMetric).toHaveBeenCalledWith(
      expect.objectContaining({ name: "CLS", average: 0.01 }),
      expect.objectContaining({ rating: "good" })
    );
  });
});
