import { Button } from "@astryxdesign/core/Button";
import { CodeBlock } from "@astryxdesign/core/CodeBlock";
import { Grid } from "@astryxdesign/core/Grid";
import { Heading } from "@astryxdesign/core/Heading";
import { Stack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { LandingSection } from "./LandingSection";
import { jumpTo } from "./jumpTo";

/**
 * The integration story, shown rather than described.
 *
 * The sample is the whole loop in one screen — declare a client, submit an
 * intent, read back the settlement and its confirmation — so an engineer can
 * size the work before opening anything else.
 */
const FEATURES = [
  "Structured payment intents: type-safe declarations with parameter validation.",
  "Explicit authorization boundaries: max spend, velocity throttle, allowlisted targets.",
  "Deterministic idempotency: cryptographic nonces stop a loop becoming a double charge.",
  "Read APIs for indexer state, verified block events and policy logs.",
];

const SAMPLE = `import { PactClient } from '@pact/sdk';

// 1. Initialize the client with an isolated agent scope
const pact = new PactClient({
  cardId: 2,
  enclaveKey: process.env.AGENT_ENCLAVE_KEY,
  network: 'arc-testnet',
});

// 2. Submit a payment intent — policy checks run before signing
const settlement = await pact.executeIntent({
  merchant: '0x3d41…7a92',   // Coffee Demo contract
  amount: 0.005,             // $0.005 USDC
  asset: 'USDC',
  invoiceRef: 'POS-4891',
});

// 3. Read the on-chain evidence back
console.log(settlement.evidence.blockNumber);  // 66170486
console.log(settlement.isDualEventConfirmed);  // true`;

export function LandingDevelopers() {
  return (
    <LandingSection
      id="developers"
      eyebrow="06 / DEVELOPER INFRASTRUCTURE"
      title="Built for agents. Designed for developers."
      description="Integrate controlled agent payments with SDKs and a read API. Define spend envelopes in configuration, bind them to an agent's runtime scope, and read settlement events back from the chain."
    >
      <Grid columns={{ minWidth: 420, repeat: "fit", max: 2 }} gap={6}>
        <VStack gap={4}>
          <VStack gap={2}>
            {FEATURES.map((feature) => (
              <Stack key={feature} direction="horizontal" gap={2} align="start">
                <Text color="accent">✓</Text>
                <Text type="supporting">{feature}</Text>
              </Stack>
            ))}
          </VStack>
          <Stack direction="horizontal" gap={3} wrap="wrap">
            <Button label="Open the console" variant="primary" href="/console" />
            <Button
              label="See the evidence"
              variant="secondary"
              onClick={() => {
                jumpTo("evidence");
              }}
            />
          </Stack>
          <Heading level={3}>Read-only by construction</Heading>
          <Text type="supporting">
            The console never signs a payment and never sets a limit: it displays what the chain and
            the read model report. Keys stay in the enclave, and the browser holds none.
          </Text>
        </VStack>
        <CodeBlock code={SAMPLE} language="typescript" title="agent_executor.ts" />
      </Grid>
    </LandingSection>
  );
}
