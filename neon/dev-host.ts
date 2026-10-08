/**
 * Local development host for the Arc-lane Pact functions.
 *
 * The production lanes serve `neon/functions/{session,aigateway,agentexecutor}`
 * as Neon Functions: each entry exports `{ fetch }` and Neon's `neon dev` command
 * binds it to a port. `neon dev` needs the Neon CLI/account, so this file does the
 * same thing offline — it mounts the three existing handlers on one local HTTP port
 * for the sandbox preview.
 *
 * It adds no business logic: every request is dispatched to the existing entry
 * handler, which owns routing (`normalizeFunctionPath`), auth, region gating, lane
 * checks, and error mapping. The only host-local surface is the `GET /` status page.
 *
 * Run: node --experimental-strip-types neon/dev-host.ts
 */
import { createServer } from "node:http";
import type { IncomingHttpHeaders, IncomingMessage, ServerResponse } from "node:http";
import sessionEntry from "./functions/session/index.ts";
import gatewayEntry from "./functions/aigateway/index.ts";
import executorEntry from "./functions/agentexecutor/index.ts";

type FetchHandler = (request: Request) => Response | Promise<Response>;

const PORT = Number(process.env["PORT"] ?? 3000);
const HOST = process.env["HOST"] ?? "0.0.0.0";

const ROUTES: ReadonlyArray<{ matches: (path: string) => boolean; handler: FetchHandler }> = [
  { matches: (path) => path === "/health" || path === "/v1/agent/intents", handler: gatewayEntry.fetch },
  { matches: (path) => path.startsWith("/v1/session/"), handler: sessionEntry.fetch },
  { matches: (path) => path.startsWith("/v1/payments/"), handler: executorEntry.fetch },
];

const ENDPOINTS: ReadonlyArray<readonly [string, string]> = [
  ["GET", "/health"],
  ["POST", "/v1/session/challenge"],
  ["POST", "/v1/session/verify"],
  ["POST", "/v1/session/revoke"],
  ["POST", "/v1/agent/intents"],
  ["POST", "/v1/payments/preflight"],
  ["POST", "/v1/payments/execute"],
];

function toHeaders(raw: IncomingHttpHeaders): Headers {
  const headers = new Headers();
  for (const [name, value] of Object.entries(raw)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const item of value) headers.append(name, item);
    } else {
      headers.set(name, value);
    }
  }
  return headers;
}

function readBody(request: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => resolve(Buffer.concat(chunks)));
    request.on("error", reject);
  });
}

async function renderStatus(response: ServerResponse): Promise<void> {
  let health = "unavailable";
  try {
    const healthResponse = await gatewayEntry.fetch(
      new Request("http://localhost/health", { headers: { "x-request-id": "req-status" } }),
    );
    health = JSON.stringify(await healthResponse.json(), null, 2);
  } catch {
    health = "unavailable";
  }
  const rows = ENDPOINTS.map(
    ([method, path]) => `<tr><td>${method}</td><td><code>${path}</code></td></tr>`,
  ).join("");
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Pact — local runtime</title>
<style>
:root{color-scheme:dark}
body{margin:0;padding:2.5rem 1.5rem;background:#0b0d12;color:#e6e9f0;font:14px/1.65 ui-monospace,SFMono-Regular,Menlo,monospace}
main{max-width:44rem;margin:0 auto}
h1{font-size:1.05rem;letter-spacing:.02em;margin:0 0 .4rem}
h2{font-size:.8rem;text-transform:uppercase;letter-spacing:.12em;color:#7c86a0;margin:0 0 .6rem}
p.sub{margin:0 0 2rem;color:#8b93a7}
section{margin-bottom:2rem}
table{border-collapse:collapse;width:100%}
td{padding:.2rem 1rem .2rem 0;color:#c8cee0}
td:first-child{color:#7fd1b9;width:4rem}
pre{background:#151a23;border:1px solid #232a38;border-radius:8px;padding:1rem;overflow:auto;margin:0;color:#a5b3d1}
</style>
</head>
<body>
<main>
<h1>Pact — local runtime</h1>
<p class="sub">Backend-only repository: this port serves the existing session, AI-gateway and agent-executor function handlers. There is no web UI in this repo yet.</p>
<section><h2>Health</h2><pre>${health}</pre></section>
<section><h2>Endpoints</h2><table>${rows}</table></section>
</main>
</body>
</html>`;
  response.statusCode = 200;
  response.setHeader("content-type", "text/html; charset=utf-8");
  response.end(html);
}

async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
  if (request.method === "GET" && url.pathname === "/") {
    await renderStatus(response);
    return;
  }
  const route = ROUTES.find((candidate) => candidate.matches(url.pathname));
  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  const body = hasBody ? await readBody(request) : undefined;
  const webRequest = new Request(url, {
    method: request.method,
    headers: toHeaders(request.headers),
    body: body !== undefined && body.length > 0 ? body : undefined,
    duplex: "half",
  });
  const webResponse =
    route === undefined
      ? new Response(JSON.stringify({ code: "INPUT_INVALID", message: "Unsupported route." }), {
          status: 404,
          headers: { "content-type": "application/json" },
        })
      : await route.handler(webRequest);
  response.statusCode = webResponse.status;
  webResponse.headers.forEach((value, name) => response.setHeader(name, value));
  response.end(Buffer.from(await webResponse.arrayBuffer()));
}

createServer((request, response) => {
  handle(request, response).catch(() => {
    response.statusCode = 500;
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ code: "INPUT_INVALID", message: "Local host failure." }));
  });
}).listen(PORT, HOST, () => {
  console.log(`Pact local runtime listening on http://${HOST}:${PORT}`);
});
