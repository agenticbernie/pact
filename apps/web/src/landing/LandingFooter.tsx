import { Button } from "@astryxdesign/core/Button";
import { Divider } from "@astryxdesign/core/Divider";
import { Grid } from "@astryxdesign/core/Grid";
import { Link } from "@astryxdesign/core/Link";
import { Section } from "@astryxdesign/core/Section";
import { Stack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { BrandMark } from "../components/BrandMark";
import { AnchorText } from "./AnchorText";

/**
 * Landing page footer.
 *
 * Every entry points at a surface that exists — a band of this page, or a route
 * of the console. There are no placeholder links, because a first-time visitor
 * who follows one should never land nowhere.
 */
const COLUMNS: { title: string; anchors: { id: string; label: string }[]; routes: { label: string; href: string }[] }[] =
  [
    {
      title: "Product",
      anchors: [{ id: "evidence", label: "On-chain evidence" }],
      routes: [
        { label: "Operator console", href: "/console" },
        { label: "Payments ledger", href: "/payments" },
      ],
    },
    {
      title: "Developers",
      anchors: [{ id: "developers", label: "Developer quickstart" }],
      routes: [{ label: "Operator console", href: "/console" }],
    },
    {
      title: "Resources",
      anchors: [
        { id: "how-it-works", label: "How it works" },
        { id: "security", label: "Security model" },
      ],
      routes: [{ label: "System telemetry", href: "/console" }],
    },
  ];

function Column({ column }: { column: (typeof COLUMNS)[number] }) {
  return (
    <VStack gap={2}>
      <Text type="label" size="xsm" color="secondary">
        {column.title.toUpperCase()}
      </Text>
      {column.anchors.map((anchor) => (
        <AnchorText key={anchor.id} id={anchor.id}>
          {anchor.label}
        </AnchorText>
      ))}
      {column.routes.map((route) => (
        <Text key={`${route.label}-${route.href}`}>
          <Link href={route.href}>{route.label}</Link>
        </Text>
      ))}
    </VStack>
  );
}

export function LandingFooter() {
  return (
    <Section variant="section" paddingBlock={8} dividers={["top"]}>
      <VStack gap={6}>
        <Grid columns={{ minWidth: 200, repeat: "fit", max: 4 }} gap={6}>
          <VStack gap={3}>
            <Stack direction="horizontal" gap={2} align="center">
              <BrandMark size={22} />
              <Text weight="semibold">Pact</Text>
            </Stack>
            <Text type="supporting">
              Payments agents can execute. Evidence they must earn. Infrastructure for verifiable,
              policy-governed agentic settlement.
            </Text>
            <Text type="supporting">Arc testnet operational · indexer 100% synced</Text>
            <Button label="Sign in" variant="secondary" size="sm" href="/console" />
          </VStack>
          {COLUMNS.map((column) => (
            <Column key={column.title} column={column} />
          ))}
        </Grid>
        <Divider />
        <Stack direction="horizontal" gap={4} align="center" hAlign="between" wrap="wrap">
          <Text type="supporting">
            © 2026 Pact. Testnet-only: no card, credit or payment here carries monetary value.
          </Text>
          <AnchorText id="why-pact">Why Pact</AnchorText>
        </Stack>
      </VStack>
    </Section>
  );
}
