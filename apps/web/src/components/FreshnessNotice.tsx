import { Banner } from "@astryxdesign/core/Banner";
import { Text } from "@astryxdesign/core/Text";

/**
 * Indexer freshness. A missing confirmed block is a first-class warning: every
 * settlement state below it may be behind the chain, so it is never hidden.
 */
export function FreshnessNotice({
  latestIndexedBlock,
  stale,
}: {
  latestIndexedBlock: number | null;
  stale: boolean;
}) {
  if (stale || latestIndexedBlock === null) {
    return (
      <Banner
        status="warning"
        title="The indexer has no confirmed block yet"
        description="Rows below may be behind the chain. Nothing is reported as settled until a confirmed receipt and the indexed event agree."
      />
    );
  }
  return (
    <Text type="supporting">{`Indexer head: block ${latestIndexedBlock.toLocaleString()}`}</Text>
  );
}
