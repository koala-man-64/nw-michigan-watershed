/* eslint-env jest, node */
import '@testing-library/jest-dom';
import 'jest-canvas-mock';

import { server } from './test/msw/server';

// CRA's Jest setup cannot import d3's ESM package directly, so tests use the UMD bundle.
jest.mock('d3', () => require(require('path').join(process.cwd(), 'node_modules/d3/dist/d3.min.js')));

class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = ResizeObserver;
}

if (!window.requestAnimationFrame) {
  window.requestAnimationFrame = (callback) => window.setTimeout(callback, 0);
}

if (!window.cancelAnimationFrame) {
  window.cancelAnimationFrame = (handle) => window.clearTimeout(handle);
}

if (!window.URL.createObjectURL) {
  window.URL.createObjectURL = () => 'blob:mock';
}

if (!window.URL.revokeObjectURL) {
  window.URL.revokeObjectURL = () => {};
}

Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
  configurable: true,
  get() {
    const value = this.getAttribute('data-client-width');
    return value ? Number(value) : 800;
  },
});

Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
  configurable: true,
  get() {
    const value = this.getAttribute('data-client-height');
    return value ? Number(value) : 400;
  },
});

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' });
});

afterEach(() => {
  server.resetHandlers();
  window.localStorage.clear();
});

afterAll(() => {
  server.close();
});
