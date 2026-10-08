/**
 * Console entry point.
 *
 * Astryx ships as two stylesheets plus a theme. The reset and base stylesheets
 * register their cascade layers (`reset`, then `astryx-base`) and must stay in
 * that order; the theme itself is Pact's own, injected by `<Theme>` (see
 * `src/theme.ts` for the design decisions and `index.html` for the fonts).
 */
import "@astryxdesign/core/reset.css";
import "@astryxdesign/core/astryx.css";

import { Theme } from "@astryxdesign/core/theme";
import { LinkProvider } from "@astryxdesign/core/Link";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
import { AppLink } from "./components/AppLink";
import { SessionProvider } from "./session/SessionProvider";
import { pactTheme } from "./theme";

const container = document.getElementById("root");
if (container === null) throw new Error("Root container #root is missing from index.html.");

createRoot(container).render(
  <StrictMode>
    <Theme theme={pactTheme}>
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
