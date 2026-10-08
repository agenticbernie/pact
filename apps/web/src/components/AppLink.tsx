import type { ComponentProps } from "react";
import { Link as RouterLink } from "react-router-dom";

type AppLinkProps = Omit<ComponentProps<typeof RouterLink>, "to"> & {
  /** Astryx hands the destination to a link component as `href`. */
  href?: string;
  to?: string;
};

/**
 * Router adapter for Astryx's LinkProvider.
 *
 * Astryx passes `href` to whichever component the provider configures, while
 * react-router's Link takes `to`. Mapping one onto the other keeps every Astryx
 * link on client-side routing instead of triggering a full page load.
 */
export function AppLink({ href, to, ...rest }: AppLinkProps) {
  return <RouterLink to={to ?? href ?? "/"} {...rest} />;
}
