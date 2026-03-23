import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { createRequire } from "node:module";
import { afterEach, vi } from "vitest";

globalThis.jest = vi;
globalThis.require = createRequire(import.meta.url);

afterEach(() => {
  cleanup();
});
