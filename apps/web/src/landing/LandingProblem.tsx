import { Badge } from "@astryxdesign/core/Badge";
import { Card } from "@astryxdesign/core/Card";
import { Grid } from "@astryxdesign/core/Grid";
import { Heading } from "@astryxdesign/core/Heading";
import { Stack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { LandingSection } from "./LandingSection";

/**
 * The problem, stated as a contrast.
 *
 * A visitor has to see why handing an agent a private key is the wrong shape
 * before the guarantees mean anything, so the two models are shown side by side
 * with the same three questions asked of each.
 */
function Bullet({ kind, children }: { kind: "doubt" | "assurance"; children: string }) {
  return (
    <Stack direction="horizontal" gap={2} align="start">
      <Text color={kind === "doubt" ? "secondary" : "accent"}>
        {kind === "doubt" ? "✕" : "✓"}
      </Text>
      <Text type="supporting">{children}</Text>
    </Stack>
  );
}

export function LandingProblem() {
  return (
    <LandingSection
      id="the-core-challenge"
      tone="muted"
      eyebrow="01 / THE CORE CHALLENGE"
      title="AI agents can act. Payments need proof."
      description="Agents are becoming capable of taking real actions — they can search, negotiate, call APIs, and coordinate multi-step workflows. Money movement is different: financial execution requires boundaries, deterministic limits, and cryptographically irrefutable proof."
    >
      <Grid columns={{ minWidth: 400, repeat: "fit", max: 2 }} gap={4}>
        <Card>
          <VStack gap={4}>
            <Stack direction="horizontal" gap={3} align="center" hAlign="between" wrap="wrap">
              <Badge variant="error" label="TRADITIONAL AGENT STACK" />
              <Text type="supporting">High operational risk</Text>
            </Stack>
            <VStack gap={2}>
              <Heading level={3}>Direct API key &amp; private key delegation</Heading>
              <Text type="supporting">
                Agents are handed live private keys or raw card credentials. A looping prompt or a
                hallucinated order can drain an operational wallet with no preflight recourse.
              </Text>
            </VStack>
            <Text type="code" size="xsm" color="secondary">
              AI prompt → raw key / API → irrevocable drain
            </Text>
            <VStack gap={2}>
              <Bullet kind="doubt">No per-transaction or velocity limit at runtime</Bullet>
              <Bullet kind="doubt">
                No merchant allowlist — the agent can pay any address
              </Bullet>
              <Bullet kind="doubt">
                No cryptographic proof the intended counterparty was paid
              </Bullet>
            </VStack>
          </VStack>
        </Card>

        <Card>
          <VStack gap={4}>
            <Stack direction="horizontal" gap={3} align="center" hAlign="between" wrap="wrap">
              <Badge variant="info" label="PACT INFRASTRUCTURE" />
              <Text type="supporting">Deterministic containment</Text>
            </Stack>
            <VStack gap={2}>
              <Heading level={3}>Policy-governed intent &amp; evidence settlement</Heading>
              <Text type="supporting">
                Agents create structured payment intents. Pact validates the spending cap, the
                merchant allowlist and the EVM preflight before anything is signed. An action
                settles only once verifiable evidence is submitted.
              </Text>
            </VStack>
            <Text type="code" size="xsm" color="accent">
              Intent → policy → preflight → evidence
            </Text>
            <VStack gap={2}>
              <Bullet kind="assurance">
                Spending caps, velocity ceilings and counterparty allowlists are enforced on-chain
              </Bullet>
              <Bullet kind="assurance">
                Fail-closed: an out-of-policy intent is intercepted before it costs gas
              </Bullet>
              <Bullet kind="assurance">
                Dual-event receipts emit forensic evidence for every micro-dollar spent
              </Bullet>
            </VStack>
          </VStack>
        </Card>
      </Grid>
    </LandingSection>
  );
}
