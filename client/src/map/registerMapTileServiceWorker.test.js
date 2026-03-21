import { registerMapTileServiceWorker } from "./registerMapTileServiceWorker";
import { trackException } from "../utils/telemetry";

jest.mock("../utils/telemetry", () => ({
  trackException: jest.fn(),
}));

describe("registerMapTileServiceWorker", () => {
  const originalEnv = { ...process.env };
  const originalNavigator = global.navigator;
  const originalLocation = global.location;

  function setGlobalValue(name, value) {
    Object.defineProperty(global, name, {
      configurable: true,
      value,
      writable: true,
    });
  }

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    setGlobalValue("location", { origin: "https://example.test" });
  });

  afterAll(() => {
    process.env = originalEnv;
    setGlobalValue("navigator", originalNavigator);
    setGlobalValue("location", originalLocation);
  });

  test("does nothing in tests", async () => {
    process.env.NODE_ENV = "test";
    setGlobalValue("navigator", {
      serviceWorker: {
        register: jest.fn(),
      },
    });

    await expect(registerMapTileServiceWorker()).resolves.toBeNull();
    expect(trackException).not.toHaveBeenCalled();
  });

  test("registers the service worker in development", async () => {
    process.env.NODE_ENV = "development";
    const registration = { scope: "https://example.test/" };
    setGlobalValue("navigator", {
      serviceWorker: {
        register: jest.fn().mockResolvedValue(registration),
      },
    });

    await expect(registerMapTileServiceWorker()).resolves.toBe(registration);
    expect(global.navigator.serviceWorker.register).toHaveBeenCalledWith(
      "https://example.test/sw.js"
    );
  });

  test("registers the service worker in production", async () => {
    process.env.NODE_ENV = "production";
    process.env.PUBLIC_URL = "/nwmiws";
    const registration = { scope: "https://example.test/nwmiws/" };
    setGlobalValue("navigator", {
      serviceWorker: {
        register: jest.fn().mockResolvedValue(registration),
      },
    });

    await expect(registerMapTileServiceWorker()).resolves.toBe(registration);
    expect(global.navigator.serviceWorker.register).toHaveBeenCalledWith(
      "https://example.test/nwmiws/sw.js"
    );
  });

  test("swallows registration failures after tracking them", async () => {
    process.env.NODE_ENV = "production";
    const failure = new Error("register failed");
    setGlobalValue("navigator", {
      serviceWorker: {
        register: jest.fn().mockRejectedValue(failure),
      },
    });

    await expect(registerMapTileServiceWorker()).resolves.toBeNull();
    expect(trackException).toHaveBeenCalledWith(
      failure,
      expect.objectContaining({
        component: "registerMapTileServiceWorker",
      })
    );
  });
});
