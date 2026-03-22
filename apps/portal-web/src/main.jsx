import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import App from "./App";
import reportWebVitals from "./reportWebVitals";
import { registerMapTileServiceWorker } from "./map/registerMapTileServiceWorker";
import { initializeTelemetry, trackWebVital } from "./utils/telemetry";

const root = ReactDOM.createRoot(document.getElementById("root"));

initializeTelemetry();
void registerMapTileServiceWorker();

root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

reportWebVitals(trackWebVital);
