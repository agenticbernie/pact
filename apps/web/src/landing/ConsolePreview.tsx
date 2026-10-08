import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Divider } from "@astryxdesign/core/Divider";
import { Grid } from "@astryxdesign/core/Grid";
import { Link } from "@astryxdesign/core/Link";
import { Stack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { TelemetryStat } from "../components/TelemetryStat";
import { LandingSection } from "./LandingSection";
import { jumpTo } from "./jumpTo";

/**
 * What the operator sees once an agent has acted.
 *
 * The figures are the settled Coffee Demo payment the lane actually executed
 * (block 66,170,486), so the band shows the real read model rather than a
 * mocked-up screen. It is a still, not a live view — the live one is behind the
 * session gate.
 */
export function ConsolePreview() {
  return (
    <LandingSection
      id="preview"
      eyebrow="04 / OPERATOR VISIBILITY"
      title="See what your agent actually did."
      description="Card caps, preflight assertions and the settlement trace, reported the way the read API reports them — no local reconstruction, no inferred success."
    >
      <VStack gap={4}>
        <Stack direction="horizontal" gap={3} align="center" hAlign="between" wrap="wrap">
          <Text type="code" size="xsm" color="secondary">
            pact.console.arc-testnet / dashboard
          </Text>
          <Button
            label="Open the operator console"
            variant="primary"
            size="sm"
            href="/console"
          />
        </Stack>

        <Grid columns={{ minWidth: 220, repeat: "fit", max: 4 }} gap={3}>
          <TelemetryStat
            label="AVAILABLE CREDIT"
            value="0.095"
            unit="USDC"
            note="$0.005 spent of the owner cap"
          />
          <TelemetryStat
            label="CARD STATE"
            value="Active"
            note="Card #2 · single agent bound"
          />
          <TelemetryStat label="PER-TX LIMIT" value="0.010" unit="USDC" note="Hard stop on breach" />
          <TelemetryStat
            label="AGENT AUTHORITY"
            value="0x71ca…99a2"
            note="Enclave-signed session"
          />
        </Grid>

        <Card>
          <VStack gap={3}>
            <Stack direction="horizontal" gap={3} align="center" hAlign="between" wrap="wrap">
              <Stack direction="horizontal" gap={2} align="center" wrap="wrap">
                <Badge variant="success" label="SETTLED · CHAIN-CONFIRMED" />
                <Text type="supporting">Merchant: Coffee Demo (#POS-4891)</Text>
              </Stack>
              <Text type="code" size="xsm" color="secondary">
                block #66,170,486 · tx 0x947a92…dc72
              </Text>
            </Stack>
            <Divider />
            <Grid columns={{ minWidth: 220, repeat: "fit", max: 4 }} gap={3}>
              <VStack gap={1}>
                <Text type="label" size="xsm" color="secondary">
                  AMOUNT SETTLED
                </Text>
                <Text type="code" size="xl" weight="semibold" hasTabularNumbers>
                  $0.005 USDC
                </Text>
              </VStack>
              <VStack gap={1}>
                <Text type="label" size="xsm" color="secondary">
                  POLICY ASSERTIONS
                </Text>
                <Text type="code" size="xsm">
                  ✓ limit check ($0.005 ≤ $0.010)
                </Text>
                <Text type="code" size="xsm">
                  ✓ allowlist matched
                </Text>
              </VStack>
              <VStack gap={1}>
                <Text type="label" size="xsm" color="secondary">
                  EVENTS EMITTED
                </Text>
                <Text type="code" size="xsm">
                  PaymentSettled
                </Text>
                <Text type="code" size="xsm">
                  MerchantPaymentReceived
                </Text>
              </VStack>
              <VStack gap={1}>
                <Text type="label" size="xsm" color="secondary">
                  NEXT
                </Text>
                <Text>
                  <Link href="#evidence" onClick={() => { jumpTo("evidence"); }}>
                    Inspect the evidence
                  </Link>
                </Text>
              </VStack>
            </Grid>
            <Divider />
            <Stack direction="horizontal" gap={3} align="center" hAlign="between" wrap="wrap">
              <Text type="code" size="xsm" color="secondary">
                Indexer 100% synced · mean preflight latency 42ms
              </Text>
              <Link href="/console">Open the console</Link>
            </Stack>
          </VStack>
        </Card>
      </VStack>
    </LandingSection>
  );
}
