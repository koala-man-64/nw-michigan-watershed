import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 3000,
    proxy: {
      "/api": {
        target: "http://localhost:9091",
        changeOrigin: false,
        secure: false,
      },
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/vitest.setup.js"],
    coverage: {
      include: ["src/**/*.{js,jsx}"],
      exclude: [
        "src/**/*.test.{js,jsx}",
        "src/main.jsx",
        "src/index.js",
        "src/reportWebVitals.js",
        "src/setupProxy.js",
        "src/setupTests.js",
      ],
    },
  },
});
