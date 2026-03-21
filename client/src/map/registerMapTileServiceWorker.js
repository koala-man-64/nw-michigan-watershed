import { trackException } from "../utils/telemetry";

export async function registerMapTileServiceWorker() {
  if (process.env.NODE_ENV !== "production") {
    return null;
  }

  const navigatorImpl = globalThis.navigator;
  if (!navigatorImpl?.serviceWorker) {
    return null;
  }

  const publicUrl = String(process.env.PUBLIC_URL || "").trim();
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
