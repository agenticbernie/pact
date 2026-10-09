import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Card as CardSurface } from "@astryxdesign/core/Card";
import { Divider } from "@astryxdesign/core/Divider";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Heading } from "@astryxdesign/core/Heading";
import { Link } from "@astryxdesign/core/Link";
import { MetadataList, MetadataListItem } from "@astryxdesign/core/MetadataList";
import { Stack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { useState } from "react";
import { useParams } from "react-router-dom";
import { describeError } from "../api/client";
import { useChainConfig } from "../api/hooks";
import { getIntent } from "../api/read";
import type { ApiExecuteResponse, ApiPayment, ApiPreflightResponse } from "../api/types";
import { useQuery } from "../api/useQuery";
import { executePayment, preflightPayment } from "../api/write";
import { formatAmount } from "../components/AmountText";
import { ConnectGate } from "../components/ConnectGate";
import { FreshnessNotice } from "../components/FreshnessNotice";
import { LoadFailure } from "../components/LoadFailure";
import { MonoValue } from "../components/MonoValue";
import { PageHeader } from "../components/PageHeader";
import { PaymentTable } from "../components/PaymentTable";
import { StatusToken } from "../components/StatusToken";
import { formatDateTime, normalizeTimestamp } from "../lib/format";
import { intentReason, intentState, settlementKeyForIntent } from "../lib/intent-state";
import { merchantLabel } from "../lib/merchants";
import { describeReasonCode } from "../lib/reason-codes";
import { useSession } from "../session/SessionProvider";

/**
 * One payment intent, as the runtime persists it — the durable counterpart of
 * the console's in-page intent state. Everything here is re-read from the read
 * API (`GET /v1/intents/:intentId`), so a reload, a hand-off to the agent lane
 * or a reconciliation pass all see the same facts.
 *
 * Invariants this page keeps:
 * - the console never encodes `pay`. Preflight and settlement go through the
 *   authorized executor APIs, which sign server-side with the signer bound to
 *   the card's AGENT — so the actions are offered only to a session that IS that
 *   agent, and an owner session gets the hand-off instead.
 * - nothing is broadcast without an explicit confirmation step.
 * - a retry reuses the existing attempt's key (hence its on-chain nonce), so it
 *   replays/reconciles the same attempt and can never settle a second time.
 */
function IntentDetail({ intentId }: { intentId: string }) {
  const query = useQuery((signal) => getIntent(intentId, signal), [intentId]);
  const configQuery = useChainConfig();
  const config = configQuery.state.status === "ready" ? configQuery.state.data : null;
  const { state: session } = useSession();
  const sessionWallet = session.status === "active" ? session.wallet : "";

  const [preflight, setPreflight] = useState<ApiPreflightResponse | null>(null);
  const [settlement, setSettlement] = useState<ApiExecuteResponse | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState<"preflight" | "execute" | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (query.state.status === "loading") {
    return <Text type="supporting">Loading intent…</Text>;
  }
  if (query.state.status === "failed") {
    return (
      <LoadFailure
        title="Intent could not be read"
        message={query.state.message}
        onRetry={query.reload}
      />
    );
  }

  const { intent, payments, latestIndexedBlock, stale } = query.state.data;
  const lifecycle = intentState({ expiresAt: intent.expiresAt, payments });
  const reason = intentReason({ expiresAt: intent.expiresAt, payments });
  const isAgent =
    sessionWallet !== "" && sessionWallet.toLowerCase() === intent.agentId.toLowerCase();
  const attempt: ApiPayment | undefined = payments[0];
  const settlementKey = settlementKeyForIntent(intent.intentId, payments);
  const canSettle = isAgent && lifecycle.status === "ready" && busy === null;
  const transactionUrl =
    attempt?.txHash === undefined || config === null
      ? undefined
      : `${config.explorerUrl}/tx/${attempt.txHash}`;
  const reasonSentence =
    preflight === null ? undefined : describeReasonCode(preflight.reasonCode);

  async function runPreflight(): Promise<void> {
    if (busy !== null) return;
    setError(null);
    setPreflight(null);
    setBusy("preflight");
    try {
      setPreflight(await preflightPayment(intent.intentId));
    } catch (cause) {
      setError(describeError(cause));
    } finally {
      setBusy(null);
    }
  }

  async function submit(): Promise<void> {
    if (busy !== null) return;
    setError(null);
    setBusy("execute");
    try {
      // The confirmed submission reuses the attempt's key (or the intent's
      // deterministic key when nothing was submitted yet).
      setSettlement(
        await executePayment({ intentId: intent.intentId, idempotencyKey: settlementKey }),
      );
      setConfirming(false);
      query.reload();
    } catch (cause) {
      setError(describeError(cause));
    } finally {
      setBusy(null);
    }
  }

  return (
    <VStack gap={6}>
      <FreshnessNotice latestIndexedBlock={latestIndexedBlock} stale={stale} />

      <CardSurface>
        <VStack gap={4}>
          {/* Headline: the state and the amount are the two facts the page is about. */}
          <Stack direction="horizontal" gap={3} wrap="wrap" align="center">
            <Text type="code" size="3xl" weight="semibold" hasTabularNumbers>
              {formatAmount(intent.amountBaseUnits, intent.asset)}
            </Text>
            <StatusToken
              label={lifecycle.label}
              tone={lifecycle.tone}
              description={`Intent ${intent.intentId}`}
            />
          </Stack>

          <VStack gap={1}>
            <Text weight="medium">
              {`${merchantLabel(intent.merchantId)} (${intent.merchantId})`}
            </Text>
            <Text type="supporting">{lifecycle.detail}</Text>
            {reason === undefined ? null : <Text type="supporting">{reason}</Text>}
          </VStack>

          <Divider />

          {/* What the intent is bound to — the facts a reader looks for first. */}
          <MetadataList columns="multi">
            <MetadataListItem label="Card">
              <Link href={`/cards/${encodeURIComponent(intent.cardId)}`}>
                {`Card ${intent.cardId}`}
              </Link>
            </MetadataListItem>
            <MetadataListItem label="Assigned agent">
              <MonoValue value={intent.agentId} />
            </MetadataListItem>
            <MetadataListItem label="Policy version">
              <Text type="code" hasTabularNumbers>
                {String(intent.policyVersion)}
              </Text>
            </MetadataListItem>
          </MetadataList>

          <Divider />

          {/* Subordinate: the persisted record behind the two groups above. */}
          <MetadataList
            columns="multi"
            title={
              <Text type="label" size="xsm" color="secondary">
                Intent record
              </Text>
            }
          >
            <MetadataListItem label="Asset">
              <Text type="code">{intent.asset}</Text>
            </MetadataListItem>
            <MetadataListItem label="Chain id">
              <Text type="code" hasTabularNumbers>
                {String(intent.chainId)}
              </Text>
            </MetadataListItem>
            <MetadataListItem label="Intent hash">
              <MonoValue value={intent.intentHash} />
            </MetadataListItem>
            <MetadataListItem label="Request">
              <MonoValue value={intent.requestId} />
            </MetadataListItem>
            <MetadataListItem label="Created">
              <Text type="supporting">
                {formatDateTime(normalizeTimestamp(intent.createdAt))}
              </Text>
            </MetadataListItem>
            <MetadataListItem label="Expires">
              <Text type="supporting">
                {formatDateTime(normalizeTimestamp(intent.expiresAt))}
              </Text>
            </MetadataListItem>
            <MetadataListItem label="Row status">
              <Text type="supporting">{intent.status}</Text>
            </MetadataListItem>
          </MetadataList>
        </VStack>
      </CardSurface>

      <VStack gap={3}>
        <Heading level={2}>Settlement</Heading>
        <CardSurface>
          <VStack gap={4}>
            {error === null ? null : (
              <Banner status="error" title="Settlement step failed" description={error} />
            )}

            {settlement === null ? null : (
              <Banner
                status={
                  settlement.status === "settled"
                    ? "success"
                    : settlement.status === "failed"
                      ? "error"
                      : "warning"
                }
                title={`Settlement ${settlement.status}`}
                description={
                  settlement.txHash === undefined
                    ? `Attempt ${settlement.paymentId}.`
                    : `Attempt ${settlement.paymentId}, transaction ${settlement.txHash}.`
                }
                endContent={
                  settlement.txHash === undefined || config === null ? undefined : (
                    <Link href={`${config.explorerUrl}/tx/${settlement.txHash}`} isExternalLink>
                      Open in the explorer
                    </Link>
                  )
                }
              />
            )}

            {preflight === null ? null : (
              <Banner
                status={preflight.decision === "would_settle" ? "success" : "warning"}
                title={`Preflight: ${preflight.decision}`}
                description={
                  reasonSentence === undefined
                    ? `Checked at ${preflight.checkedAt}.${
                        preflight.reasonCode === undefined ? "" : ` Reason: ${preflight.reasonCode}.`
                      }`
                    : `Checked at ${preflight.checkedAt}. ${reasonSentence}${
                        preflight.reasonCode === undefined ? "" : ` (${preflight.reasonCode})`
                      }`
                }
              />
            )}

            {attempt === undefined ? (
              lifecycle.status === "expired" ? (
                <Banner
                  status="warning"
                  title="This intent has expired"
                  description="An expired intent can never settle. Create a fresh intent from the card page."
                />
              ) : canSettle || confirming ? null : (
                <Banner
                  status="info"
                  title="Only the assigned agent can settle this intent"
                  description={`This session (${sessionWallet === "" ? "not connected" : sessionWallet}) is not the intent's agent (${intent.agentId}).`}
                />
              )
            ) : (
              <VStack gap={3}>
                <Banner
                  status="info"
                  title={`Attempt ${attempt.paymentId}`}
                  description="An attempt already exists for this intent. Refreshing re-reads the persisted attempt and the chain-derived settlement truth; nothing is resubmitted."
                />
                <Stack direction="horizontal" gap={2} wrap="wrap">
                  <Button
                    label={busy === "preflight" ? "Checking…" : "Run preflight"}
                    isLoading={busy === "preflight"}
                    isDisabled={busy !== null || !isAgent}
                    onClick={() => {
                      void runPreflight();
                    }}
                  />
                  <Button
                    label="Refresh status"
                    onClick={() => {
                      setSettlement(null);
                      setPreflight(null);
                      query.reload();
                    }}
                  />
                  {transactionUrl === undefined ? null : (
                    <Link href={transactionUrl} isExternalLink>
                      Verify the transaction on the explorer
                    </Link>
                  )}
                </Stack>
              </VStack>
            )}

            {attempt !== undefined || !isAgent || lifecycle.status === "expired" ? null : confirming ? (
              <VStack gap={3}>
                <Divider />
                <Heading level={3}>Confirm settlement</Heading>
                <Text type="supporting">
                  {`Submit the agent lane's settlement for ${formatAmount(intent.amountBaseUnits, intent.asset)} to ${merchantLabel(intent.merchantId)} on card ${intent.cardId}? If the attempt has already been broadcast, this reuses it rather than paying twice.`}
                </Text>
                <Stack direction="horizontal" gap={2} wrap="wrap">
                  <Button
                    label={busy === "execute" ? "Submitting settlement…" : "Confirm settlement"}
                    variant="primary"
                    isLoading={busy === "execute"}
                    isDisabled={busy !== null}
                    onClick={() => {
                      void submit();
                    }}
                  />
                  <Button
                    label="Cancel"
                    isDisabled={busy !== null}
                    onClick={() => setConfirming(false)}
                  />
                </Stack>
              </VStack>
            ) : (
              <>
                <Divider />
                <Stack direction="horizontal" gap={2} wrap="wrap">
                  <Button
                    label={busy === "preflight" ? "Checking…" : "Run preflight"}
                    isLoading={busy === "preflight"}
                    isDisabled={!canSettle}
                    onClick={() => {
                      void runPreflight();
                    }}
                  />
                  <Button
                    label="Review settlement"
                    variant="primary"
                    isDisabled={!canSettle}
                    onClick={() => setConfirming(true)}
                  />
                  <Button label="Refresh status" onClick={() => query.reload()} />
                </Stack>
                <Text type="supporting">
                  Preflight is a read-only mirror of the settlement. Nothing is broadcast until you
                  confirm, and the confirmed submission reuses this intent&apos;s attempt key.
                </Text>
              </>
            )}
          </VStack>
        </CardSurface>
      </VStack>

      <VStack gap={3}>
        <Heading level={2}>Agent hand-off</Heading>
        <CardSurface>
          <VStack gap={3}>
            {isAgent ? (
              <Banner
                status="success"
                title="This session is the card's assigned agent"
                description="Settlement runs through the executor's authorized API, which signs with the signer bound to this agent. No signing key ever reaches the browser."
              />
            ) : (
              <Banner
                status="info"
                title="The agent lane holds this intent"
                description={`The controller accepts \`pay\` only from the card's assigned agent (${intent.agentId}), and the executor's session must be that same agent. This session is ${sessionWallet === "" ? "not connected" : sessionWallet}, so it can read the intent but cannot settle it. Hand the intent id to the agent lane, then refresh this page.`}
              />
            )}
            <MetadataList columns="multi">
              <MetadataListItem label="Intent id">
                <MonoValue value={intent.intentId} />
              </MetadataListItem>
              <MetadataListItem label="Settlement key">
                <MonoValue value={settlementKey} />
              </MetadataListItem>
            </MetadataList>
            <Text type="supporting">
              The settlement key is derived from the attempt, so handing the intent on and settling it
              again reconciles the same attempt instead of submitting a second one.
            </Text>
          </VStack>
        </CardSurface>
      </VStack>

      <VStack gap={3}>
        <Heading level={2}>Attempts</Heading>
        {payments.length === 0 ? (
          <CardSurface>
            <EmptyState
              title="No attempt yet"
              description="The intent exists and is bound to its card, agent and policy version; the agent lane has not submitted it."
            />
          </CardSurface>
        ) : (
          <PaymentTable payments={payments} />
        )}
      </VStack>
    </VStack>
  );
}

export function IntentPage() {
  const { state } = useSession();
  const { intentId } = useParams<{ intentId: string }>();
  if (intentId === undefined) {
    return <Text type="supporting">This route needs an intent id.</Text>;
  }
  return (
    <VStack gap={6}>
      <PageHeader
        title={`Intent ${intentId}`}
        description="The persisted intent, its assigned agent and the attempts bound to it — settlement truth comes from the chain, never from this page."
        actions={<Link href="/payments">All payments</Link>}
      />
      {state.status === "active" ? (
        <IntentDetail intentId={intentId} />
      ) : (
        <ConnectGate
          title="Sign in with the owner wallet"
          description="An intent is readable only by the wallet that owns the card it was created for."
        />
      )}
    </VStack>
  );
}
