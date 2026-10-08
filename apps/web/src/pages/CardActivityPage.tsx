import { Card as CardSurface } from "@astryxdesign/core/Card";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Link } from "@astryxdesign/core/Link";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { useParams } from "react-router-dom";
import { useChainConfig } from "../api/hooks";
import { listCardActivity } from "../api/read";
import { useQuery } from "../api/useQuery";
import { ActivityList } from "../components/ActivityList";
import { ConnectGate } from "../components/ConnectGate";
import { FreshnessNotice } from "../components/FreshnessNotice";
import { LoadFailure } from "../components/LoadFailure";
import { PageHeader } from "../components/PageHeader";
import { useSession } from "../session/SessionProvider";

/**
 * The raw chain trail for one card: every event the indexer decoded, newest
 * first. This is the evidence the card page's credit and payment states rest on,
 * so it is shown without commentary.
 */
function CardActivity({ cardId }: { cardId: string }) {
  const activityQuery = useQuery((signal) => listCardActivity(cardId, signal), [cardId]);
  const configQuery = useChainConfig();
  const explorerUrl =
    configQuery.state.status === "ready" ? configQuery.state.data.explorerUrl : undefined;

  if (activityQuery.state.status === "loading") {
    return <Text type="supporting">Loading on-chain activity…</Text>;
  }
  if (activityQuery.state.status === "failed") {
    return (
      <LoadFailure
        title="Activity could not be read"
        message={activityQuery.state.message}
        onRetry={activityQuery.reload}
      />
    );
  }

  const { items, latestIndexedBlock, stale } = activityQuery.state.data;
  return (
    <VStack gap={4}>
      <FreshnessNotice latestIndexedBlock={latestIndexedBlock} stale={stale} />
      <CardSurface>
        {items.length === 0 ? (
          <EmptyState
            title="No indexed events for this card"
            description="The indexer has decoded no chain event for this card yet."
          />
        ) : (
          <ActivityList
            items={items}
            {...(explorerUrl === undefined ? {} : { explorerUrl })}
          />
        )}
      </CardSurface>
    </VStack>
  );
}

export function CardActivityPage() {
  const { state } = useSession();
  const { cardId } = useParams<{ cardId: string }>();
  if (cardId === undefined) {
    return <Text type="supporting">This route needs a card id.</Text>;
  }
  return (
    <VStack gap={6}>
      <PageHeader
        title={`Card ${cardId} activity`}
        description="Every chain event the indexer decoded for this card, newest first."
        actions={<Link href={`/cards/${encodeURIComponent(cardId)}`}>Back to card</Link>}
      />
      {state.status === "active" ? (
        <CardActivity cardId={cardId} />
      ) : (
        <ConnectGate
          title="Sign in with the owner wallet"
          description="A card's activity is readable only by the wallet that owns it."
        />
      )}
    </VStack>
  );
}
