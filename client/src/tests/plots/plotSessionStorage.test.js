/* eslint-env jest */
import {
  clearSession,
  PLOT_SESSION_STORAGE_KEY,
  readSession,
  writeSession,
} from "../../plots/plotSessionStorage";

describe("plotSessionStorage", () => {
  afterEach(() => {
    jest.restoreAllMocks();
    clearSession();
  });

  test("writes and reads a versioned plot session envelope", () => {
    writeSession({
      showWelcome: false,
      plotState: {
        plotWorkspaces: [{ id: "plot-2", draft: {}, applied: null }],
        activePlotId: "plot-2",
      },
    });

    expect(JSON.parse(window.localStorage.getItem(PLOT_SESSION_STORAGE_KEY))).toMatchObject({
      version: 1,
      showWelcome: false,
      plotState: {
        plotWorkspaces: [{ id: "plot-2", draft: {}, applied: null }],
        activePlotId: "plot-2",
      },
    });
    expect(readSession()).toEqual({
      showWelcome: false,
      plotState: {
        plotWorkspaces: [{ id: "plot-2", draft: {}, applied: null }],
        activePlotId: "plot-2",
      },
    });
  });

  test("discards malformed JSON and clears the stored session", () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

    window.localStorage.setItem(PLOT_SESSION_STORAGE_KEY, "{bad json");

    expect(readSession()).toBeNull();
    expect(window.localStorage.getItem(PLOT_SESSION_STORAGE_KEY)).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(
      "[nwmiws:plot-session] Discarding malformed persisted plot session.",
      expect.any(Error)
    );
  });

  test("discards version mismatches and clears the stored session", () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

    window.localStorage.setItem(
      PLOT_SESSION_STORAGE_KEY,
      JSON.stringify({
        version: 99,
        showWelcome: false,
        plotState: {
          plotWorkspaces: [{ id: "plot-1", draft: {}, applied: null }],
          activePlotId: "plot-1",
        },
      })
    );

    expect(readSession()).toBeNull();
    expect(window.localStorage.getItem(PLOT_SESSION_STORAGE_KEY)).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(
      "[nwmiws:plot-session] Discarding persisted plot session because the version is unsupported."
    );
  });

  test("warns and returns false when writes fail", () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    const setItemSpy = jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota exceeded");
    });

    expect(writeSession({ showWelcome: false, plotState: null })).toBe(false);
    expect(warnSpy).toHaveBeenCalledWith(
      "[nwmiws:plot-session] Unable to persist plot session.",
      expect.any(Error)
    );

    setItemSpy.mockRestore();
  });
});
