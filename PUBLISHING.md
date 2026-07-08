# Publishing

Two steps: publish the npm package (artifact), then publish the metadata to the MCP Registry.

## 1. npm

`ecardwidget-mcp` is an unscoped public package, published under the `ecardwidget` npm account.

```bash
npm run build
npm test
npm login          # as the ecardwidget npm account
npm publish        # unscoped packages are public by default
```

Bump `version` in **both** `package.json` and `server.json` before each release (they must match).

## 2. MCP Registry

The [official MCP Registry](https://registry.modelcontextprotocol.io) hosts metadata (not the artifact),
so publish to npm first. Then:

```bash
# one-time: install the publisher CLI — see https://github.com/modelcontextprotocol/registry
mcp-publisher login github     # verifies the io.github.ecardwidget namespace via the eCardWidget org
mcp-publisher publish          # reads server.json
```

- **Namespace**: `server.json` uses `io.github.ecardwidget/ecardwidget-mcp` (GitHub-verified — matches the
  `eCardWidget` org that owns the repo). To publish under the domain-verified `com.ecardwidget/mcp`
  namespace instead (shorter, on-brand), add the DNS TXT record the registry requires for `ecardwidget.com`
  and change `name` in `server.json` to `com.ecardwidget/mcp`.
- `mcp-publisher` validates `server.json` against the current schema — if the schema URL/fields have moved,
  update them to match the [registry docs](https://registry.modelcontextprotocol.io/docs).

## Verify

After publishing, `npx -y @ecardwidget/mcp` (with `ECW_API_KEY` set) should start and connect. The server
then appears in registry-backed clients' server lists.
