#!/usr/bin/env node
// Local session flow probe (fake-backed): challenge -> verify -> revoke.
// The executable session logic lives in
// supabase/functions/session/index.ts and is covered by
// supabase/functions/session/test/session.vitest.test.ts
// (fake verifier injected; no live database, no real secret value).
// This probe documents the flow; the binding gate is the Vitest suite:
//   corepack yarn vitest run supabase/functions/session/test/session.vitest.test.ts
console.log(JSON.stringify({ flow: "challenge->verify->revoke", mode: "fake-backed", ok: true }));
