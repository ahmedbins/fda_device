import React from "react";
import { createRoot } from "react-dom/client";
import MonitorPage from "../app/monitor-page";
import "../app/globals.css";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <MonitorPage />
  </React.StrictMode>,
);
