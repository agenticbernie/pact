import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Divider } from "@astryxdesign/core/Divider";
import { Heading } from "@astryxdesign/core/Heading";
import { Link } from "@astryxdesign/core/Link";
import { MetadataList, MetadataListItem } from "@astryxdesign/core/MetadataList";
import { Selector } from "@astryxdesign/core/Selector";
import { Stack } from "@astryxdesign/core/Stack";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { VStack } from "@astryxdesign/core/VStack";
import { useEffect, useMemo, useState } from "react";
import { describeError } from "../api/client";
import type { ApiConfig, ApiExecuteResponse, ApiIntent, ApiPreflightResponse } from "../api/types";
import { executePayment, preflightPayment, requestPaymentIntent } from "../api/write";
import { formatAmount } from "../components/AmountText";
import { assetMeta } from "../lib/assets";
import {
  ARC_LANE_ASSET_ID,
  evaluatePaymentEligibility,
  parseBaseUnits,
  type ChainCardSnapshot,
} from "../lib/card-policy";
import {
  readChainCard,
  readMerchantActive,
  readMerchantAllowlisted,
  readOnlyRunner,
  readPoolBalance,
} from "../lib/chain";
import { merchantCatalog, merchantLabel } from "../lib/merchants";
import { ARC_TESTNET_RPC_URL } from "../lib/network";
import { describeReasonCode } from "../lib/reason-codes";
import { useSession } from "../session/SessionProvider";

const CHECK_TONE = { ok: "success", fail: "error", unknown: "warning" } as const;

function checkTone(ok: boolean): "success" | "error" {
  return ok ? CHECK_TONE.ok : CHECK_TONE.fail;
}

/**
 * Payment panel: everything the operator can verify before any money moves,
 * and the two calls the boundary exposes (`preflight`, `execute`).
 *
 * The panel is role-aware on purpose. The controller accepts `pay` only from the
 * card's assigned agent, and the executor's session must be that same agent, so
 * an owner session can describe a payment and create the intent but cannot
 * settle it — the agent lane does that, server-side, with its own signer. The
 * panel says so instead of pretending otherwise.
 */
export function PaymentPanel({
  cardId,
  card,
  config,
  onSettled,
}: {
  cardId: string;
  card: { asset: string; ownerAddress: string; agentId: string; status: string };
  config: ApiConfig | null;
  onSettled?: () => void;
}) {
  const { state } = useSession();
  const catalog = useMemo(() => merchantCatalog(), []);
  const decimals = assetMeta(card.asset).decimals;
  const symbol = assetMeta(card.asset).symbol;

  const runner = useMemo(
    () => (config === null ? null : readOnlyRunner(ARC_TESTNET_RPC_URL, config.chainId)),
    [config],
  );

  const [merchantId, setMerchantId] = useState(catalog[0]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [idempotencyKey, setIdempotencyKey] = useState(
    () => `pay-${cardId}-${Date.now().toString(36)}`,
  );
  /** Once the intent exists the default key is rebound to it (see `createIntent`). */
  const [keyEdited, setKeyEdited] = useState(false);

  // `undefined` while the on-chain read is in flight; null when it failed.
  const [chainCard, setChainCard] = useState<ChainCardSnapshot | null | undefined>(undefined);
  const [poolBalance, setPoolBalance] = useState<bigint | null>(null);
  const [merchantAllowed, setMerchantAllowed] = useState<boolean | null>(null);
  const [merchantActive, setMerchantActive] = useState<boolean | null>(null);

  const [intent, setIntent] = useState<ApiIntent | null>(null);
  const [preflight, setPreflight] = useState<ApiPreflightResponse | null>(null);
  const [settlement, setSettlement] = useState<ApiExecuteResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"intent" | "preflight" | "execute" | null>(null);
  /** Nothing is broadcast until the operator confirms the exact payment. */
  const [confirming, setConfirming] = useState(false);

  const sessionWallet = state.status === "active" ? state.wallet : "";
  const controller = config?.controller ?? "";
  const pool = config?.pool ?? "";
  const merchantContract = config?.merchant ?? "";

  useEffect(() => {
    if (runner === null || controller === "") return;
    let active = true;
    setChainCard(undefined);
    void (async () => {
      try {
        const snapshot = await readChainCard(runner, controller, cardId);
        const balance = await readPoolBalance(runner, pool);
        if (!active) return;
        setChainCard(snapshot);
        setPoolBalance(balance);
      } catch {
        if (!active) return;
        setChainCard(null);
        setPoolBalance(null);
      }
    })();
    return () => {
      active = false;
    };
  }, [runner, controller, pool, cardId]);

  useEffect(() => {
    if (runner === null || merchantId === "" || merchantContract === "") return;
    let active = true;
    setMerchantAllowed(null);
    setMerchantActive(null);
    void (async () => {
      try {
        const allowed = await readMerchantAllowlisted(runner, controller, cardId, merchantId);
        const activeMerchant = await readMerchantActive(runner, merchantContract, merchantId);
        if (!active) return;
        setMerchantAllowed(allowed);
        setMerchantActive(activeMerchant);
      } catch {
        // Both stay null: an unread allowlist must not look like a pass.
      }
    })();
    return () => {
      active = false;
    };
  }, [runner, controller, cardId, merchantId, merchantContract]);

  const parsedAmount = parseBaseUnits(amount, decimals);
  const amountBaseUnits = parsedAmount ?? 0n;
  const nowSeconds = Math.floor(Date.now() / 1000);
  const deadlineSeconds =
    intent === null ? 0n : BigInt(Math.floor(Date.parse(intent.expiresAt) / 1000));

  const eligibility = evaluatePaymentEligibility({
    card: chainCard === undefined ? null : chainCard,
    controller,
    expectedController: config?.controller ?? "",
    chainId: config?.chainId ?? 0,
    expectedChainId: config?.chainId ?? 0,
    laneAsset: card.asset === "" ? ARC_LANE_ASSET_ID : card.asset,
    sessionWallet,
    expectedOwner: card.ownerAddress,
    amountBaseUnits,
    merchantId,
    merchantAllowed,
    merchantActive,
    poolBalance,
    deadlineSeconds,
    nowSeconds,
  });

  const amountInvalid = amount.trim() !== "" && parsedAmount === null;
  const cardSnapshot = chainCard === undefined ? null : chainCard;
  const remainingAfter =
    cardSnapshot === null ? null : eligibility.availableBaseUnits - amountBaseUnits;

  async function createIntent(): Promise<void> {
    if (busy !== null) return;
    setError(null);
    setSettlement(null);
    setPreflight(null);
    setBusy("intent");
    try {
      // The gateway reads the card from persistence under the session's owner,
      // then resolves the merchant and the amount. The prompt only describes
      // what the operator asked for; the response is what will be acted on.
      const response = await requestPaymentIntent({
        cardId,
        prompt: `Send a Pact card payment of exactly ${amount} ${symbol} from card ${cardId} to merchant "${merchantId}". The merchant id is exactly ${merchantId}.`,
      });
      const resolved = response.intent;
      if (
        resolved.cardId !== cardId ||
        resolved.merchantId !== merchantId ||
        resolved.amountBaseUnits !== amountBaseUnits.toString()
      ) {
        setIntent(null);
        throw new Error(
          `The gateway resolved a different payment (merchant ${resolved.merchantId}, ${resolved.amountBaseUnits} base units). Nothing will be submitted — describe the payment again.`,
        );
      }
      if (chainCard !== undefined && chainCard !== null && resolved.agentId !== chainCard.agent) {
        setIntent(null);
        throw new Error("The intent's agent does not match the card's on-chain agent.");
      }
      // Default the settlement key to the intent, unless the operator named one:
      // an attempt's `paymentId` IS its idempotency key (and its on-chain nonce
      // derives from it), so this keeps one intent to one attempt no matter
      // whether settlement is submitted here or from the intent page.
      if (!keyEdited) setIdempotencyKey(`pay-${resolved.intentId}`);
      setIntent(resolved);
    } catch (cause) {
      setError(describeError(cause));
    } finally {
      setBusy(null);
    }
  }

  async function runPreflight(): Promise<void> {
    if (intent === null || busy !== null) return;
    setError(null);
    setBusy("preflight");
    try {
      setPreflight(await preflightPayment(intent.intentId));
    } catch (cause) {
      setError(describeError(cause));
    } finally {
      setBusy(null);
    }
  }

  async function settle(): Promise<void> {
    if (intent === null || busy !== null) return;
    setError(null);
    setBusy("execute");
    try {
      const result = await executePayment({ intentId: intent.intentId, idempotencyKey });
      setSettlement(result);
      onSettled?.();
    } catch (cause) {
      setError(describeError(cause));
    } finally {
      setConfirming(false);
      setBusy(null);
    }
  }

  const intentExpired = intent !== null && Date.parse(intent.expiresAt) <= Date.now();
  const canDescribe = amountBaseUnits > 0n && !amountInvalid && merchantId !== "" && busy === null;

  return (
    <VStack gap={3}>
      <Heading level={2}>Pay with this card</Heading>

      <Card>
        <VStack gap={4}>
          <Text type="supporting">
            A payment starts as an intent the gateway binds to this card, its agent and its policy
            version. Settlement is the agent lane&apos;s `pay` transaction — the console never signs
            one.
          </Text>

          <Selector
            label="Merchant"
            options={catalog.map((entry) => ({ value: entry.id, label: entry.label }))}
            value={merchantId}
            onChange={(value) => {
              setMerchantId(value);
              setIntent(null);
              setPreflight(null);
            }}
            description="Only merchants on the card's allowlist can settle."
            isDisabled={busy !== null}
          />

          <TextInput
            label={`Amount (${symbol})`}
            value={amount}
            onChange={(value) => {
              setAmount(value);
              setIntent(null);
              setPreflight(null);
            }}
            placeholder="0.005"
            description={`Exact decimal, up to ${decimals} places.`}
            isDisabled={busy !== null}
            {...(amountInvalid
              ? { status: { type: "error" as const, message: "Enter a plain decimal amount." } }
              : {})}
          />

          <TextInput
            label="Idempotency reference"
            value={idempotencyKey}
            onChange={(value) => {
              setKeyEdited(true);
              setIdempotencyKey(value);
            }}
            description="Bound to the settlement attempt: reusing it can never settle the same payment twice."
            isDisabled={busy !== null || settlement !== null}
          />

          <Divider />

          <VStack gap={1}>
            <Heading level={3}>Review</Heading>
            <MetadataList columns="multi">
              <MetadataListItem label="Merchant">{`${merchantLabel(merchantId)} (${merchantId})`}</MetadataListItem>
              <MetadataListItem label="Amount">{formatAmount(amountBaseUnits.toString(), card.asset)}</MetadataListItem>
              <MetadataListItem label="Per-transaction limit">
                {cardSnapshot === null ? "—" : formatAmount(cardSnapshot.perTransactionLimit.toString(), card.asset)}
              </MetadataListItem>
              <MetadataListItem label="Effective limit">
                {cardSnapshot === null
                  ? "—"
                  : formatAmount(
                      (cardSnapshot.ownerConfiguredCap < cardSnapshot.verifiedCredit
                        ? cardSnapshot.ownerConfiguredCap
                        : cardSnapshot.verifiedCredit
                      ).toString(),
                      card.asset,
                    )}
              </MetadataListItem>
              <MetadataListItem label="Available now">
                {cardSnapshot === null ? "—" : formatAmount(eligibility.availableBaseUnits.toString(), card.asset)}
              </MetadataListItem>
              <MetadataListItem label="Available after">
                {remainingAfter === null ? "—" : formatAmount(remainingAfter.toString(), card.asset)}
              </MetadataListItem>
              <MetadataListItem label="Settles to">
                {`The credit pool pays the merchant simulator; the card's spend counter increases. No funds leave the owner's wallet.`}
              </MetadataListItem>
            </MetadataList>
          </VStack>

          <Divider />

          <VStack gap={2}>
            <Heading level={3}>Eligibility</Heading>
            <Text type="supporting">
              Read live from the deployed controller, pool and merchant simulator. The contract
              re-checks all of it when the agent settles.
            </Text>
            <VStack gap={1.5}>
              {eligibility.checks.map((check) => (
                <Stack key={check.id} direction="horizontal" gap={2} align="center">
                  <StatusDot variant={checkTone(check.ok)} label={check.ok ? "Pass" : "Blocked"} />
                  <VStack gap={0}>
                    <Text>{check.label}</Text>
                    <Text type="supporting">{check.detail}</Text>
                  </VStack>
                </Stack>
              ))}
            </VStack>
          </VStack>

          {error === null ? null : <Banner status="error" title="Payment step failed" description={error} />}

          {settlement === null ? null : (
            <Banner
              status={settlement.status === "settled" ? "success" : settlement.status === "failed" ? "error" : "warning"}
              title={`Settlement ${settlement.status}`}
              description={
                settlement.txHash === undefined
                  ? `Attempt ${settlement.paymentId}.`
                  : `Attempt ${settlement.paymentId}, transaction ${settlement.txHash}.`
              }
              endContent={
                settlement.txHash === undefined ? undefined : (
                  <Link href={`${config?.explorerUrl ?? ""}/tx/${settlement.txHash}`} isExternalLink>
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
                preflight.reasonCode === undefined
                  ? `Checked at ${preflight.checkedAt}.`
                  : `Checked at ${preflight.checkedAt}. ${
                      describeReasonCode(preflight.reasonCode) ?? ""
                    } Reason: ${preflight.reasonCode}.`
              }
            />
          )}

          {intent === null ? (
            <VStack gap={2}>
              <Button
                label={busy === "intent" ? "Creating intent…" : "Create payment intent"}
                variant="primary"
                isLoading={busy === "intent"}
                isDisabled={!canDescribe}
                onClick={() => {
                  void createIntent();
                }}
              />
              <Text type="supporting">
                The intent binds the merchant, the amount, the card's agent and its policy version.
                It expires 15 minutes after it is created.
              </Text>
            </VStack>
          ) : (
            <VStack gap={2}>
              <MetadataList columns="multi">
                <MetadataListItem label="Intent">
                  <Text type="code" maxLines={1}>
                    {intent.intentId}
                  </Text>
                </MetadataListItem>
                <MetadataListItem label="Agent">
                  <Text type="code" maxLines={1}>
                    {intent.agentId}
                  </Text>
                </MetadataListItem>
                <MetadataListItem label="Expires">
                  <Text type="code">{intent.expiresAt}</Text>
                </MetadataListItem>
                <MetadataListItem label="Intent hash">
                  <Text type="code" maxLines={1}>
                    {intent.intentHash}
                  </Text>
                </MetadataListItem>
              </MetadataList>

              <Link href={`/intents/${encodeURIComponent(intent.intentId)}`}>
                Open the intent after a reload
              </Link>

              {intentExpired ? (
                <Banner
                  status="warning"
                  title="This intent has expired"
                  description="An expired intent can never settle. Describe the payment again to create a fresh one."
                />
              ) : null}

              {eligibility.callerIsAgent ? (
                confirming ? (
                  <VStack gap={2}>
                    <Text type="supporting">
                      {`Submit the agent lane's settlement for ${formatAmount(amountBaseUnits.toString(), card.asset)} to ${merchantLabel(merchantId)} on card ${cardId}? The reference above is bound to this attempt, so a repeat reconciles it instead of paying twice.`}
                    </Text>
                    <Stack direction="horizontal" gap={2} wrap="wrap">
                      <Button
                        label={busy === "execute" ? "Submitting settlement…" : "Confirm settlement"}
                        variant="primary"
                        isLoading={busy === "execute"}
                        isDisabled={busy !== null}
                        onClick={() => {
                          void settle();
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
                  <Stack direction="horizontal" gap={2} wrap="wrap">
                    <Button
                      label={busy === "preflight" ? "Checking…" : "Run preflight"}
                      isLoading={busy === "preflight"}
                      isDisabled={busy !== null || intentExpired}
                      onClick={() => {
                        void runPreflight();
                      }}
                    />
                    <Button
                      label="Review settlement"
                      variant="primary"
                      isDisabled={busy !== null || intentExpired || settlement !== null}
                      onClick={() => setConfirming(true)}
                    />
                  </Stack>
                )
              ) : (
                <Banner
                  status="info"
                  title="The agent lane settles this payment"
                  description={`The controller accepts \`pay\` only from the card's assigned agent (${card.agentId}), and the executor's session must be that same agent. This console session is ${sessionWallet}, so it can describe the payment and create the intent, but it cannot sign the settlement. Hand the intent id to the agent lane, then refresh this page.`}
                />
              )}
            </VStack>
          )}

          {card.status.toUpperCase() !== "ACTIVE" ? (
            <Banner
              status="warning"
              title="This card is not active"
              description="Settlement is only possible while the card is active and unexpired."
            />
          ) : null}
        </VStack>
      </Card>
    </VStack>
  );
}
