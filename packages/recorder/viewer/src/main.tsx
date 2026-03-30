import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RegistryProvider } from "@effect/atom-react";
import { App } from "./app";
import "./style.css";

createRoot(document.getElementById("app")!).render(
  <StrictMode>
    <RegistryProvider>
      <App />
    </RegistryProvider>
  </StrictMode>,
);
