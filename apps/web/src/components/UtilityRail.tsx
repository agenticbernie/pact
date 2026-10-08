import { Link } from "@astryxdesign/core/Link";
import { Stack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { Token } from "@astryxdesign/core/Token";
import { useChainConfig } from "../api/hooks";
import { groupThousands } from "../lib/format";
import { useSession } from "../session/SessionProvider";

/**
 * Operator utility rail — the strip above the working canvas.
 *
 * It reports the environment and the read model's position, nothing else: the
 * lane the console is bound to, the highest block the indexer has confirmed,
 * and whose owner session is loaded. Every value is read from the API
 * (`/v1/config` is unauthenticated) or from the session itself — none is
 * inferred locally. While a read is in flight the slot shows an em dash rather
 * than a guess.
 */
export function UtilityRail() {
  const configQuery = useChainConfig();
  const { state } = useSession();
  const config = configQuery.state.status === "ready" ? configQuery.state.data : null;
  const head = config === null ? null : config.latestIndexedBlock;

  return (
    <Stack
      direction="horizontal"
      gap={4}
      align="center"
      hAlign="between"
      wrap="wrap"
      paddingInline={4}
      paddingBlock={1}
    >
      <Stack direction="horizontal" gap={2} align="center">
        <Token
          label="Arc testnet"
          color="yellow"
          size="sm"
          description="Testnet funds carry no monetary value; on-chain actions are irreversible."
        />
        <Text type="supporting">
          {config === null ? "Chain —" : `Chain ${groupThousands(String(config.chainId))}`}
        </Text>
      </Stack>
      <Stack direction="horizontal" gap={4} align="center" wrap="wrap">
        <Stack direction="horizontal" gap={1.5} align="center">
          <Text type="supporting">Indexer head</Text>
          <Text type="code" hasTabularNumbers>
            {head === null ? "—" : `#${groupThousands(String(head))}`}
          </Text>
        </Stack>
        <Stack direction="horizontal" gap={1.5} align="center">
          <Text type="supporting">Owner session</Text>
          <Text type="code">
            {state.status === "active" ? state.wallet : "none"}
          </Text>
        </Stack>
        {config === null ? null : <Link href={config.explorerUrl}>Explorer</Link>}
      </Stack>
    </Stack>
  );
}
