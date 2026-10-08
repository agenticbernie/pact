import { AppShell } from "@astryxdesign/core/AppShell";
import { Navigate, Outlet, Route, Routes } from "react-router-dom";
import { AppNav } from "./components/AppNav";
import { TestnetNotice } from "./components/TestnetNotice";
import { UtilityRail } from "./components/UtilityRail";
import { CardActivityPage } from "./pages/CardActivityPage";
import { CardPage } from "./pages/CardPage";
import { DashboardPage } from "./pages/DashboardPage";
import { LandingPage } from "./pages/LandingPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { PaymentDetailPage } from "./pages/PaymentDetailPage";
import { PaymentsPage } from "./pages/PaymentsPage";
import { useSession } from "./session/SessionProvider";

/**
 * Console frame.
 *
 * One AppShell owns the page chrome: the testnet disclosure sits in the banner
 * slot, the operator utility rail in `topNav`, the grouped console rail in the
 * `sideNav` slot, and every route renders into the main landmark. Below the
 * mobile breakpoint AppShell moves the rail into its MobileNav drawer and
 * renders a compact top bar carrying the toggle, so no page lays out its own
 * navigation.
 */
function ConsoleLayout() {
  return (
    <AppShell
      banner={<TestnetNotice />}
      topNav={<UtilityRail />}
      sideNav={<AppNav />}
      contentPadding={4}
    >
      <Outlet />
    </AppShell>
  );
}

/**
 * `/` is the public landing page.
 *
 * A visitor with no session is the audience for it; a wallet that already holds
 * one is here to operate, so it goes straight to the console instead of being
 * shown the marketing surface. The session is restored synchronously in
 * `SessionProvider`, so this decision is made on the first render — no flash of
 * the wrong page.
 */
function LandingEntry() {
  const { state } = useSession();
  if (state.status === "active") return <Navigate to="/console" replace />;
  return <LandingPage />;
}

export function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingEntry />} />
      <Route element={<ConsoleLayout />}>
        <Route path="/console" element={<DashboardPage />} />
        <Route path="/payments" element={<PaymentsPage />} />
        <Route path="/payments/:paymentId" element={<PaymentDetailPage />} />
        <Route path="/cards/:cardId" element={<CardPage />} />
        <Route path="/cards/:cardId/activity" element={<CardActivityPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
