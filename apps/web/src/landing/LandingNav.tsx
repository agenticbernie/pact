import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { Stack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { TopNav } from "@astryxdesign/core/TopNav";
import { BrandMark } from "../components/BrandMark";
import { AnchorText } from "./AnchorText";

/**
 * Public header for the landing page.
 *
 * It offers only what a first-time visitor can act on: the bands of this page,
 * and the one way into the product. The console keeps its own rail — this bar
 * is not a second copy of it.
 */
const ENTRIES = [
  { id: "how-it-works", label: "How it works" },
  { id: "why-pact", label: "Why Pact" },
  { id: "developers", label: "Developers" },
  { id: "security", label: "Security" },
  { id: "evidence", label: "Evidence" },
];

export function LandingNav() {
  return (
    <TopNav
      label="Pact"
      heading={
        <Stack direction="horizontal" gap={2} align="center">
          <BrandMark size={24} />
          <Text weight="semibold">Pact</Text>
          <Badge label="v1.2" variant="neutral" />
        </Stack>
      }
      startContent={
        <Stack direction="horizontal" gap={4} align="center" wrap="wrap">
          {ENTRIES.map((entry) => (
            <AnchorText key={entry.id} id={entry.id}>
              {entry.label}
            </AnchorText>
          ))}
        </Stack>
      }
      endContent={<Button label="Sign in" variant="primary" href="/console" />}
    />
  );
}
