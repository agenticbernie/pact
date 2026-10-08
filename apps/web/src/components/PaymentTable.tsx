import { Table, proportional } from "@astryxdesign/core/Table";
import type { TableColumn } from "@astryxdesign/core/Table";
import { Link } from "@astryxdesign/core/Link";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import type { ApiPayment } from "../api/types";
import { formatAmount } from "./AmountText";
import { StatusToken } from "./StatusToken";
import { formatDateTime, normalizeTimestamp } from "../lib/format";
import { merchantLabel } from "../lib/merchants";
import { paymentState } from "../lib/status";
import type { StatusTone } from "../lib/status";

type PaymentRow = {
  paymentId: string;
  merchant: string;
  amount: string;
  settlement: string;
  settlementTone: StatusTone;
  settlementDetail: string;
  attemptStatus: string;
  updated: string;
};

function toRow(payment: ApiPayment): PaymentRow {
  const truth = paymentState(payment);
  return {
    paymentId: payment.paymentId,
    merchant: merchantLabel(payment.merchantId),
    amount: formatAmount(payment.amountBaseUnits, payment.asset),
    settlement: truth.label,
    settlementTone: truth.tone,
    settlementDetail: truth.detail,
    attemptStatus: payment.attemptStatus,
    updated: formatDateTime(
      normalizeTimestamp(payment.attemptUpdatedAt ?? payment.intentCreatedAt),
    ),
  };
}

const COLUMNS: TableColumn<PaymentRow>[] = [
  {
    key: "paymentId",
    header: "Payment",
    width: proportional(1.6),
    renderCell: (row) => <Link href={`/payments/${encodeURIComponent(row.paymentId)}`}>{row.paymentId}</Link>,
  },
  { key: "merchant", header: "Merchant", width: proportional(1.2) },
  { key: "amount", header: "Amount", width: proportional(1.2) },
  {
    key: "settlement",
    header: "Settlement",
    width: proportional(1.2),
    renderCell: (row) => (
      <StatusToken label={row.settlement} tone={row.settlementTone} description={row.settlementDetail} />
    ),
  },
  {
    key: "attemptStatus",
    header: "Attempt row",
    width: proportional(1),
    renderCell: (row) => <Text type="supporting">{row.attemptStatus}</Text>,
  },
  { key: "updated", header: "Updated", width: proportional(1.2) },
];

/** Dense payment rows. Settlement state is the read API's answer, never the row status. */
export function PaymentTable({ payments }: { payments: readonly ApiPayment[] }) {
  const rows = payments.map(toRow);
  if (rows.length === 0) return null;
  return (
    <VStack gap={2}>
      <Table data={rows} idKey="paymentId" density="compact" hasHover columns={COLUMNS} />
    </VStack>
  );
}
