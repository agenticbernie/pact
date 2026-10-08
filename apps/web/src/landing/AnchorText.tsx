import { Text } from "@astryxdesign/core/Text";
import type { ReactNode } from "react";
import { anchorClick } from "./jumpTo";

/**
 * A same-page navigation entry on the landing page.
 *
 * Typography and colour come from `Text`; the anchor only carries the
 * destination, so a landing header reads exactly like any other Pact copy.
 */
export function AnchorText({ id, children }: { id: string; children: ReactNode }) {
  return (
    <Text>
      <a
        href={`#${id}`}
        onClick={anchorClick(id)}
        style={{ color: "inherit", textDecoration: "none" }}
      >
        {children}
      </a>
    </Text>
  );
}
