import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { Center } from "@astryxdesign/core/Center";
import { Heading } from "@astryxdesign/core/Heading";
import { Section } from "@astryxdesign/core/Section";
import { Stack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { jumpTo } from "./jumpTo";

/**
 * Closing band. One destination, stated plainly: the console is where a wallet
 * signs in, and it is the only place a visitor can start.
 */
export function LandingCta() {
  return (
    <Section variant="muted" paddingBlock={10} dividers={["bottom"]}>
      <Center axis="horizontal" maxWidth={880}>
        <VStack gap={4} width="100%" paddingInline={4} hAlign="center">
          <Badge variant="info" label="DEPLOYMENT READY :: ARC TESTNET" />
          <Heading level={2} id="get-started" justify="center">
            Give your agents a way to pay — with proof.
          </Heading>
          <Text type="large" color="secondary" justify="center">
            Start building controlled, verifiable agent payments with Pact. The operator console
            signs you in with the wallet that owns the card, and shows exactly what settled.
          </Text>
          <Stack direction="horizontal" gap={3} wrap="wrap" hAlign="center">
            <Button label="Get started with Pact" variant="primary" size="lg" href="/console" />
            <Button
              label="Review the evidence"
              variant="secondary"
              size="lg"
              onClick={() => {
                jumpTo("evidence");
              }}
            />
          </Stack>
          <Text type="supporting" justify="center">
            Testnet funds carry no monetary value · no private key is ever stored in the browser
          </Text>
        </VStack>
      </Center>
    </Section>
  );
}
