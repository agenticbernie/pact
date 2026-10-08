import { Card as CardSurface } from "@astryxdesign/core/Card";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Heading } from "@astryxdesign/core/Heading";
import { Link } from "@astryxdesign/core/Link";
import { MetadataList, MetadataListItem } from "@astryxdesign/core/MetadataList";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { useParams } from "react-router-dom";
import { useChainConfig } from "../api/hooks";
import { getCard, listCardPayments } from "../api/read";
import { useQuery } from "../api/useQuery";
import { formatAmount } from "../components/AmountText";
import { ConnectGate } from "../components/ConnectGate";
import { EvidencePanel } from "../components/EvidencePanel";
import { FreshnessNotice } from "../components/FreshnessNotice";
import { LoadFailure } from "../components/LoadFailure";
import { MonoValue } from "../components/MonoValue";
import { PageHeader } from "../components/PageHeader";
import { PaymentPanel } from "../components/PaymentPanel";
import { PaymentTable } from "../components/PaymentTable";
import { StatusToken } from "../components/StatusToken";
import { formatDateTime, normalizeTimestamp, subtractBaseUnits } from "../lib/format";
import { cardState } from "../lib/status";
import { useSession } from "../session/SessionProvider";

function CardDetail({ cardId }: { cardId: string }) {
  const cardQuery = useQuery((signal) => getCard(cardId, signal), [cardId]);
  const paymentsQuery = useQuery((signal) => listCardPayments(cardId, signal), [cardId]);
  const configQuery = useChainConfig();
  const config = configQuery.state.status === "ready" ? configQuery.state.data : null;

  if (cardQuery.state.status === "loading") {
    return <Text type="supporting">Loading card…</Text>;
  }
  if (cardQuery.state.status === "failed") {
    return (
      <LoadFailure
        title="Card could not be read"
        message={cardQuery.state.message}
        onRetry={cardQuery.reload}
      />
    );
  }

  const { card, latestIndexedBlock, stale } = cardQuery.state.data;
  const view = cardState(card.status);
  const remaining = subtractBaseUnits(card.verifiedCredit, card.spent);

  return (
    <VStack gap={6}>
      <FreshnessNotice latestIndexedBlock={latestIndexedBlock} stale={stale} />

      <CardSurface>
        <VStack gap={4}>
          <VStack gap={2}>
            <StatusToken label={view.label} tone={view.tone} description={`Card status ${card.status}`} />
            <Link href={`/cards/${encodeURIComponent(cardId)}/activity`}>On-chain activity</Link>
          </VStack>
          <MetadataList columns="multi">
            <MetadataListItem label="Verified credit">{formatAmount(card.verifiedCredit, card.asset)}</MetadataListItem>
            <MetadataListItem label="Spent">{formatAmount(card.spent, card.asset)}</MetadataListItem>
            <MetadataListItem label="Remaining">{formatAmount(remaining, card.asset)}</MetadataListItem>
            <MetadataListItem label="Per transaction">
              {formatAmount(card.perTransactionLimit, card.asset)}
            </MetadataListItem>
            <MetadataListItem label="Owner cap">
              {formatAmount(card.ownerConfiguredCap, card.asset)}
            </MetadataListItem>
            <MetadataListItem label="Asset">
              <Text type="code">{card.asset}</Text>
            </MetadataListItem>
            <MetadataListItem label="Policy version">
              <Text type="code" hasTabularNumbers>
                {String(card.policyVersion)}
              </Text>
            </MetadataListItem>
            <MetadataListItem label="Expires">
              <Text type="supporting">{formatDateTime(normalizeTimestamp(card.expiresAt))}</Text>
            </MetadataListItem>
            <MetadataListItem label="Updated">
              <Text type="supporting">{formatDateTime(normalizeTimestamp(card.updatedAt))}</Text>
            </MetadataListItem>
            <MetadataListItem label="Source block">
              <Text type="code" hasTabularNumbers>
                {card.sourceBlock.toLocaleString()}
              </Text>
            </MetadataListItem>
            <MetadataListItem label="Agent">
              <MonoValue value={card.agentId} />
            </MetadataListItem>
            <MetadataListItem label="Owner">
              <MonoValue value={card.ownerAddress} />
            </MetadataListItem>
          </MetadataList>
        </VStack>
      </CardSurface>

      <VStack gap={3}>
        <Heading level={2}>Evidence</Heading>
        <CardSurface>
          <EvidencePanel config={config} />
        </CardSurface>
      </VStack>

      <PaymentPanel
        cardId={cardId}
        card={card}
        config={config}
        onSettled={() => paymentsQuery.reload()}
      />

      <VStack gap={3}>
        <Heading level={2}>Payment attempts</Heading>
        {paymentsQuery.state.status === "loading" ? (
          <Text type="supporting">Loading payment attempts…</Text>
        ) : null}
        {paymentsQuery.state.status === "failed" ? (
          <LoadFailure
            title="Payment attempts could not be read"
            message={paymentsQuery.state.message}
            onRetry={paymentsQuery.reload}
          />
        ) : null}
        {paymentsQuery.state.status === "ready" ? (
          paymentsQuery.state.data.payments.length === 0 ? (
            <CardSurface>
              <EmptyState
                title="No attempts on this card"
                description="Attempts appear here once the agent submits an intent against the card policy."
              />
            </CardSurface>
          ) : (
            <PaymentTable payments={paymentsQuery.state.data.payments} />
          )
        ) : null}
      </VStack>
    </VStack>
  );
}

export function CardPage() {
  const { state } = useSession();
  const { cardId } = useParams<{ cardId: string }>();
  if (cardId === undefined) {
    return <Text type="supporting">This route needs a card id.</Text>;
  }
  return (
    <VStack gap={6}>
      <PageHeader
        title={`Card ${cardId}`}
        description="Policy, verified credit and payment attempts for this card, exactly as the read model reports them."
      />
      {state.status === "active" ? (
        <CardDetail cardId={cardId} />
      ) : (
        <ConnectGate
          title="Sign in with the owner wallet"
          description="A card is readable only by the wallet that owns it."
        />
      )}
    </VStack>
  );
}
