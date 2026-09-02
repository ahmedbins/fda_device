import React from "react";
import { createRoot } from "react-dom/client";
import HubPage from "../app/next/hub-page";
import "../app/globals.css";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <HubPage />
  </React.StrictMode>,
);
