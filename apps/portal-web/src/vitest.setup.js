import "@testing-library/jest-dom/vitest";
import { createRequire } from "node:module";
import { vi } from "vitest";

globalThis.jest = vi;
globalThis.require = createRequire(import.meta.url);
