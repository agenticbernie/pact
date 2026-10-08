import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Grid } from "@astryxdesign/core/Grid";
import { Heading } from "@astryxdesign/core/Heading";
import { Link } from "@astryxdesign/core/Link";
import { Stack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { useChainConfig, useOwnerCards, usePaymentsForCards } from "../api/hooks";
import type { ApiCard, ApiConfig } from "../api/types";
import { CardTable } from "../components/CardTable";
import { ConnectGate } from "../components/ConnectGate";
import { FreshnessNotice } from "../components/FreshnessNotice";
import { LoadFailure } from "../components/LoadFailure";
import { PageHeader } from "../components/PageHeader";
import { PaymentTable } from "../components/PaymentTable";
import { StatusToken } from "../components/StatusToken";
import { TelemetryStat } from "../components/TelemetryStat";
import { assetMeta } from "../lib/assets";
import {
  formatBaseUnits,
  formatDateTime,
  groupThousands,
  normalizeTimestamp,
  subtractBaseUnits,
} from "../lib/format";
import { cardState } from "../lib/status";
import { useSession } from "../session/SessionProvider";

const RECENT_PAYMENT_LIMIT = 5;

/** Base units → a bare, grouped decimal string for the telemetry numerals. */
function telemetryValue(baseUnits: string, asset: string): string {
  return groupThousands(formatBaseUnits(baseUnits, assetMeta(asset).decimals));
}

/** One labelled field inside a panel. Hashes and addresses go in the code face. */
function Detail({ label, value, isCode = false }: { label: string; value: string; isCode?: boolean }) {
  return (
    <VStack gap={0.5}>
      <Text type="label" size="xsm" color="secondary">
        {label}
      </Text>
      {isCode ? (
        <Text type="code" maxLines={1}>
          {value}
        </Text>
      ) : (
        <Text>{value}</Text>
      )}
    </VStack>
  );
}

/**
 * Credit envelope for one card: what is still spendable, what the owner capped
 * it at, what has moved, and the single-transaction ceiling. All four are read
 * from the card row — `available` is the only derived figure, and it is an
 * exact base-unit subtraction.
 */
function CreditTelemetry({ card }: { card: ApiCard }) {
  const unit = assetMeta(card.asset).symbol;
  return (
    <Grid columns={{ minWidth: 210, repeat: "fit", max: 4 }} gap={3}>
      <TelemetryStat
        label="AVAILABLE CREDIT"
        value={telemetryValue(subtractBaseUnits(card.verifiedCredit, card.spent), card.asset)}
        unit={unit}
        note={`of ${telemetryValue(card.ownerConfiguredCap, card.asset)} ${unit} owner cap`}
      />
      <TelemetryStat
        label="VERIFIED CREDIT"
        value={telemetryValue(card.verifiedCredit, card.asset)}
        unit={unit}
        note="Confirmed by the read model"
      />
      <TelemetryStat
        label="SPENT TO DATE"
        value={telemetryValue(card.spent, card.asset)}
        unit={unit}
        note="Settled against this card"
      />
      <TelemetryStat
        label="PER-TX LIMIT"
        value={telemetryValue(card.perTransactionLimit, card.asset)}
        unit={unit}
        note="Maximum auto-sign amount"
      />
    </Grid>
  );
}

/** The card's own row, plus the contract identity it is bound to. */
function CardStatePanel({ card }: { card: ApiCard }) {
  const view = cardState(card.status);
  return (
    <Card>
      <VStack gap={3}>
        <Stack direction="horizontal" gap={2} align="center" hAlign="between" wrap="wrap">
          <VStack gap={0.5}>
            <Text type="label" size="xsm" color="secondary">
              VIRTUAL CARD STATE
            </Text>
            <Heading level={2}>{`Card #${card.cardId}`}</Heading>
          </VStack>
          <StatusToken label={view.label} tone={view.tone} />
        </Stack>
        <Grid columns={{ minWidth: 200, repeat: "fit", max: 4 }} gap={3}>
          <Detail label="ASSET" value={assetMeta(card.asset).symbol} />
          <Detail label="EXPIRES" value={formatDateTime(normalizeTimestamp(card.expiresAt))} />
          <Detail label="POLICY VERSION" value={`v${card.policyVersion}`} />
          <Detail label="SOURCE BLOCK" value={`#${groupThousands(String(card.sourceBlock))}`} />
          <Detail label="AUTHORIZED AGENT" value={card.agentId} isCode />
          <Detail label="OWNER" value={card.ownerAddress} isCode />
          <Detail label="CONTROLLER" value={card.controllerAddress} isCode />
          <Detail label="READ AT" value={formatDateTime(normalizeTimestamp(card.updatedAt))} />
        </Grid>
      </VStack>
    </Card>
  );
}

/** Where the read model is reading from: chain, indexer position, contracts. */
function SystemStatusPanel({ config }: { config: ApiConfig | null }) {
  const head = config === null ? null : config.latestIndexedBlock;
  return (
    <Card>
      <VStack gap={3}>
        <VStack gap={0.5}>
          <Text type="label" size="xsm" color="secondary">
            SYSTEM STATUS
          </Text>
          <Heading level={2}>Read model</Heading>
        </VStack>
        <Grid columns={{ minWidth: 200, repeat: "fit", max: 4 }} gap={3}>
          <Detail
            label="CHAIN"
            value={config === null ? "—" : groupThousands(String(config.chainId))}
          />
          <Detail
            label="LATEST INDEXED BLOCK"
            value={head === null ? "—" : `#${groupThousands(String(head))}`}
          />
          <Detail label="CONTROLLER" value={config?.controller ?? "—"} isCode />
          <Detail label="POOL" value={config?.pool ?? "—"} isCode />
          <Detail label="MERCHANT" value={config?.merchant ?? "—"} isCode />
        </Grid>
        {config === null ? null : (
          <Text type="supporting">
            <Link href={config.explorerUrl}>Open the Arc testnet explorer</Link>
          </Text>
        )}
      </VStack>
    </Card>
  );
}

function Overview() {
  const cardsQuery = useOwnerCards(true);
  const configQuery = useChainConfig();
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
  const primary = cards[0] as ApiCard | undefined;
  const config = configQuery.state.status === "ready" ? configQuery.state.data : null;

  return (
    <VStack gap={6}>
      <VStack gap={2}>
        {cardsData === null ? null : (
          <FreshnessNotice latestIndexedBlock={cardsData.latestIndexedBlock} stale={cardsData.stale} />
        )}
      </VStack>

      {primary === undefined ? (
        <Card>
          <EmptyState
            title="No cards for this wallet"
            description="The read model has no card owned by the connected wallet. Issue one to an agent — the owner wallet signs, and the card appears here once the indexer has seen the CardCreated event."
          />
          <Stack direction="horizontal" gap={2}>
            <Button label="Issue a card" variant="primary" href="/cards/new" />
          </Stack>
        </Card>
      ) : (
        <VStack gap={6}>
          <CreditTelemetry card={primary} />
          <CardStatePanel card={primary} />
          <VStack gap={3}>
            <Heading level={2}>Cards</Heading>
            <CardTable cards={cards} />
          </VStack>
        </VStack>
      )}

      <VStack gap={3}>
        <Stack direction="horizontal" gap={2} align="center" hAlign="between" wrap="wrap">
          <Heading level={2}>Recent payments</Heading>
          <Link href="/payments">View all payments</Link>
        </Stack>
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

      <SystemStatusPanel config={config} />
    </VStack>
  );
}

export function DashboardPage() {
  const { state } = useSession();
  return (
    <VStack gap={6}>
      <PageHeader
        title="Dashboard"
        description="Live telemetry for the owner's card, its runtime policy limits, and the settlement evidence the read API reports."
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
