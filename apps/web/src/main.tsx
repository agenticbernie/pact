/**
 * Console entry point.
 *
 * Astryx ships as two stylesheets plus a theme stylesheet, and the Neutral theme
 * is a pre-built theme: its CSS is NOT injected at runtime, so all three imports
 * are required and must stay in this order (each one registers its CSS cascade
 * layer — `reset`, then `astryx-base`, then `astryx-theme`).
 */
import "@astryxdesign/core/reset.css";
import "@astryxdesign/core/astryx.css";
import "@astryxdesign/theme-neutral/theme.css";

import { Theme } from "@astryxdesign/core/theme";
import { LinkProvider } from "@astryxdesign/core/Link";
import { neutralTheme } from "@astryxdesign/theme-neutral/built";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
import { AppLink } from "./components/AppLink";
import { SessionProvider } from "./session/SessionProvider";

const container = document.getElementById("root");
if (container === null) throw new Error("Root container #root is missing from index.html.");

createRoot(container).render(
  <StrictMode>
    <Theme theme={neutralTheme}>
      <BrowserRouter>
        {/* Every Astryx link (nav rail, tables, breadcrumbs) navigates through the router. */}
        <LinkProvider component={AppLink}>
          <SessionProvider>
            <App />
          </SessionProvider>
        </LinkProvider>
      </BrowserRouter>
    </Theme>
  </StrictMode>,
);
