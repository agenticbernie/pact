import { AppShell } from "@astryxdesign/core/AppShell";
import { ConsolePreview } from "../landing/ConsolePreview";
import { LandingAudience } from "../landing/LandingAudience";
import { LandingCta } from "../landing/LandingCta";
import { LandingDevelopers } from "../landing/LandingDevelopers";
import { LandingEvidence } from "../landing/LandingEvidence";
import { LandingFooter } from "../landing/LandingFooter";
import { LandingGuarantees } from "../landing/LandingGuarantees";
import { LandingHero } from "../landing/LandingHero";
import { LandingNav } from "../landing/LandingNav";
import { LandingProblem } from "../landing/LandingProblem";
import { LandingSecurity } from "../landing/LandingSecurity";
import { LandingSteps } from "../landing/LandingSteps";

/**
 * Public landing page — the surface for someone who has never seen Pact.
 *
 * It is deliberately not the console: no testnet banner, no wallet gate, no
 * side rail, and nothing that requires a session. It answers the three
 * questions a first-time visitor arrives with — what is this, why is it
 * different, and how do I start — then hands them to `/console`, which is where
 * a wallet signs in.
 *
 * The document order is the argument: the thesis (hero), the problem, the
 * lifecycle, the guarantees, what the operator sees, how a settlement is
 * verified, how to integrate, where authority stops, who it is for, and finally
 * the way in.
 */
export function LandingPage() {
  return (
    <AppShell topNav={<LandingNav />} height="auto" variant="section">
      <LandingHero />
      <LandingProblem />
      <LandingSteps />
      <LandingGuarantees />
      <ConsolePreview />
      <LandingEvidence />
      <LandingDevelopers />
      <LandingSecurity />
      <LandingAudience />
      <LandingCta />
      <LandingFooter />
    </AppShell>
  );
}
