import { Token } from "@astryxdesign/core/Token";
import type { StatusDotVariant } from "@astryxdesign/core/StatusDot";
import type { StatusTone } from "../lib/status";

/**
 * Status chip for a lifecycle or settlement state. The label is always visible:
 * colour never carries the meaning on its own, and `description` carries the
 * longer explanation for assistive technology.
 */
const TOKEN_COLOR: Record<StatusTone, "green" | "yellow" | "red" | "gray" | "blue"> = {
  success: "green",
  warning: "yellow",
  error: "red",
  neutral: "gray",
  accent: "blue",
};

/** Same tone, rendered as the compact dot the navigation rail uses. */
export const DOT_VARIANT: Record<StatusTone, StatusDotVariant> = {
  success: "success",
  warning: "warning",
  error: "error",
  neutral: "neutral",
  accent: "accent",
};

export function StatusToken({
  label,
  tone,
  description,
}: {
  label: string;
  tone: StatusTone;
  description?: string;
}) {
  return (
    <Token
      label={label}
      color={TOKEN_COLOR[tone]}
      size="sm"
      {...(description === undefined ? {} : { description })}
    />
  );
}
