import { AppShell } from "@astryxdesign/core/AppShell";
import { Route, Routes } from "react-router-dom";
import { AppNav } from "./components/AppNav";
import { TestnetNotice } from "./components/TestnetNotice";
import { UtilityRail } from "./components/UtilityRail";
import { CardActivityPage } from "./pages/CardActivityPage";
import { CardPage } from "./pages/CardPage";
import { DashboardPage } from "./pages/DashboardPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { PaymentDetailPage } from "./pages/PaymentDetailPage";
import { PaymentsPage } from "./pages/PaymentsPage";

/**
 * Application frame.
 *
 * One AppShell owns the page chrome: the testnet disclosure sits in the banner
 * slot, the operator utility rail in `topNav`, the grouped console rail in the
 * `sideNav` slot, and every route renders into the main landmark. Below the
 * mobile breakpoint AppShell moves the rail into its MobileNav drawer and
 * renders a compact top bar carrying the toggle, so no page lays out its own
 * navigation.
 */
export function App() {
  return (
    <AppShell
      banner={<TestnetNotice />}
      topNav={<UtilityRail />}
      sideNav={<AppNav />}
      contentPadding={4}
    >
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/payments" element={<PaymentsPage />} />
        <Route path="/payments/:paymentId" element={<PaymentDetailPage />} />
        <Route path="/cards/:cardId" element={<CardPage />} />
        <Route path="/cards/:cardId/activity" element={<CardActivityPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </AppShell>
  );
}
