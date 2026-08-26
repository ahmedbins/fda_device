import React from "react";
import { createRoot } from "react-dom/client";
import ContactFooter from "../app/contact-footer";
import DeviceExplorer from "../app/page";
import "../app/globals.css";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <DeviceExplorer />
    <ContactFooter />
  </React.StrictMode>,
);
