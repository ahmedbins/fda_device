import React from "react";
import { createRoot } from "react-dom/client";
import ContactFooter from "../app/contact-footer";
import "../app/globals.css";
import StandardsMappingPage from "../app/standards-mapping-page";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <StandardsMappingPage />
    <ContactFooter />
  </React.StrictMode>,
);
