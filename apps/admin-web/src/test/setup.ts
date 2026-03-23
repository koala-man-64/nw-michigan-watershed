import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
import { createRequire } from "node:module";

const testGlobals = globalThis as typeof globalThis & {
  require: NodeJS.Require;
};

testGlobals.require = createRequire(import.meta.url);

afterEach(() => {
  cleanup();
});
