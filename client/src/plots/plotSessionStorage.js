const PLOT_SESSION_STORAGE_VERSION = 1;

export const PLOT_SESSION_STORAGE_KEY = "nwmiws:plot-session:v1";

function getStorage() {
  try {
    return window.localStorage;
  } catch (error) {
    return null;
  }
}

function warn(message, error) {
  if (error) {
    console.warn(`[nwmiws:plot-session] ${message}`, error);
    return;
  }

  console.warn(`[nwmiws:plot-session] ${message}`);
}

export function clearSession() {
  const storage = getStorage();
  if (!storage) {
    return;
  }

  try {
    storage.removeItem(PLOT_SESSION_STORAGE_KEY);
  } catch (error) {
    warn("Unable to clear persisted plot session.", error);
  }
}

export function readSession() {
  const storage = getStorage();
  if (!storage) {
    return null;
  }

  let rawSession = null;
  try {
    rawSession = storage.getItem(PLOT_SESSION_STORAGE_KEY);
  } catch (error) {
    warn("Unable to read persisted plot session.", error);
    return null;
  }

  if (!rawSession) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawSession);
    if (!parsed || typeof parsed !== "object") {
      warn("Discarding persisted plot session because the envelope is invalid.");
      clearSession();
      return null;
    }

    if (parsed.version !== PLOT_SESSION_STORAGE_VERSION) {
      warn("Discarding persisted plot session because the version is unsupported.");
      clearSession();
      return null;
    }

    if (typeof parsed.showWelcome !== "boolean" || !parsed.plotState || typeof parsed.plotState !== "object") {
      warn("Discarding persisted plot session because required fields are missing.");
      clearSession();
      return null;
    }

    return {
      showWelcome: parsed.showWelcome,
      plotState: parsed.plotState,
    };
  } catch (error) {
    warn("Discarding malformed persisted plot session.", error);
    clearSession();
    return null;
  }
}

export function writeSession(session) {
  const storage = getStorage();
  if (!storage) {
    return false;
  }

  try {
    storage.setItem(
      PLOT_SESSION_STORAGE_KEY,
      JSON.stringify({
        version: PLOT_SESSION_STORAGE_VERSION,
        showWelcome: Boolean(session?.showWelcome),
        plotState: session?.plotState ?? null,
      })
    );
    return true;
  } catch (error) {
    warn("Unable to persist plot session.", error);
    return false;
  }
}
