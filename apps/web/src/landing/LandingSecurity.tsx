import { Badge } from "@astryxdesign/core/Badge";
import { Banner } from "@astryxdesign/core/Banner";
import { Card } from "@astryxdesign/core/Card";
import { Grid } from "@astryxdesign/core/Grid";
import { Heading } from "@astryxdesign/core/Heading";
import { Stack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { BrandMark } from "../components/BrandMark";
import { LandingSection } from "./LandingSection";

/**
 * Where authority stops, in three columns: what the agent may do, what enforces
 * the boundary, and what the chain guarantees afterwards.
 */
const AGENT_SCOPE = [
  "Payment scope bound",
  "Owner spending cap",
  "Per-transaction limit",
  "Allowlist enforced",
];

const CHAIN_SCOPE = [
  "Arc L2 anchor",
  "Nonce replay guard",
  "Dual-event proofs",
  "Irreversible finality",
];

function ScopeCard({
  role,
  boundary,
  items,
}: {
  role: string;
  boundary: string;
  items: string[];
}) {
  return (
    <Card>
      <VStack gap={3}>
        <VStack gap={1}>
          <Text type="label" size="xsm" color="secondary">
            {role}
          </Text>
          <Heading level={3}>{boundary}</Heading>
        </VStack>
        <VStack gap={2}>
          {items.map((item) => (
            <Stack key={item} direction="horizontal" gap={2} align="start">
              <Text color="accent">•</Text>
              <Text type="supporting">{item}</Text>
            </Stack>
          ))}
        </VStack>
      </VStack>
    </Card>
  );
}

export function LandingSecurity() {
  return (
    <LandingSection
      id="security"
      eyebrow="07 / SECURITY ARCHITECTURE"
      title="Give agents payment capability — not unlimited authority."
      description="The agent acts strictly inside the mandate its operator defined, and the boundary is enforced at the contract layer rather than by asking the agent to behave."
    >
      <Grid columns={{ minWidth: 280, repeat: "fit", max: 3 }} gap={4}>
        <ScopeCard
          role="1. Autonomous agent"
          boundary="Enclosed action boundary"
          items={AGENT_SCOPE}
        />
        <Card>
          <VStack gap={3} hAlign="center">
            <BrandMark size={36} />
            <VStack gap={1} hAlign="center">
              <Heading level={3}>Pact protocol layer</Heading>
              <Text type="supporting">EIP-712 dual-signer verification &amp; preflight consensus</Text>
            </VStack>
            <Badge variant="info" label="ZERO-TRUST MANDATE" />
          </VStack>
        </Card>
        <ScopeCard
          role="3. On-chain settlement"
          boundary="Immutable verification"
          items={CHAIN_SCOPE}
        />
      </Grid>
      <Banner
        status="info"
        title="Transparent operational security"
        description="Pact refuses an out-of-policy intent before anything is signed, so the systemic risk sits with the mandate rather than with the agent. Private keys never reach a client browser."
      />
    </LandingSection>
  );
}
