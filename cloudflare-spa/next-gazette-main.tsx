import React from "react";
import { createRoot } from "react-dom/client";
import GazettePage from "../app/next/gazette-page";
import "../app/globals.css";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <GazettePage />
  </React.StrictMode>,
);
