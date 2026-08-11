import React from "react";
import { createRoot } from "react-dom/client";
import FccMonitorPage from "../app/fcc-monitor-page";
import "../app/globals.css";

createRoot(document.getElementById("root")!).render(<React.StrictMode><FccMonitorPage /></React.StrictMode>);
