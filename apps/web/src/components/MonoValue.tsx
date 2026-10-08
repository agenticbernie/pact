import { Text } from "@astryxdesign/core/Text";

/**
 * Monospaced, single-line value for hashes, addresses and nonces. Truncation is
 * visual only — hovering reveals the full value, and the text stays selectable.
 */
export function MonoValue({ value }: { value: string }) {
  return (
    <Text type="code" maxLines={1}>
      {value}
    </Text>
  );
}
