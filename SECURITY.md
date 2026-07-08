# Security Model

The eCardWidget MCP server is designed so an AI assistant can act in your account **without** being able to
exceed what you explicitly allowed. This document is the threat model and the controls.

## Principles

1. **Least privilege by construction.** The server authenticates with a single **scoped API key** that you
   generate and configure per-area (`none` / `view` / `manage`). The key's scope is the hard ceiling.

2. **Server-side enforcement is the real guarantee.** The eCardWidget API independently enforces the key's
   scope on every request (403 on anything out of scope), throttles it (120 req/min by default), and audits
   every use. The MCP server's client-side tool-hiding is UX + defense-in-depth, **not** the security
   boundary — a compromised client still cannot exceed the key's scope.

3. **Introspection-driven exposure.** On startup the server calls `GET /v2/api/key/info` and registers only
   the tools the key is authorized for. The model never even sees tools it can't use.

## Controls

| Risk                              | Control                                                                         |
| --------------------------------- | ------------------------------------------------------------------------------- |
| Over-broad access                 | Per-area scoped keys; server-side 403 on out-of-scope calls.                    |
| Secret leakage                    | API key read from `ECW_API_KEY` env only; never logged; `/key/info` returns no key values. |
| Destructive / high-blast actions  | Two-phase confirm: a dry-run **preview + one-time token** first, then execute.  |
| Rate abuse / runaway loops        | Server throttles per key; the client honors `429` + `Retry-After` with backoff. |
| Tool poisoning / prompt injection | Tool descriptions are static and contain no user/account content; inputs are schema-validated (zod). |
| Stdout corruption                 | All diagnostics go to **stderr**; stdout is reserved for the MCP JSON-RPC channel. |

## Tool annotations

Every tool carries MCP [tool annotations](https://modelcontextprotocol.io) — `readOnlyHint`,
`destructiveHint`, `idempotentHint`, `openWorldHint`. These are **hints for clients**, not guarantees;
the guarantees are the scoped key + server-side enforcement + the two-phase destructive flow.

## Handling your API key

- Store it in your MCP client's config `env` (or a secret manager), never in source control.
- Scope it to only what the assistant needs; rotate it if exposed (Settings → Developers → API Keys).
- Revoking the key in the dashboard immediately disables this server.

## Reporting

Found a security issue? Email **security@ecardwidget.com**. Please do not open a public issue for
vulnerabilities.
