import React from "react";
import { createRoot } from "react-dom/client";
import ContactFooter from "../app/contact-footer";
import IeceeMonitorPage from "../app/iecee-monitor-page";
import "../app/globals.css";

createRoot(document.getElementById("root")!).render(<React.StrictMode><IeceeMonitorPage /><ContactFooter /></React.StrictMode>);
