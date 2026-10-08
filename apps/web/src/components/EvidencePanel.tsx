import { Link } from "@astryxdesign/core/Link";
import { MetadataList, MetadataListItem } from "@astryxdesign/core/MetadataList";
import { Text } from "@astryxdesign/core/Text";
import type { ApiConfig } from "../api/types";
import { MonoValue } from "./MonoValue";

/**
 * Provenance panel: which chain, which deployed contracts, and where a reviewer
 * can verify them independently. Addresses come from the read API's public
 * config, never from client-side guesses.
 */
export function EvidencePanel({ config }: { config: ApiConfig | null }) {
  if (config === null) {
    return <Text type="supporting">Chain configuration is unavailable.</Text>;
  }
  return (
    <MetadataList columns="multi">
      <MetadataListItem label="Chain id">
        <Text type="code" hasTabularNumbers>
          {String(config.chainId)}
        </Text>
      </MetadataListItem>
      <MetadataListItem label="Controller">
        <MonoValue value={config.controller} />
      </MetadataListItem>
      <MetadataListItem label="Credit pool">
        <MonoValue value={config.pool} />
      </MetadataListItem>
      <MetadataListItem label="Merchant destination">
        <MonoValue value={config.merchant} />
      </MetadataListItem>
      <MetadataListItem label="Latest indexed block">
        <Text type="code" hasTabularNumbers>
          {config.latestIndexedBlock === null ? "unknown" : config.latestIndexedBlock.toLocaleString()}
        </Text>
      </MetadataListItem>
      <MetadataListItem label="Explorer">
        <Link href={config.explorerUrl} isExternalLink>
          {config.explorerUrl}
        </Link>
      </MetadataListItem>
    </MetadataList>
  );
}
