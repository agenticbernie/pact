import { Badge } from "@astryxdesign/core/Badge";
import { Card } from "@astryxdesign/core/Card";
import { Divider } from "@astryxdesign/core/Divider";
import { Grid } from "@astryxdesign/core/Grid";
import { Heading } from "@astryxdesign/core/Heading";
import { Link } from "@astryxdesign/core/Link";
import { MetadataList, MetadataListItem } from "@astryxdesign/core/MetadataList";
import { Section } from "@astryxdesign/core/Section";
import { Stack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { MonoValue } from "../components/MonoValue";
import { LandingSection } from "./LandingSection";

/**
 * The verification chain, and one settlement to inspect.
 *
 * This is the claim the whole pitch rests on, so the right-hand panel shows the
 * artefacts rather than describing them: a block height, a transaction hash and
 * the two events that make a settlement dual-confirmed.
 */
const EXPLORER_URL = "https://explorer.testnet.arc.io";

const STEPS = [
  {
    title: "Intent signature",
    copy: "Signed with the agent's isolated session key inside the enclave, so a malicious prompt cannot forge a transaction.",
  },
  {
    title: "Policy preflight gate",
    copy: "The spending cap, throttle and allowlist are evaluated before anything reaches the mempool.",
  },
  {
    title: "Dual-event receipt",
    copy: "Two matching on-chain events are required: PaymentSettled for the payer's audit, MerchantPaymentReceived for the recipient's proof.",
  },
  {
    title: "Independent audit",
    copy: "The transaction hash resolves on any RPC node and on the Arc explorer — Pact's database is never the only witness.",
  },
];

function EventRow({ name, detail }: { name: string; detail: string }) {
  return (
    <Section variant="muted" padding={3} dividers={["top", "bottom", "start", "end"]}>
      <VStack gap={1}>
        <Text type="code" size="xsm">
          {`• ${name}`}
        </Text>
        <Text type="supporting">{detail}</Text>
      </VStack>
    </Section>
  );
}

export function LandingEvidence() {
  return (
    <LandingSection
      id="evidence"
      tone="muted"
      eyebrow="05 / FORENSIC VERIFICATION"
      title="Don't just trust the agent. Verify the result."
      description="Pact separates what an application intended from what the chain confirmed. The agent cannot simply report that it paid: it has to produce a settlement receipt that anyone can check."
    >
      <Grid columns={{ minWidth: 420, repeat: "fit", max: 2 }} gap={6}>
        <VStack gap={4}>
          {STEPS.map((step, index) => (
            <VStack key={step.title} gap={1}>
              <Stack direction="horizontal" gap={2} align="center">
                <Text type="code" size="xsm" color="accent">
                  {`0${index + 1}`}
                </Text>
                <Heading level={3}>{step.title}</Heading>
              </Stack>
              <Text type="supporting">{step.copy}</Text>
            </VStack>
          ))}
        </VStack>

        <Card>
          <VStack gap={4}>
            <Stack direction="horizontal" gap={3} align="center" hAlign="between" wrap="wrap">
              <VStack gap={1}>
                <Text type="label" size="xsm" color="secondary">
                  VERIFIABLE ON-CHAIN SETTLEMENT
                </Text>
                <Heading level={3}>Settlement evidence proof</Heading>
              </VStack>
              <Badge variant="success" label="DUAL-EVENT CONFIRMED" />
            </Stack>
            <MetadataList columns="multi">
              <MetadataListItem label="Network">Arc testnet</MetadataListItem>
              <MetadataListItem label="Chain id">
                <Text type="code" hasTabularNumbers>
                  5042002
                </Text>
              </MetadataListItem>
              <MetadataListItem label="Block height">
                <Text type="code" hasTabularNumbers>
                  #66,170,486
                </Text>
              </MetadataListItem>
            </MetadataList>
            <Divider />
            <VStack gap={1}>
              <Text type="label" size="xsm" color="secondary">
                TRANSACTION HASH
              </Text>
              <MonoValue value="0x947a92c4d1f0a7be6c3f8e21a55d0b94f7c6e18d2a3b45f8901c7d6e5a4b3c72" />
            </VStack>
            <VStack gap={2}>
              <EventRow
                name="PaymentSettled"
                detail="payer 0x71ca…99a2 · amount 5000 base units (0.005 USDC) · cardId 2"
              />
              <EventRow
                name="MerchantPaymentReceived"
                detail="merchant Coffee Demo · invoiceRef #CFE-9841 · status final"
              />
            </VStack>
            <Stack direction="horizontal" gap={3} align="center" hAlign="between" wrap="wrap">
              <Text type="supporting">Verifiable across any RPC node.</Text>
              <Link href={EXPLORER_URL}>View the settlement on the Arc explorer</Link>
            </Stack>
          </VStack>
        </Card>
      </Grid>
    </LandingSection>
  );
}
