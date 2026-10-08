import { Banner } from "@astryxdesign/core/Banner";

/**
 * Persistent testnet disclosure. Every surface in the console shows disposable
 * testnet assets, so this banner is attached to the shell rather than repeated
 * per page.
 */
export function TestnetNotice() {
  return (
    <Banner
      status="warning"
      container="section"
      title="Arc testnet — these funds have no fiat value"
      description="Cards, credit and payments here are testnet-only. Actions are irreversible on-chain but carry no monetary value."
    />
  );
}
