import React from "react";
import { createRoot } from "react-dom/client";
import MdallExplorerPage from "../app/mdall-explorer-page";
import "../app/globals.css";

createRoot(document.getElementById("root")!).render(<React.StrictMode><MdallExplorerPage /></React.StrictMode>);
