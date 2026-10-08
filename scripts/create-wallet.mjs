#!/usr/bin/env node
// Local wallet provisioning for the agent-signer lane (Pact / Arc).
//
// Records a wallet in the `wallets` registry created by
// `neon/migrations/0002_wallets.sql`, so the operator can tell which public
// address is the owner, the agent, the deployer, or the ASC relayer. A row is
// a provisioning record, never an authorization: payment authority stays with
// PactCardController on chain.
//
// Key hygiene: a generated PRIVATE KEY is printed exactly once on stdout for
// the operator to move straight into the server-side secret store
// (`AGENT_SIGNER_PRIVATE_KEY`). It is never written to a file, the repository,
// the database, or a log — the `wallets` row stores the PUBLIC address only.
// To provision a wallet whose key was created elsewhere (MetaMask, `cast
// wallet new`), pass `--address` and no key is handled at all.
//
// Run it inside the api container so `DATABASE_URL` resolves exactly as the
// runtime resolves it (compose Postgres offline, or the hosted Neon secret):
//
//   docker compose -f docker-compose.base44.yml exec -T api \
//     node scripts/create-wallet.mjs --role agent --label arc-agent-1
//
// Flags:
//   --role <owner|agent|deployer|relayer|asc>  required; registry role
//   --label <text>                             optional human label
//   --address <0x + 40 hex>                    register an existing address
//                                              instead of generating a keypair
//   --list                                     print the registry; writes nothing
//
// Exit codes: 0 ok, 2 usage/config error, 1 database failure.
import { Wallet } from "ethers";
import { Pool } from "pg";

const ROLES = ["owner", "agent", "deployer", "relayer", "asc"];
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

function usage(message) {
  process.stderr.write(`create-wallet: ${message}\n`);
  process.stderr.write(
    "usage: node scripts/create-wallet.mjs --role <" +
      ROLES.join("|") +
      "> [--label <text>] [--address 0x…] | --list\n",
  );
  process.exit(2);
}

function parseArgs(argv) {
  const parsed = { list: false };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === "--list") {
      parsed.list = true;
      continue;
    }
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) usage(`${flag} needs a value`);
    index += 1;
    if (flag === "--role") parsed.role = value;
    else if (flag === "--label") parsed.label = value;
    else if (flag === "--address") parsed.address = value;
    else usage(`unknown flag ${flag}`);
  }
  return parsed;
}

const args = parseArgs(process.argv.slice(2));
if (!args.list) {
  if (args.role === undefined) usage("--role is required");
  if (!ROLES.includes(args.role)) usage(`--role must be one of ${ROLES.join(", ")}`);
  if (args.address !== undefined && !ADDRESS.test(args.address)) {
    usage("--address must be a 20-byte hex address (0x + 40 hex characters)");
  }
}

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined || databaseUrl.trim().length === 0) {
  usage("DATABASE_URL is not set — run this inside the api service (see header)");
}

const pool = new Pool({ connectionString: databaseUrl });

try {
  if (args.list) {
    const rows = await pool.query(
      "SELECT address, role, label, created_at FROM wallets ORDER BY created_at, address",
    );
    if (rows.rows.length === 0) {
      process.stdout.write("wallets: registry is empty\n");
    } else {
      for (const row of rows.rows) {
        process.stdout.write(
          `${row.role}\t${row.address}\t${row.label ?? ""}\t${row.created_at.toISOString()}\n`,
        );
      }
    }
  } else {
    // `--address` registers an operator-created wallet; otherwise a fresh
    // keypair is generated here and its key is shown once, below.
    const generated = args.address === undefined ? Wallet.createRandom() : null;
    const address = (generated === null ? args.address : generated.address).toLowerCase();
    const label = args.label ?? null;
    const inserted = await pool.query(
      `INSERT INTO wallets (address, role, label) VALUES ($1, $2, $3)
         ON CONFLICT (address) DO UPDATE SET role = excluded.role, label = excluded.label
       RETURNING (xmax = 0) AS inserted`,
      [address, args.role, label],
    );
    const created = inserted.rows[0]?.inserted === true;
    process.stdout.write(
      [
        `role      ${args.role}`,
        `address   ${address}`,
        `label     ${label ?? ""}`,
        `registry  ${created ? "created" : "updated"}`,
      ].join("\n") + "\n",
    );
    if (generated !== null) {
      process.stdout.write(
        [
          "",
          "private key (shown once — store it as the AGENT_SIGNER_PRIVATE_KEY secret now,",
          "then discard it; it is never persisted by this script and must never be",
          "committed, pasted into chat, or written to a file):",
          generated.privateKey,
          "",
        ].join("\n"),
      );
    }
  }
} catch (error) {
  process.stderr.write(`create-wallet: ${error instanceof Error ? error.message : "failed"}\n`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
