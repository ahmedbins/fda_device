import React from "react";
import { createRoot } from "react-dom/client";
import ContactFooter from "../app/contact-footer";
import IeceeExplorerPage from "../app/iecee-explorer-page";
import "../app/globals.css";

createRoot(document.getElementById("root")!).render(<React.StrictMode><IeceeExplorerPage /><ContactFooter /></React.StrictMode>);
