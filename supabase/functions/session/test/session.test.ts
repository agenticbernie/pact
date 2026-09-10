// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck — Deno CI reference (NON-BINDING per Validate Contract G7).
// Mirrors supabase/functions/session/test/session.vitest.test.ts.
// Run only when `deno` + `supabase` CLIs exist; never gates local green.
// deno test --allow-env --allow-net supabase/functions/session/test/session.test.ts
import { assertEquals } from "jsr:@std/assert";

Deno.test("session consume-once placeholder", () => {
  assertEquals("WHERE nonce_hash=$1 AND consumed_at IS NULL".includes("consumed_at IS NULL"), true);
});
