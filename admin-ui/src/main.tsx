import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "@/app/App";
import { LocaleProvider } from "@/i18n";
import "./styles.css";

createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <LocaleProvider>
      <App />
    </LocaleProvider>
  </React.StrictMode>,
);
