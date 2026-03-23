import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { createAdminApi } from "./adminApi";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App adminApi={createAdminApi()} />
  </React.StrictMode>
);
