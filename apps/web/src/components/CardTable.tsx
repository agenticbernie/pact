import { Link } from "@astryxdesign/core/Link";
import { Table, proportional } from "@astryxdesign/core/Table";
import type { TableColumn } from "@astryxdesign/core/Table";
import { Text } from "@astryxdesign/core/Text";
import type { ApiCard } from "../api/types";
import { formatAmount } from "./AmountText";
import { StatusToken } from "./StatusToken";
import { formatDateTime, normalizeTimestamp } from "../lib/format";
import { cardState } from "../lib/status";
import type { StatusTone } from "../lib/status";

type CardRow = {
  cardId: string;
  status: string;
  statusTone: StatusTone;
  credit: string;
  spent: string;
  perTransaction: string;
  owner: string;
  expires: string;
};

function toRow(card: ApiCard): CardRow {
  const view = cardState(card.status);
  return {
    cardId: `Card ${card.cardId}`,
    status: view.label,
    statusTone: view.tone,
    credit: formatAmount(card.verifiedCredit, card.asset),
    spent: formatAmount(card.spent, card.asset),
    perTransaction: formatAmount(card.perTransactionLimit, card.asset),
    owner: card.ownerAddress,
    expires: formatDateTime(normalizeTimestamp(card.expiresAt)),
  };
}

const COLUMNS: TableColumn<CardRow>[] = [
  {
    key: "cardId",
    header: "Card",
    width: proportional(1),
    renderCell: (row) => <Link href={`/cards/${encodeURIComponent(row.cardId.replace("Card ", ""))}`}>{row.cardId}</Link>,
  },
  {
    key: "status",
    header: "Status",
    width: proportional(1),
    renderCell: (row) => <StatusToken label={row.status} tone={row.statusTone} />,
  },
  { key: "credit", header: "Verified credit", width: proportional(1.2) },
  { key: "spent", header: "Spent", width: proportional(1) },
  { key: "perTransaction", header: "Per transaction", width: proportional(1.2) },
  { key: "expires", header: "Expires", width: proportional(1.2) },
  {
    key: "owner",
    header: "Owner",
    width: proportional(1.2),
    renderCell: (row) => (
      <Text type="code" maxLines={1}>
        {row.owner}
      </Text>
    ),
  },
];

/** Owner-scoped cards as reported by the read model, one row per card. */
export function CardTable({ cards }: { cards: readonly ApiCard[] }) {
  const rows = cards.map(toRow);
  return <Table data={rows} idKey="cardId" density="compact" hasHover columns={COLUMNS} />;
}
