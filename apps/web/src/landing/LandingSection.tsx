import { Center } from "@astryxdesign/core/Center";
import { Heading } from "@astryxdesign/core/Heading";
import { Section } from "@astryxdesign/core/Section";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import type { ReactNode } from "react";

/**
 * One band of the public landing page.
 *
 * Every marketing section repeats the same shape — micro-label, lead heading,
 * description, then its own content — so the shape lives here once. `Section`
 * paints the band and owns its padding; `Center` holds the content line at the
 * page's max width, which the console's frame does not provide.
 */
export function LandingSection({
  id,
  tone = "section",
  eyebrow,
  title,
  description,
  children,
}: {
  /** Anchor target: the lead heading of the band. */
  id: string;
  tone?: "section" | "muted";
  eyebrow: string;
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <Section variant={tone} paddingBlock={8} dividers={["bottom"]}>
      <Center axis="horizontal" maxWidth={1152}>
        <VStack gap={6} width="100%" paddingInline={4}>
          <VStack gap={2} maxWidth={880}>
            <Text type="label" size="xsm" color="accent">
              {eyebrow}
            </Text>
            <Heading level={2} id={id}>
              {title}
            </Heading>
            {description === undefined ? null : (
              <Text type="large" color="secondary">
                {description}
              </Text>
            )}
          </VStack>
          {children}
        </VStack>
      </Center>
    </Section>
  );
}
