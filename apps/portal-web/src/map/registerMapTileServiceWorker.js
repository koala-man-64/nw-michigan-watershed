import { trackException } from "../utils/telemetry";
import { getRuntimeEnv } from "../config/runtimeEnv";

export async function registerMapTileServiceWorker() {
  const env = getRuntimeEnv();
  if (env.NODE_ENV === "test" && env.MODE === "test") {
    return null;
  }

  const navigatorImpl = globalThis.navigator;
  if (!navigatorImpl?.serviceWorker) {
    return null;
  }

  const processEnv = globalThis.process?.env || {};
  const publicUrl = String(
    processEnv.PUBLIC_URL ||
      processEnv.BASE_URL ||
      env.PUBLIC_URL ||
      env.BASE_URL ||
      ""
  ).trim();
  const serviceWorkerUrl = new URL(
    `${publicUrl.replace(/\/$/, "")}/sw.js`,
    globalThis.location?.origin || "http://localhost"
  ).toString();

  try {
    return await navigatorImpl.serviceWorker.register(serviceWorkerUrl);
  } catch (error) {
    trackException(error, {
      component: "registerMapTileServiceWorker",
      serviceWorkerUrl,
    });
    return null;
  }
}
