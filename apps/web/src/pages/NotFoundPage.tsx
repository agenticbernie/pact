import { Card } from "@astryxdesign/core/Card";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Link } from "@astryxdesign/core/Link";
import { VStack } from "@astryxdesign/core/VStack";
import { PageHeader } from "../components/PageHeader";

/** Unknown route. The console has no surface for it, so it says so and offers the way back. */
export function NotFoundPage() {
  return (
    <VStack gap={6}>
      <PageHeader
        title="Page not found"
        description="This address is not part of the Pact console."
      />
      <Card>
        <VStack gap={3}>
          <EmptyState
            title="Nothing at this route"
            description="The read model exposes an overview, a payment list, per-card detail and per-card activity. Use the navigation rail to reach one of those."
          />
          <Link href="/console" isStandalone>
            Back to overview
          </Link>
        </VStack>
      </Card>
    </VStack>
  );
}
