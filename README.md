# eCardWidget MCP Server

[![npm](https://img.shields.io/npm/v/%40ecardwidget%2Fmcp.svg)](https://www.npmjs.com/package/@ecardwidget/mcp)

The official [Model Context Protocol](https://modelcontextprotocol.io) server for
**[eCardWidget](https://www.ecardwidget.com)**. Let an AI assistant (Claude Desktop, Claude Code, Cursor,
…) work in your eCardWidget account — search and send eCards, manage your directory, list
campaigns/widgets/automations — using an **API key you generate and scope yourself**.

> **The assistant can only ever do what your API key permits.** On startup the server asks the API what
> the key is allowed to do and registers **only** the tools that key is scoped for. All scope enforcement,
> throttling, and auditing happen server-side.

## Quick start

1. **Generate a scoped API key** — in your eCardWidget dashboard: **Settings → Developers → API Keys**.
   Grant only the areas you want the assistant to touch.
2. **Add it to your MCP client:**

   ```json
   {
     "mcpServers": {
       "ecardwidget": {
         "command": "npx",
         "args": ["-y", "@ecardwidget/mcp"],
         "env": { "ECW_API_KEY": "YOUR_API_KEY" }
       }
     }
   }
   ```

   Or with the Claude Code CLI:

   ```bash
   claude mcp add ecardwidget --env ECW_API_KEY=YOUR_API_KEY -- npx -y @ecardwidget/mcp
   ```

3. Restart your client. It connects and shows the tools your key is scoped for.

## Configuration

| Variable       | Required | Default                       | Description                                  |
| -------------- | -------- | ----------------------------- | -------------------------------------------- |
| `ECW_API_KEY`  | yes      | —                             | Your scoped API key (used as a Bearer token).|
| `ECW_BASE_URL` | no       | `https://app.ecardwidget.com` | Override only for a custom domain / testing. |

## Tools

All tools are namespaced `ecw_*`; only those your key is scoped for are registered.

- **Introspection:** `ecw_whoami`
- **eCards:** `ecw_search_ecards`, `ecw_get_widget_ecards`, `ecw_send_ecard`
- **Directory:** `ecw_list_team_members`, `ecw_find_team_member`, `ecw_upsert_team_member`,
  `ecw_import_team_members`, `ecw_deactivate_team_member`, `ecw_delete_team_member`
- **Widgets:** `ecw_list_widgets`, `ecw_duplicate_widget`, `ecw_delete_widget`
- **eCards:** `ecw_delete_ecard` (plus search/send above)
- **Automations:** `ecw_list_automations`, `ecw_create_automation` (birthday / anniversary / onboarding)
- **Campaigns:** `ecw_list_campaigns`, `ecw_create_campaign` (draft), `ecw_send_campaign`

Destructive tools (delete, send campaign) use a **two-step confirmation** — call once for a preview + a
one-time token, then again with the token to execute. Deleting automations/campaigns and sending
gift-card campaigns require confirmation in the dashboard.

Ask naturally, e.g. *"Send a birthday eCard from our Thank-You widget to grace@acme.com"*.

## Security

See [SECURITY.md](./SECURITY.md). In short: least-privilege scoped keys, server-side enforcement is the
real guarantee, destructive actions require a two-step confirmation, and the API key is never logged.

## Development

```bash
npm install
npm run build          # tsup → dist/index.js
npm test               # vitest
npm run inspector      # MCP Inspector against the built server (needs ECW_API_KEY)
```

## License

MIT
