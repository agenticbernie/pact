import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import type { ReactNode } from "react";

/** Page title block. The first heading inside AppShell's main region. */
export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <VStack gap={2}>
      <Heading level={1}>{title}</Heading>
      {description === undefined ? null : <Text type="supporting">{description}</Text>}
      {actions}
    </VStack>
  );
}
