import React from "react";
import { createRoot } from "react-dom/client";
import FdaExplorerNext from "../app/next/fda-explorer-next";
import "../app/globals.css";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <FdaExplorerNext />
  </React.StrictMode>,
);
