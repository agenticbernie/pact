import { Text } from "@astryxdesign/core/Text";
import { assetMeta } from "../lib/assets";
import { formatBaseUnits, groupThousands } from "../lib/format";

/** Exact base-unit → display amount, monospaced so digits align in columns. */
export function formatAmount(amountBaseUnits: string, asset: string): string {
  const meta = assetMeta(asset);
  return `${groupThousands(formatBaseUnits(amountBaseUnits, meta.decimals))} ${meta.symbol}`;
}

export function AmountText({ amountBaseUnits, asset }: { amountBaseUnits: string; asset: string }) {
  return (
    <Text type="code" hasTabularNumbers>
      {formatAmount(amountBaseUnits, asset)}
    </Text>
  );
}
