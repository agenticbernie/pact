import { Card } from "@astryxdesign/core/Card";
import { Grid } from "@astryxdesign/core/Grid";
import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { LandingSection } from "./LandingSection";

/**
 * Who the infrastructure is for.
 *
 * Four teams with the same problem — letting software act with money without
 * handing it an unrestricted wallet.
 */
const SEGMENTS = [
  {
    index: "01",
    title: "Agent builders",
    copy: "Give autonomous LangChain, AutoGen or bespoke LLM agents real payment capability without risking a drained wallet.",
  },
  {
    index: "02",
    title: "Web3 developers",
    copy: "Build programmatic stablecoin micropayment loops around allowlists, spend caps and on-chain receipts.",
  },
  {
    index: "03",
    title: "Fintech teams",
    copy: "Run programmable credit envelopes with deterministic audit logging for agent operations.",
  },
  {
    index: "04",
    title: "Researchers",
    copy: "Study verifiable autonomous action, evidence-driven incentives and safety bounds in multi-agent networks.",
  },
];

export function LandingAudience() {
  return (
    <LandingSection
      id="who-it-is-for"
      eyebrow="08 / TARGETED ECOSYSTEMS"
      title="Designed for teams advancing autonomous systems."
      description="Whether you are building agentic workflows or the financial rails they will run on."
    >
      <Grid columns={{ minWidth: 250, repeat: "fit", max: 4 }} gap={4}>
        {SEGMENTS.map((segment) => (
          <Card key={segment.index}>
            <VStack gap={2}>
              <Text type="code" size="2xl" color="accent" hasTabularNumbers>
                {segment.index}
              </Text>
              <Heading level={3}>{segment.title}</Heading>
              <Text type="supporting">{segment.copy}</Text>
            </VStack>
          </Card>
        ))}
      </Grid>
    </LandingSection>
  );
}
