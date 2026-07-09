import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { EcwClient } from "./client.js";
import type { KeyInfo } from "./types.js";
import { ALL_TOOLS } from "./tools/index.js";
import { registerScopedTools } from "./tools/registry.js";
import { ALL_PROMPTS, registerScopedPrompts } from "./prompts.js";

export const SERVER_NAME = "ecardwidget";
export const SERVER_VERSION = "0.5.2";

/** Server-level context handed to the model at connect: the object model, the
 *  canonical flows, discovery, and the safety rules. Kept compact — it's always
 *  in context. */
const INSTRUCTIONS = [
  "eCardWidget sends digital greeting cards (\"eCards\") and reward gift cards — one at a time or in bulk.",
  "Manage an account here with a scoped API key.",
  "",
  "OBJECT MODEL:",
  "- Widgets hold eCards and their branding/send settings. eCards are the card designs (each belongs to a widget).",
  "- Team members (the \"directory\") are the people your campaigns and automations target.",
  "- Campaigns = one-time bulk sends. Automations = recurring event-based sends (birthday, anniversary, onboarding, holiday).",
  "  Both deliver eCards (and optionally a gift card) to recipients.",
  "",
  "CORE FLOWS:",
  "- New widget + cards: ecw_create_widget -> ecw_create_ecard (attach by widget_id; artwork via image URL or base64).",
  "- Send one eCard: ecw_search_ecards / ecw_get_widget_ecards -> ecw_send_ecard (email, schedule, or share link).",
  "- Run a campaign: ecw_create_campaign (a DRAFT with eCards + recipients) -> review -> ecw_send_campaign (two-step confirm).",
  "- Recurring automation: ecw_create_automation (birthday/anniversary/onboarding; targets directory members).",
  "- Directory: ecw_upsert_team_member / ecw_import_team_members; ecw_find_team_member / ecw_list_team_members.",
  "",
  "DISCOVERY: call ecw_whoami for this key's exact scope (only scoped tools appear; out-of-scope = 403).",
  "Call ecw_describe_fields(entity) to see every settable field (types/enums/required) before creating widgets/eCards/campaigns/automations.",
  "Guided flows are available as prompts (run_campaign, setup_automation, spin_up_widget, import_directory).",
  "",
  "SAFETY: destructive actions (deletes, sending a campaign) are two-step — call once for a preview + token, then again with the token.",
  "Deleting automations/campaigns and sending gift-card campaigns are OTP-gated in the dashboard (the tool will say so). Never send/delete without explicit user confirmation.",
].join("\n");

/**
 * Build an MCP server whose registered tools are exactly those the calling key
 * is scoped for (introspection-driven). Returns the server plus which tools
 * were enabled/skipped so the entry point can log a startup summary to stderr.
 */
export function buildServer(
  client: EcwClient,
  keyInfo: KeyInfo,
): { server: McpServer; registered: string[]; skipped: string[] } {
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { instructions: INSTRUCTIONS },
  );

  const { registered, skipped } = registerScopedTools(server, client, keyInfo, ALL_TOOLS);
  registerScopedPrompts(server, keyInfo, ALL_PROMPTS);
  return { server, registered, skipped };
}
