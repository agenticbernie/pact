import { Card } from "@astryxdesign/core/Card";
import { Grid } from "@astryxdesign/core/Grid";
import { Heading } from "@astryxdesign/core/Heading";
import { Stack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { LandingSection } from "./LandingSection";

/**
 * The settlement lifecycle, in six stages.
 *
 * Each stage names what it contributes and the machine-level artefact it
 * leaves behind, because the promise is that nothing here is a black box: the
 * agent never holds unrestricted custody at any point of the sequence.
 */
const STAGES = [
  {
    index: "STAGE 01",
    kind: "Payload format",
    title: "Structured intent",
    copy: "The agent proposes a payment intent with explicit parameters: recipient, asset, exact amount and cryptographic nonce.",
    code: 'PactIntent.create({ cardId: 2, amount: 0.005, merchant: "0x3d…7a" })',
  },
  {
    index: "STAGE 02",
    kind: "EVM simulation",
    title: "Preflight verification",
    copy: "Pact simulates the call against the current state first, so an execution that cannot succeed is never broadcast.",
    code: "preflightCheck: PASS · gas 48,210 · latency 42ms",
  },
  {
    index: "STAGE 03",
    kind: "Rules & enclave",
    title: "Authorization scope",
    copy: "The intent is evaluated against the card's allowlist, spending cap and frequency throttle. Out-of-bounds requests are refused.",
    code: "assert(amount <= perTxCap && allowlist.has(target))",
  },
  {
    index: "STAGE 04",
    kind: "RPC broadcast",
    title: "Deterministic execution",
    copy: "Only a validated intent is signed inside the policy enclave and broadcast to the settlement network.",
    code: "broadcastTx(signedBundle, rpc.testnet.arc.network)",
  },
  {
    index: "STAGE 05",
    kind: "Receipt ingestion",
    title: "Cryptographic proof",
    copy: "The inclusion receipt is captured and its decoded logs prove which counterparty contract consumed the balance.",
    code: "Event: PaymentSettled(0x71c…99a2, $0.005 USDC)",
  },
  {
    index: "STAGE 06",
    kind: "Irreversible",
    title: "Chain finality",
    copy: "Settlement reaches consensus finality: no chargebacks, no post-settlement revocations, and both sides hold the receipt.",
    code: "Finalized on Arc L2 · 12 confirmations",
  },
];

export function LandingSteps() {
  return (
    <LandingSection
      id="how-it-works"
      eyebrow="02 / ARCHITECTURE & LIFECYCLE"
      title="From intent to settlement."
      description="A deterministic six-stage lifecycle: the agent never holds unrestricted custody, and the operator keeps mathematical certainty about what was spent."
    >
      <Grid columns={{ minWidth: 320, repeat: "fit", max: 3 }} gap={4}>
        {STAGES.map((stage) => (
          <Card key={stage.index}>
            <VStack gap={3}>
              <Stack direction="horizontal" gap={2} align="center" hAlign="between" wrap="wrap">
                <Text type="label" size="xsm" color="accent">
                  {stage.index}
                </Text>
                <Text type="supporting">{stage.kind}</Text>
              </Stack>
              <VStack gap={2}>
                <Heading level={3}>{stage.title}</Heading>
                <Text type="supporting">{stage.copy}</Text>
              </VStack>
              <Text type="code" size="xsm" color="secondary">
                {stage.code}
              </Text>
            </VStack>
          </Card>
        ))}
      </Grid>
    </LandingSection>
  );
}
