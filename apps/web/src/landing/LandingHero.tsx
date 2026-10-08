import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Center } from "@astryxdesign/core/Center";
import { Divider } from "@astryxdesign/core/Divider";
import { Grid } from "@astryxdesign/core/Grid";
import { Heading } from "@astryxdesign/core/Heading";
import { Section } from "@astryxdesign/core/Section";
import { Stack } from "@astryxdesign/core/Stack";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { jumpTo } from "./jumpTo";

/**
 * Opening band: what Pact is, in one headline, over the execution path it
 * guarantees.
 *
 * The four tiles are the whole product in one line — an agent proposes, policy
 * gates, settlement lands with proof — so a first-time visitor can read the
 * thesis before scrolling into the detail bands.
 */
const PIPELINE = [
  { stage: "01. ORIGIN", title: "AI agent", detail: "Agent-Alpha (0x71c…99a2)" },
  { stage: "02. INTENT", title: "Structured intent", detail: "$0.005 USDC to Coffee Demo" },
  {
    stage: "03. POLICY GUARD",
    title: "Pact rules engine",
    detail: "Cap ≤ $0.010 · allowlist matched",
  },
  { stage: "04. FINALITY", title: "Settled evidence", detail: "Block #66,170,486 · 2 proofs" },
];

function Pipeline() {
  return (
    <Card>
      <VStack gap={4}>
        <Stack direction="horizontal" gap={3} align="center" hAlign="between" wrap="wrap">
          <Stack direction="horizontal" gap={2} align="center">
            <StatusDot variant="success" label="Pipeline online" />
            <Text type="code" size="xsm">
              EXECUTION_SPECIFICATION :: PACT_DETERMINISTIC_PIPELINE
            </Text>
          </Stack>
          <Text type="code" size="xsm" color="secondary">
            EIP-712 dual-signer verification
          </Text>
        </Stack>
        <Divider />
        <Grid columns={{ minWidth: 210, repeat: "fit", max: 4 }} gap={3}>
          {PIPELINE.map((step) => (
            <Card key={step.stage}>
              <VStack gap={2}>
                <Text type="label" size="xsm" color="secondary">
                  {step.stage}
                </Text>
                <Heading level={3}>{step.title}</Heading>
                <Text type="code" size="xsm" color="secondary">
                  {step.detail}
                </Text>
              </VStack>
            </Card>
          ))}
        </Grid>
        <Divider />
        <Stack direction="horizontal" gap={3} align="center" hAlign="between" wrap="wrap">
          <Text type="supporting">
            Zero post-settlement revocations: execution requires a verifiable preflight witness.
          </Text>
          <Button
            label="View verifiable proof schema"
            variant="secondary"
            size="sm"
            onClick={() => {
              jumpTo("evidence");
            }}
          />
        </Stack>
      </VStack>
    </Card>
  );
}

export function LandingHero() {
  return (
    <Section variant="section" paddingBlock={10} dividers={["bottom"]}>
      <Center axis="horizontal" maxWidth={1152}>
        <VStack gap={8} width="100%" paddingInline={4} hAlign="center">
          <VStack gap={4} maxWidth={880} hAlign="center">
            <Badge
              variant="success"
              label="Agent action execution layer · Arc protocol compatible"
            />
            <Heading level={1} type="display-2" weight="bold" justify="center" textWrap="balance">
              Payments agents can execute. Evidence they must earn.
            </Heading>
            <Text type="large" color="secondary" justify="center">
              Pact gives AI agents a controlled way to make stablecoin payments — with
              authorization, policy checks, and on-chain evidence built directly into the flow.
            </Text>
            <Stack direction="horizontal" gap={3} wrap="wrap" hAlign="center">
              <Button label="Get started with Pact" variant="primary" size="lg" href="/console" />
              <Button
                label="See how it works"
                variant="secondary"
                size="lg"
                onClick={() => {
                  jumpTo("how-it-works");
                }}
              />
            </Stack>
            <Text type="supporting" justify="center">
              Controlled execution · policy-aware · on-chain verifiable
            </Text>
          </VStack>
          <Pipeline />
        </VStack>
      </Center>
    </Section>
  );
}
