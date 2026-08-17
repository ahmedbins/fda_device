import React from "react";
import { createRoot } from "react-dom/client";
import MdallMonitorPage from "../app/mdall-monitor-page";
import "../app/globals.css";

createRoot(document.getElementById("root")!).render(<React.StrictMode><MdallMonitorPage /></React.StrictMode>);
