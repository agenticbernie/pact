import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { useSession } from "../session/SessionProvider";

/**
 * Wallet gate for owner-scoped reads.
 *
 * The console reads owner-scoped data, so it authenticates the same way the API
 * does: an EIP-191 challenge signed by the owner wallet, exchanged for a
 * short-lived HMAC session token. There is no bypass — with no wallet present,
 * the data stays unavailable and the gate says so.
 */
export function ConnectGate({ title, description }: { title: string; description: string }) {
  const { state, walletDetected, connect } = useSession();
  const connecting = state.status === "connecting";

  return (
    <Card>
      <VStack gap={3}>
        <VStack gap={1}>
          <Heading level={2}>{title}</Heading>
          <Text type="supporting">{description}</Text>
        </VStack>
        {walletDetected ? null : (
          <Banner
            status="warning"
            title="No browser wallet detected"
            description="This console reads owner-scoped data from the read API. Open it in a browser with an EVM wallet extension to sign the one-time challenge."
          />
        )}
        {state.status === "failed" ? (
          <Banner status="error" title="Sign-in failed" description={state.message} />
        ) : null}
        <Button
          label={connecting ? "Waiting for wallet…" : "Connect owner wallet"}
          variant="primary"
          isLoading={connecting}
          isDisabled={connecting}
          onClick={() => {
            void connect();
          }}
        />
      </VStack>
    </Card>
  );
}
