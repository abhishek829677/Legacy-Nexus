import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { ToastProvider } from "./components/ui";
import { AuthProvider } from "./lib/auth";
import { RouterProvider } from "./lib/router";
import "./styles.css";
import "./motion.css";
import { installSpotlight } from "./components/Motion";

installSpotlight();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider>
      <ToastProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </ToastProvider>
    </RouterProvider>
  </StrictMode>,
);
