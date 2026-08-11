import React from "react";
import { createRoot } from "react-dom/client";
import FccExplorerPage from "../app/fcc-explorer-page";
import "../app/globals.css";

createRoot(document.getElementById("root")!).render(<React.StrictMode><FccExplorerPage /></React.StrictMode>);
