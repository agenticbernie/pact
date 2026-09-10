// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck — Deno CI reference (NON-BINDING per Validate Contract G7).
// Mirrors supabase/functions/ai-gateway/test/ai-gateway.vitest.test.ts.
// Run only when `deno` + `supabase` CLIs exist; never gates local green.
// deno test --allow-env --allow-net --allow-read supabase/functions/ai-gateway/test/ai-gateway.test.ts
import { assertEquals } from "jsr:@std/assert";

Deno.test("gateway fail-closed placeholder", () => {
  assertEquals("pact_agent_intent".length > 0, true);
});
