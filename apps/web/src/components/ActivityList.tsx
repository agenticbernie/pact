import { List, ListItem } from "@astryxdesign/core/List";
import { Link } from "@astryxdesign/core/Link";
import type { ApiActivityItem } from "../api/types";
import { shortenMiddle } from "../lib/format";

/**
 * Indexed chain events for one card, newest first. Each row names the event the
 * indexer decoded plus its block/log position, so the origin of every state the
 * console shows is inspectable.
 */
export function ActivityList({
  items,
  explorerUrl,
}: {
  items: readonly ApiActivityItem[];
  explorerUrl?: string;
}) {
  return (
    <List hasDividers>
      {items.map((item) => (
        <ListItem
          key={`${item.txHash}-${item.logIndex}`}
          label={item.eventType}
          description={`Block ${item.blockNumber.toLocaleString()} · log ${item.logIndex} · ${shortenMiddle(item.txHash)}`}
          endContent={
            explorerUrl === undefined ? undefined : (
              <Link href={`${explorerUrl}/tx/${item.txHash}`} isExternalLink>
                Explorer
              </Link>
            )
          }
        />
      ))}
    </List>
  );
}
