import { Card as CardSurface } from "@astryxdesign/core/Card";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Heading } from "@astryxdesign/core/Heading";
import { Link } from "@astryxdesign/core/Link";
import { MetadataList, MetadataListItem } from "@astryxdesign/core/MetadataList";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { useParams } from "react-router-dom";
import { useChainConfig } from "../api/hooks";
import { getPayment } from "../api/read";
import { useQuery } from "../api/useQuery";
import { ActivityList } from "../components/ActivityList";
import { formatAmount } from "../components/AmountText";
import { ConnectGate } from "../components/ConnectGate";
import { EvidencePanel } from "../components/EvidencePanel";
import { FreshnessNotice } from "../components/FreshnessNotice";
import { LoadFailure } from "../components/LoadFailure";
import { MonoValue } from "../components/MonoValue";
import { PageHeader } from "../components/PageHeader";
import { StatusToken } from "../components/StatusToken";
import { formatDateTime, normalizeTimestamp } from "../lib/format";
import { merchantLabel } from "../lib/merchants";
import { paymentState } from "../lib/status";
import { useSession } from "../session/SessionProvider";

/**
 * One payment attempt, shown as a receipt.
 *
 * The settlement chip is the read API's answer (receipt + indexed event), never
 * the application row's status, and the decoded events below are the raw
 * evidence behind that answer — so a reviewer can check the chain independently.
 */
function PaymentReceipt({ paymentId }: { paymentId: string }) {
  const paymentQuery = useQuery((signal) => getPayment(paymentId, signal), [paymentId]);
  const configQuery = useChainConfig();
  const config = configQuery.state.status === "ready" ? configQuery.state.data : null;

  if (paymentQuery.state.status === "loading") {
    return <Text type="supporting">Loading payment…</Text>;
  }
  if (paymentQuery.state.status === "failed") {
    return (
      <LoadFailure
        title="Payment could not be read"
        message={paymentQuery.state.message}
        onRetry={paymentQuery.reload}
      />
    );
  }

  const payment = paymentQuery.state.data;
  const truth = paymentState(payment);
  const explorerUrl = config?.explorerUrl;
  const transactionUrl =
    payment.txHash !== undefined && explorerUrl !== undefined
      ? `${explorerUrl}/tx/${payment.txHash}`
      : undefined;

  return (
    <VStack gap={6}>
      <FreshnessNotice
        latestIndexedBlock={payment.latestIndexedBlock ?? null}
        stale={payment.latestIndexedBlock === undefined}
      />

      <CardSurface>
        <VStack gap={4}>
          <VStack gap={2}>
            <StatusToken label={truth.label} tone={truth.tone} description={truth.detail} />
            <Text type="supporting">{truth.detail}</Text>
          </VStack>

          <MetadataList columns="multi">
            <MetadataListItem label="Amount">
              {formatAmount(payment.amountBaseUnits, payment.asset)}
            </MetadataListItem>
            <MetadataListItem label="Merchant">
              {merchantLabel(payment.merchantId)}
            </MetadataListItem>
            <MetadataListItem label="Card">
              <Link href={`/cards/${encodeURIComponent(payment.cardId)}`}>
                {`Card ${payment.cardId}`}
              </Link>
            </MetadataListItem>
            <MetadataListItem label="Attempt row">
              <Text type="supporting">{payment.attemptStatus}</Text>
            </MetadataListItem>
            <MetadataListItem label="Chain id">
              <Text type="code" hasTabularNumbers>
                {String(payment.chainId)}
              </Text>
            </MetadataListItem>
            <MetadataListItem label="Nonce">
              <MonoValue value={payment.nonce} />
            </MetadataListItem>
            <MetadataListItem label="Intent">
              <Link href={`/intents/${encodeURIComponent(payment.intentId)}`}>
                {payment.intentId}
              </Link>
            </MetadataListItem>
            <MetadataListItem label="Intent hash">
              <MonoValue value={payment.intentHash} />
            </MetadataListItem>
            <MetadataListItem label="Created">
              <Text type="supporting">
                {formatDateTime(
                  normalizeTimestamp(payment.attemptCreatedAt ?? payment.intentCreatedAt),
                )}
              </Text>
            </MetadataListItem>
            <MetadataListItem label="Updated">
              <Text type="supporting">
                {formatDateTime(normalizeTimestamp(payment.attemptUpdatedAt))}
              </Text>
            </MetadataListItem>
            <MetadataListItem label="Intent expires">
              <Text type="supporting">
                {formatDateTime(normalizeTimestamp(payment.intentExpiresAt))}
              </Text>
            </MetadataListItem>
          </MetadataList>
        </VStack>
      </CardSurface>

      <VStack gap={3}>
        <Heading level={2}>Transaction</Heading>
        <CardSurface>
          <VStack gap={3}>
            {payment.txHash === undefined ? (
              <Text type="supporting">
                No transaction was broadcast for this attempt, so there is no receipt or event to
                verify.
              </Text>
            ) : (
              <MetadataList columns="multi">
                <MetadataListItem label="Hash">
                  <MonoValue value={payment.txHash} />
                </MetadataListItem>
                <MetadataListItem label="Receipt">
                  <Text type="supporting">
                    {payment.receiptConfirmed === true ? "Confirmed" : "Not confirmed"}
                  </Text>
                </MetadataListItem>
                <MetadataListItem label="Indexed event">
                  <Text type="supporting">
                    {payment.indexedPaymentEvent === true ? "Present" : "Not indexed"}
                  </Text>
                </MetadataListItem>
                {payment.blockNumber === undefined ? null : (
                  <MetadataListItem label="Block">
                    <Text type="code" hasTabularNumbers>
                      {payment.blockNumber.toLocaleString()}
                    </Text>
                  </MetadataListItem>
                )}
              </MetadataList>
            )}
            {transactionUrl === undefined ? null : (
              <Link href={transactionUrl} isExternalLink>
                Verify this transaction on the explorer
              </Link>
            )}
          </VStack>
        </CardSurface>
      </VStack>

      <VStack gap={3}>
        <Heading level={2}>Indexed events</Heading>
        <CardSurface>
          {payment.events.length === 0 ? (
            <EmptyState
              title="No indexed events"
              description="The indexer has decoded no event for this attempt's transaction. An absent event is never reported as settlement."
            />
          ) : (
            <ActivityList
              items={payment.events}
              {...(explorerUrl === undefined ? {} : { explorerUrl })}
            />
          )}
        </CardSurface>
      </VStack>

      <VStack gap={3}>
        <Heading level={2}>Chain evidence</Heading>
        <CardSurface>
          <EvidencePanel config={config} />
        </CardSurface>
      </VStack>
    </VStack>
  );
}

export function PaymentDetailPage() {
  const { state } = useSession();
  const { paymentId } = useParams<{ paymentId: string }>();
  if (paymentId === undefined) {
    return <Text type="supporting">This route needs a payment id.</Text>;
  }
  return (
    <VStack gap={6}>
      <PageHeader
        title={`Payment ${paymentId}`}
        description="Attempt state, chain-derived settlement truth and the indexed events the read API reports."
        actions={<Link href="/payments">All payments</Link>}
      />
      {state.status === "active" ? (
        <PaymentReceipt paymentId={paymentId} />
      ) : (
        <ConnectGate
          title="Sign in with the owner wallet"
          description="A payment is readable only by the wallet that owns the card it was made on."
        />
      )}
    </VStack>
  );
}
