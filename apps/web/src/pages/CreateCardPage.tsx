import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { CheckboxList, CheckboxListItem } from "@astryxdesign/core/CheckboxList";
import { DateTimeInput, type ISODateTimeString } from "@astryxdesign/core/DateTimeInput";
import { Divider } from "@astryxdesign/core/Divider";
import { Grid } from "@astryxdesign/core/Grid";
import { Heading } from "@astryxdesign/core/Heading";
import { Link } from "@astryxdesign/core/Link";
import { MetadataList, MetadataListItem } from "@astryxdesign/core/MetadataList";
import { Stack } from "@astryxdesign/core/Stack";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { VStack } from "@astryxdesign/core/VStack";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { listCards } from "../api/read";
import { useChainConfig } from "../api/hooks";
import type { ApiConfig } from "../api/types";
import { ConnectGate } from "../components/ConnectGate";
import { LoadFailure } from "../components/LoadFailure";
import { MonoValue } from "../components/MonoValue";
import { PageHeader } from "../components/PageHeader";
import { describeReason, validateCardDraft, type CardDraftIssue } from "../lib/card-policy";
import { assertControllerDeployed, connectInjectedWallet, describeChainError, issueCard } from "../lib/chain";
import { assetMeta } from "../lib/assets";
import { merchantCatalog } from "../lib/merchants";
import { ARC_LANE_ASSET_ID, sameAddress } from "../lib/card-policy";
import { useSession } from "../session/SessionProvider";

type StepId = "wallet" | "chain" | "controller" | "create" | "activate" | "index";
type StepStatus = "pending" | "active" | "done" | "failed";

const STEPS: ReadonlyArray<{ id: StepId; label: string }> = [
  { id: "wallet", label: "Connected wallet and session agree" },
  { id: "chain", label: "Wallet is on the lane chain" },
  { id: "controller", label: "Controller has bytecode at the configured address" },
  { id: "create", label: "createCard transaction confirmed" },
  { id: "activate", label: "activateCard transaction confirmed" },
  { id: "index", label: "Card appears in the read model" },
];

const INITIAL_STEPS: Record<StepId, StepStatus> = {
  wallet: "pending",
  chain: "pending",
  controller: "pending",
  create: "pending",
  activate: "pending",
  index: "pending",
};

const DOT: Record<StepStatus, "neutral" | "accent" | "success" | "error"> = {
  pending: "neutral",
  active: "accent",
  done: "success",
  failed: "error",
};

const DOT_LABEL: Record<StepStatus, string> = {
  pending: "Pending",
  active: "In progress",
  done: "Done",
  failed: "Failed",
};

type IssuedCard = { cardId: string; createTxHash: string; activateTxHash: string };

/** `DateTimeInput` brands its ISO 8601 values; our form state is a plain string. */
const asIsoDateTime = (value: string): ISODateTimeString => value as ISODateTimeString;

function issueFor(issues: CardDraftIssue[], field: CardDraftIssue["field"]): string | undefined {
  const found = issues.find((issue) => issue.field === field);
  return found === undefined ? undefined : describeReason(found.reason);
}

function StepList({ steps, notes }: { steps: Record<StepId, StepStatus>; notes: Record<StepId, string | undefined> }) {
  return (
    <VStack gap={2}>
      {STEPS.map((step) => (
        <Stack key={step.id} direction="horizontal" gap={2} align="center">
          <StatusDot variant={DOT[steps[step.id]]} label={DOT_LABEL[steps[step.id]]} />
          <VStack gap={0.5}>
            <Text>{step.label}</Text>
            {notes[step.id] === undefined ? null : <Text type="supporting">{notes[step.id]}</Text>}
          </VStack>
        </Stack>
      ))}
    </VStack>
  );
}

function IssuanceForm({ config }: { config: ApiConfig }) {
  const { state } = useSession();
  const navigate = useNavigate();
  const catalog = merchantCatalog();
  const asset = assetMeta(ARC_LANE_ASSET_ID);

  const [agent, setAgent] = useState("");
  const [cap, setCap] = useState("");
  const [perTransaction, setPerTransaction] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [merchants, setMerchants] = useState<string[]>([]);
  const [issues, setIssues] = useState<CardDraftIssue[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [steps, setSteps] = useState<Record<StepId, StepStatus>>(INITIAL_STEPS);
  const [notes, setNotes] = useState<Record<StepId, string | undefined>>({
    wallet: undefined,
    chain: undefined,
    controller: undefined,
    create: undefined,
    activate: undefined,
    index: undefined,
  });
  const [issued, setIssued] = useState<IssuedCard | null>(null);

  const sessionWallet = state.status === "active" ? state.wallet : "";

  function mark(id: StepId, status: StepStatus, note?: string): void {
    setSteps((current) => ({ ...current, [id]: status }));
    setNotes((current) => ({ ...current, [id]: note }));
  }

  /** Ask the read API whether the new card has been indexed yet. */
  async function refreshIndexing(cardId: string): Promise<void> {
    mark("index", "active");
    try {
      const response = await listCards();
      const indexed = response.cards.some((card) => card.cardId === cardId);
      mark(
        "index",
        indexed ? "done" : "failed",
        indexed
          ? "Confirmed by the read model."
          : "The transaction is confirmed but no card row is indexed yet. Retry once the indexer catches up.",
      );
    } catch (cause) {
      mark("index", "failed", `Indexer check failed: ${describeChainError(cause)}`);
    }
  }

  async function submit(): Promise<void> {
    if (busy) return;
    setError(null);
    setIssued(null);

    const validation = validateCardDraft({
      agent,
      ownerConfiguredCap: cap,
      perTransactionLimit: perTransaction,
      expiresAt,
      merchants,
      catalog: catalog.map((entry) => entry.id),
      decimals: asset.decimals,
    });
    setIssues(validation.ok ? [] : validation.issues);
    if (!validation.ok) return;

    setBusy(true);
    setSteps(INITIAL_STEPS);
    setNotes({ wallet: undefined, chain: undefined, controller: undefined, create: undefined, activate: undefined, index: undefined });

    try {
      mark("wallet", "active");
      const wallet = await connectInjectedWallet(config.chainId);
      if (!sameAddress(wallet.address, sessionWallet)) {
        // The controller records `msg.sender` as the card owner, so signing with
        // an account other than the signed-in owner would issue a card the
        // console could never read back — and hand it to the wrong owner.
        mark("wallet", "failed", wallet.address);
        throw new Error(
          "The wallet returned a different account than the signed-in owner. Switch the wallet account to the session owner, or sign in again.",
        );
      }
      mark("wallet", "done", wallet.address);
      mark("chain", "done", `Chain ${wallet.chainId}`);

      mark("controller", "active");
      await assertControllerDeployed(wallet.provider, config.controller);
      mark("controller", "done", config.controller);

      mark("create", "active");
      const result = await issueCard({
        runner: wallet.provider,
        signer: wallet.signer,
        controller: config.controller,
        draft: validation.draft,
        onStep: (step) => {
          if (step === "submitting-create") mark("create", "active", "Waiting for the wallet to confirm…");
          if (step === "confirming-create") mark("create", "active", "Waiting for the receipt…");
          if (step === "submitting-activate") mark("activate", "active", "Waiting for the wallet to confirm…");
          if (step === "confirming-activate") mark("activate", "active", "Waiting for the receipt…");
        },
      });
      mark("create", "done", result.createTxHash);
      mark("activate", "done", result.activateTxHash);
      setIssued({ cardId: result.cardId, createTxHash: result.createTxHash, activateTxHash: result.activateTxHash });
      await refreshIndexing(result.cardId);
    } catch (cause) {
      const message = cause instanceof Error && cause.name === "ChainError" ? cause.message : describeChainError(cause);
      setError(message);
      // Whatever step was active is the one that failed; keep the earlier ones.
      setSteps((current) => {
        const active = (Object.keys(current) as StepId[]).find((id) => current[id] === "active");
        return active === undefined ? current : { ...current, [active]: "failed" };
      });
    } finally {
      setBusy(false);
    }
  }

  const fieldStatus = (value: string | undefined) =>
    value === undefined ? undefined : { type: "error" as const, message: value };

  return (
    <VStack gap={6}>
      <Card>
        <VStack gap={4}>
          <VStack gap={1}>
            <Heading level={2}>New card</Heading>
            <Text type="supporting">
              Issue a card to an agent, then activate it. Both transactions are signed by the owner
              wallet; the card is created with zero credit, so nothing can be spent until a verified
              credit is applied through the ASC authority.
            </Text>
          </VStack>

          <Grid columns={{ minWidth: 320, repeat: "fit", max: 2 }} gap={3}>
            <TextInput
              label="Agent wallet address"
              value={agent}
              onChange={(value) => setAgent(value)}
              placeholder="0x…"
              description="The agent this card is assigned to. The controller allows one active card per agent."
              isDisabled={busy}
              {...(fieldStatus(issueFor(issues, "agent")) === undefined
                ? {}
                : { status: fieldStatus(issueFor(issues, "agent")) })}
            />
            <TextInput
              label={`Spending cap (${asset.symbol})`}
              value={cap}
              onChange={(value) => setCap(value)}
              placeholder="0.1"
              description="The most this card may ever spend."
              isDisabled={busy}
              {...(fieldStatus(issueFor(issues, "ownerConfiguredCap")) === undefined
                ? {}
                : { status: fieldStatus(issueFor(issues, "ownerConfiguredCap")) })}
            />
            <TextInput
              label={`Per-transaction limit (${asset.symbol})`}
              value={perTransaction}
              onChange={(value) => setPerTransaction(value)}
              placeholder="0.01"
              description="The ceiling for a single payment. Cannot exceed the cap."
              isDisabled={busy}
              {...(fieldStatus(issueFor(issues, "perTransactionLimit")) === undefined
                ? {}
                : { status: fieldStatus(issueFor(issues, "perTransactionLimit")) })}
            />
            <DateTimeInput
              label="Card expiry"
              value={expiresAt === "" ? undefined : asIsoDateTime(expiresAt)}
              onChange={(value) => setExpiresAt(value ?? "")}
              min={asIsoDateTime(new Date().toISOString().slice(0, 16))}
              description="The controller rejects an expiry that is not in the future."
              isDisabled={busy}
              {...(fieldStatus(issueFor(issues, "expiresAt")) === undefined
                ? {}
                : { status: fieldStatus(issueFor(issues, "expiresAt")) })}
            />
          </Grid>

          <CheckboxList
            label="Merchant allowlist"
            description="The agent may only pay merchants on this list. Only the trusted catalog can be allowlisted."
            value={merchants}
            onChange={(values) => setMerchants(values)}
            isDisabled={busy}
            {...(fieldStatus(issueFor(issues, "merchants")) === undefined
              ? {}
              : { status: fieldStatus(issueFor(issues, "merchants")) })}
          >
            {catalog.map((entry) => (
              <CheckboxListItem key={entry.id} label={entry.label} value={entry.id} />
            ))}
          </CheckboxList>

          <Divider />

          <MetadataList columns="multi">
            <MetadataListItem label="Network">
              <Text type="code" hasTabularNumbers>
                {`Arc testnet · ${config.chainId}`}
              </Text>
            </MetadataListItem>
            <MetadataListItem label="Settlement asset">
              <Text type="code">{`${ARC_LANE_ASSET_ID} (${asset.symbol}, ${asset.decimals} decimals)`}</Text>
            </MetadataListItem>
            <MetadataListItem label="Controller">
              <MonoValue value={config.controller} />
            </MetadataListItem>
            <MetadataListItem label="Owner session">
              <MonoValue value={sessionWallet} />
            </MetadataListItem>
          </MetadataList>

          {error === null ? null : <Banner status="error" title="Card not created" description={error} />}

          <Button
            label={busy ? "Issuing…" : "Validate and issue card"}
            variant="primary"
            isLoading={busy}
            isDisabled={busy}
            onClick={() => {
              void submit();
            }}
          />
        </VStack>
      </Card>

      <Card>
        <VStack gap={3}>
          <Heading level={2}>Progress</Heading>
          <StepList steps={steps} notes={notes} />
          {issued === null ? null : (
            <VStack gap={2}>
              <Divider />
              <Text>{`Card #${issued.cardId} was created and activated on chain.`}</Text>
              <Text type="supporting">
                Card creation is confirmed by the chain, not by this dashboard: the read model only
                learns about it from the indexed CardCreated event.
              </Text>
              <VStack gap={1}>
                <Text type="supporting">{`createCard ${issued.createTxHash}`}</Text>
                <Link href={`${config.explorerUrl}/tx/${issued.createTxHash}`} isExternalLink>
                  Open createCard in the explorer
                </Link>
                <Text type="supporting">{`activateCard ${issued.activateTxHash}`}</Text>
                <Link href={`${config.explorerUrl}/tx/${issued.activateTxHash}`} isExternalLink>
                  Open activateCard in the explorer
                </Link>
              </VStack>
              <Stack direction="horizontal" gap={2} wrap="wrap">
                <Button
                  label="View card"
                  onClick={() => {
                    void navigate(`/cards/${issued.cardId}`);
                  }}
                />
                <Button
                  label="Retry indexer check"
                  onClick={() => {
                    void refreshIndexing(issued.cardId);
                  }}
                />
              </Stack>
            </VStack>
          )}
        </VStack>
      </Card>
    </VStack>
  );
}

function Configured() {
  const configQuery = useChainConfig();
  if (configQuery.state.status === "loading") {
    return <Text type="supporting">Loading chain configuration…</Text>;
  }
  if (configQuery.state.status === "failed") {
    return (
      <LoadFailure
        title="Chain configuration could not be read"
        message={configQuery.state.message}
        onRetry={configQuery.reload}
      />
    );
  }
  return <IssuanceForm config={configQuery.state.data} />;
}

export function CreateCardPage() {
  const { state } = useSession();
  return (
    <VStack gap={6}>
      <PageHeader
        title="Issue a card"
        description="Create a card for an agent with explicit spending policy, then activate it. The owner wallet signs both transactions."
      />
      {state.status === "active" ? (
        <Configured />
      ) : (
        <ConnectGate
          title="Sign in with the owner wallet"
          description="Issuing a card binds it to the wallet that signs the transaction, so the console signs you in as that owner first."
        />
      )}
    </VStack>
  );
}
