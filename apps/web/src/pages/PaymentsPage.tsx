import { Card as CardSurface } from "@astryxdesign/core/Card";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { useOwnerCards, usePaymentsForCards } from "../api/hooks";
import { ConnectGate } from "../components/ConnectGate";
import { FreshnessNotice } from "../components/FreshnessNotice";
import { LoadFailure } from "../components/LoadFailure";
import { PageHeader } from "../components/PageHeader";
import { PaymentTable } from "../components/PaymentTable";
import { useSession } from "../session/SessionProvider";

function AllPayments() {
  const cardsQuery = useOwnerCards(true);
  const cards = cardsQuery.state.status === "ready" ? (cardsQuery.state.data?.cards ?? []) : [];
  const paymentsQuery = usePaymentsForCards(cards.map((card) => card.cardId));

  if (cardsQuery.state.status === "failed") {
    return (
      <LoadFailure
        title="Cards could not be read"
        message={cardsQuery.state.message}
        onRetry={cardsQuery.reload}
      />
    );
  }
  if (cardsQuery.state.status === "loading" || paymentsQuery.state.status === "loading") {
    return <Text type="supporting">Loading payment history…</Text>;
  }
  if (paymentsQuery.state.status === "failed") {
    return (
      <LoadFailure
        title="Payment history could not be read"
        message={paymentsQuery.state.message}
        onRetry={() => {
          cardsQuery.reload();
          paymentsQuery.reload();
        }}
      />
    );
  }
  const overview = paymentsQuery.state.data;
  if (overview === null || overview.payments.length === 0) {
    return (
      <CardSurface>
        <EmptyState
          title="No payment attempts yet"
          description="Attempts across every card owned by this wallet appear here, newest first."
        />
      </CardSurface>
    );
  }
  return (
    <VStack gap={3}>
      <FreshnessNotice latestIndexedBlock={overview.latestIndexedBlock} stale={overview.stale} />
      <PaymentTable payments={overview.payments} />
    </VStack>
  );
}

export function PaymentsPage() {
  const { state } = useSession();
  return (
    <VStack gap={6}>
      <PageHeader
        title="Payments"
        description="Every attempt across the owner's cards. Settlement is derived from the chain, never from the application row."
      />
      {state.status === "active" ? (
        <AllPayments />
      ) : (
        <ConnectGate
          title="Sign in with the owner wallet"
          description="Payment history is scoped to the wallet that signs the session challenge."
        />
      )}
    </VStack>
  );
}
