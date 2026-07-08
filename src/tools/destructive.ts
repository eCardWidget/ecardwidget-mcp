import { z } from "zod";
import { EcwApiError } from "../types.js";
import { issueConfirmToken, useConfirmToken } from "../confirm.js";
import { errorResult, textResult, type EcwTool } from "./registry.js";

/**
 * Permanently delete a directory team member — two-phase.
 * 1st call (no confirm_token): dry-run preview + a one-time token.
 * 2nd call (with confirm_token): executes the delete.
 */
export const deleteTeamMemberTool: EcwTool = {
  name: "ecw_delete_team_member",
  requires: "directory:write",
  register(server, client) {
    server.registerTool(
      "ecw_delete_team_member",
      {
        title: "Delete a team member (permanent)",
        description:
          "Permanently delete a directory team member by email. This is a two-step, irreversible action: " +
          "call once WITHOUT confirm_token to get a preview and a confirmation token, then call again WITH " +
          "that confirm_token to actually delete. To deactivate instead of delete, use ecw_deactivate_team_member.",
        inputSchema: {
          email: z.string().email().describe("Email of the member to permanently delete."),
          confirm_token: z
            .string()
            .optional()
            .describe("Leave empty for a preview; pass the token from the preview to execute the delete."),
        },
        annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
      },
      async (args: any) => {
        const fingerprint = `delete_member:${String(args.email).toLowerCase()}`;
        if (!args.confirm_token) {
          let who = args.email;
          try {
            const found = await client.get("/v2/api/pub/team-member-actions/find", { email: args.email });
            const m = found?.data ?? found;
            const name = [m?.first_name, m?.last_name].filter(Boolean).join(" ").trim();
            if (name) who = `${name} <${args.email}>`;
          } catch {
            /* still allow a preview even if lookup fails */
          }
          const token = issueConfirmToken(fingerprint);
          return textResult(
            `⚠️ This will PERMANENTLY delete team member ${who}. This cannot be undone.\n` +
              `To proceed, call ecw_delete_team_member again with confirm_token="${token}" (valid 5 minutes).`,
          );
        }
        const check = useConfirmToken(args.confirm_token, fingerprint);
        if (!check.ok) {
          return errorResult(`Not deleted: ${check.reason}. Call again without confirm_token for a fresh preview.`);
        }
        try {
          await client.post("/v2/api/pub/team-member-actions/delete", { email: args.email });
          return textResult(`Permanently deleted team member ${args.email}.`);
        } catch (e) {
          return errorResult(e instanceof EcwApiError ? e.message : (e as Error).message);
        }
      },
    );
  },
};

/** Deactivate (reversible) a team member — a safe alternative to delete. */
export const deactivateTeamMemberTool: EcwTool = {
  name: "ecw_deactivate_team_member",
  requires: "directory:write",
  register(server, client) {
    server.registerTool(
      "ecw_deactivate_team_member",
      {
        title: "Deactivate a team member",
        description:
          "Deactivate a directory team member by email (reversible — they stop receiving automated cards but " +
          "aren't deleted). Use ecw_upsert_team_member to reactivate, or ecw_delete_team_member to remove entirely.",
        inputSchema: { email: z.string().email().describe("Email of the member to deactivate.") },
        annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
      },
      async (args: any) => {
        try {
          await client.post("/v2/api/pub/team-member-actions/deactivate", { email: args.email });
          return textResult(`Deactivated team member ${args.email}. Re-add them with ecw_upsert_team_member to reactivate.`);
        } catch (e) {
          return errorResult(e instanceof EcwApiError ? e.message : (e as Error).message);
        }
      },
    );
  },
};

/**
 * Delete a widget (and its eCards) — two-phase. A widget that's in use (attached
 * to automations/campaigns or with send history) is protected server-side: the
 * delete comes back needing dashboard confirmation, and we surface why.
 */
export const deleteWidgetTool: EcwTool = {
  name: "ecw_delete_widget",
  requires: "widgets:write",
  register(server, client) {
    server.registerTool(
      "ecw_delete_widget",
      {
        title: "Delete a widget (permanent)",
        description:
          "Permanently delete a widget and its eCards. Two-step: call once WITHOUT confirm_token for a preview " +
          "and a confirmation token, then again WITH the token to delete. A widget that's used by automations or " +
          "campaigns (or has send history) can only be deleted from the dashboard.",
        inputSchema: {
          widget_id: z.number().int().positive().describe("Numeric widget id (from ecw_list_widgets)."),
          confirm_token: z.string().optional().describe("Leave empty for a preview; pass the token to delete."),
        },
        annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
      },
      async (args: any) => {
        const fingerprint = `delete_widget:${args.widget_id}`;
        if (!args.confirm_token) {
          const token = issueConfirmToken(fingerprint);
          return textResult(
            `⚠️ This will PERMANENTLY delete widget #${args.widget_id} and its eCards. This cannot be undone.\n` +
              `To proceed, call ecw_delete_widget again with confirm_token="${token}" (valid 5 minutes).`,
          );
        }
        const check = useConfirmToken(args.confirm_token, fingerprint);
        if (!check.ok) return errorResult(`Not deleted: ${check.reason}. Call again without confirm_token for a fresh preview.`);
        try {
          const r = await client.post("/v2/api/widget/deleteWidgets", { widgetids: [args.widget_id] });
          const rd = r?.data ?? r;
          if (rd?.requires_otp) return errorResult(inUseMessage("widget", rd?.impact));
          return textResult(`Permanently deleted widget #${args.widget_id}.`);
        } catch (e) {
          return errorResult(e instanceof EcwApiError ? e.message : (e as Error).message);
        }
      },
    );
  },
};

/**
 * Delete an eCard (design) — two-phase. An eCard in use is protected server-side
 * the same way; we surface the dashboard requirement.
 */
export const deleteEcardTool: EcwTool = {
  name: "ecw_delete_ecard",
  requires: "ecards:write",
  register(server, client) {
    server.registerTool(
      "ecw_delete_ecard",
      {
        title: "Delete an eCard (permanent)",
        description:
          "Permanently delete an eCard design. Two-step: call once WITHOUT confirm_token for a preview and a " +
          "confirmation token, then again WITH the token to delete. An eCard that's in use may only be deletable " +
          "from the dashboard.",
        inputSchema: {
          ecard_id: z.number().int().positive().describe("Numeric eCard id (from ecw_search_ecards)."),
          confirm_token: z.string().optional().describe("Leave empty for a preview; pass the token to delete."),
        },
        annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
      },
      async (args: any) => {
        const fingerprint = `delete_ecard:${args.ecard_id}`;
        if (!args.confirm_token) {
          const token = issueConfirmToken(fingerprint);
          return textResult(
            `⚠️ This will PERMANENTLY delete eCard #${args.ecard_id}. This cannot be undone.\n` +
              `To proceed, call ecw_delete_ecard again with confirm_token="${token}" (valid 5 minutes).`,
          );
        }
        const check = useConfirmToken(args.confirm_token, fingerprint);
        if (!check.ok) return errorResult(`Not deleted: ${check.reason}. Call again without confirm_token for a fresh preview.`);
        try {
          const r = await client.post("/v2/api/ecard/deleteEcards", { ecardids: [args.ecard_id] });
          const rd = r?.data ?? r;
          if (rd?.requires_otp) return errorResult(inUseMessage("eCard", rd?.impact));
          return textResult(`Permanently deleted eCard #${args.ecard_id}.`);
        } catch (e) {
          return errorResult(e instanceof EcwApiError ? e.message : (e as Error).message);
        }
      },
    );
  },
};

function inUseMessage(kind: string, impact?: any): string {
  const parts: string[] = [];
  if (impact?.totals?.automations) parts.push(`${impact.totals.automations} automation(s)`);
  if (impact?.totals?.campaigns) parts.push(`${impact.totals.campaigns} campaign(s)`);
  const used = parts.length ? ` (used by ${parts.join(" and ")})` : "";
  return `This ${kind} is in use${used}, so deleting it needs confirmation in your dashboard for security. Remove it from those first, or delete it there.`;
}

/**
 * Send a campaign to all its recipients — two-phase (high blast radius).
 * 1st call (no confirm_token): preview + token. 2nd call: sends.
 * Gift-card campaigns can't be sent via API (extra dashboard confirmation).
 */
export const sendCampaignTool: EcwTool = {
  name: "ecw_send_campaign",
  requires: "campaigns:write",
  register(server, client) {
    server.registerTool(
      "ecw_send_campaign",
      {
        title: "Send a campaign",
        description:
          "Send a campaign to all of its recipients immediately. Two-step: call once WITHOUT confirm_token for " +
          "a preview and a confirmation token, then call again WITH that token to send. Gift-card campaigns must " +
          "be sent from the dashboard.",
        inputSchema: {
          campaign_id: z.number().int().positive().describe("Numeric campaign id (from ecw_list_campaigns)."),
          confirm_token: z
            .string()
            .optional()
            .describe("Leave empty for a preview; pass the token from the preview to send."),
        },
        annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
      },
      async (args: any) => {
        const fingerprint = `send_campaign:${args.campaign_id}`;
        if (!args.confirm_token) {
          let name = `#${args.campaign_id}`;
          try {
            const c = await client.get("/v2/api/campaign/findOne", { id: args.campaign_id });
            const cd = c?.data ?? c;
            if (cd?.campaign_name) name = `"${cd.campaign_name}"`;
          } catch {
            /* still allow preview */
          }
          const token = issueConfirmToken(fingerprint);
          return textResult(
            `⚠️ This will SEND campaign ${name} to all of its recipients immediately.\n` +
              `To proceed, call ecw_send_campaign again with confirm_token="${token}" (valid 5 minutes).`,
          );
        }
        const check = useConfirmToken(args.confirm_token, fingerprint);
        if (!check.ok) {
          return errorResult(`Not sent: ${check.reason}. Call again without confirm_token for a fresh preview.`);
        }
        try {
          const r = await client.post("/v2/api/campaign/send", { campaignid: args.campaign_id });
          const rd = r?.data ?? r;
          if (rd?.requires_otp) {
            return errorResult(
              "This is a gift-card campaign — sending requires extra confirmation in your dashboard. Review and send it there.",
            );
          }
          return textResult(`Campaign ${args.campaign_id} sent to its recipients.`);
        } catch (e) {
          if (e instanceof EcwApiError && e.status === 403 && /otp|gift/i.test(e.message)) {
            return errorResult("Gift-card campaigns must be sent from the dashboard (extra confirmation required).");
          }
          return errorResult(e instanceof EcwApiError ? e.message : (e as Error).message);
        }
      },
    );
  },
};
