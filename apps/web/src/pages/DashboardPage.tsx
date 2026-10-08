import { Card } from "@astryxdesign/core/Card";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { usePaymentsForCards, useOwnerCards } from "../api/hooks";
import { CardTable } from "../components/CardTable";
import { ConnectGate } from "../components/ConnectGate";
import { FreshnessNotice } from "../components/FreshnessNotice";
import { LoadFailure } from "../components/LoadFailure";
import { PageHeader } from "../components/PageHeader";
import { PaymentTable } from "../components/PaymentTable";
import { useSession } from "../session/SessionProvider";

const RECENT_PAYMENT_LIMIT = 5;

function Overview() {
  const cardsQuery = useOwnerCards(true);
  const cards = cardsQuery.state.status === "ready" ? (cardsQuery.state.data?.cards ?? []) : [];
  const cardIds = cards.map((card) => card.cardId);
  const paymentsQuery = usePaymentsForCards(cardIds);

  if (cardsQuery.state.status === "loading") {
    return <Text type="supporting">Loading card state…</Text>;
  }
  if (cardsQuery.state.status === "failed") {
    return (
      <LoadFailure
        title="Card state could not be read"
        message={cardsQuery.state.message}
        onRetry={cardsQuery.reload}
      />
    );
  }

  const cardsData = cardsQuery.state.data;

  return (
    <VStack gap={6}>
      <VStack gap={2}>
        {cardsData === null ? null : (
          <FreshnessNotice latestIndexedBlock={cardsData.latestIndexedBlock} stale={cardsData.stale} />
        )}
      </VStack>

      <VStack gap={3}>
        <Heading level={2}>Cards</Heading>
        {cards.length === 0 ? (
          <Card>
            <EmptyState
              title="No cards for this wallet"
              description="The read model has no card owned by the connected wallet. Activate a card through the controller before payment activity appears here."
            />
          </Card>
        ) : (
          <CardTable cards={cards} />
        )}
      </VStack>

      <VStack gap={3}>
        <Heading level={2}>Latest payments</Heading>
        {paymentsQuery.state.status === "loading" ? (
          <Text type="supporting">Loading payment history…</Text>
        ) : null}
        {paymentsQuery.state.status === "failed" ? (
          <LoadFailure
            title="Payment history could not be read"
            message={paymentsQuery.state.message}
            onRetry={paymentsQuery.reload}
          />
        ) : null}
        {paymentsQuery.state.status === "ready" ? (
          paymentsQuery.state.data === null || paymentsQuery.state.data.payments.length === 0 ? (
            <Card>
              <EmptyState
                title="No payment attempts yet"
                description="Every attempt is listed here with the settlement state the read API derives from the receipt and the indexed event."
              />
            </Card>
          ) : (
            <VStack gap={2}>
              {paymentsQuery.state.data.stale ? (
                <FreshnessNotice latestIndexedBlock={null} stale={true} />
              ) : null}
              <PaymentTable payments={paymentsQuery.state.data.payments.slice(0, RECENT_PAYMENT_LIMIT)} />
            </VStack>
          )
        ) : null}
      </VStack>
    </VStack>
  );
}

export function DashboardPage() {
  const { state } = useSession();
  return (
    <VStack gap={6}>
      <PageHeader
        title="Card operations"
        description="Owner-scoped read model: card state, verified credit and payment settlement as the read API reports them."
      />
      {state.status === "active" ? (
        <Overview />
      ) : (
        <ConnectGate
          title="Sign in with the owner wallet"
          description="Card, payment and activity data is scoped to the wallet that signs the session challenge."
        />
      )}
    </VStack>
  );
}
