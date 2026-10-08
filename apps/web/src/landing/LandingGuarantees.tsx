import { Card } from "@astryxdesign/core/Card";
import { Grid } from "@astryxdesign/core/Grid";
import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { LandingSection } from "./LandingSection";

/**
 * The four properties an operator is buying.
 *
 * They are stated as guarantees rather than features because each one is
 * enforced at the protocol layer, not by the agent behaving well.
 */
const GUARANTEES = [
  {
    title: "Policy-aware",
    copy: "Spending limits, velocity ceilings and counterparty constraints are defined before an agent acts. Every dollar needs an explicit mandate.",
  },
  {
    title: "Fail-closed",
    copy: "When authorization, balance or valid evidence is missing or ambiguous, execution halts immediately — with no gas burned.",
  },
  {
    title: "Idempotent",
    copy: "A looping agent or a duplicate retry never becomes a double charge: cryptographic nonces give every intent single-execution semantics.",
  },
  {
    title: "Verifiable",
    copy: "Every settlement links to public blockchain receipts, block numbers and emitted events, so it stands up to outside audit.",
  },
];

export function LandingGuarantees() {
  return (
    <LandingSection
      id="why-pact"
      tone="muted"
      eyebrow="03 / CORE GUARANTEES"
      title="Autonomy without giving up control."
      description="Built from conservative fintech primitives and zero-trust cryptographic boundaries."
    >
      <Grid columns={{ minWidth: 260, repeat: "fit", max: 4 }} gap={4}>
        {GUARANTEES.map((guarantee) => (
          <Card key={guarantee.title}>
            <VStack gap={2}>
              <Heading level={3}>{guarantee.title}</Heading>
              <Text type="supporting">{guarantee.copy}</Text>
            </VStack>
          </Card>
        ))}
      </Grid>
    </LandingSection>
  );
}
