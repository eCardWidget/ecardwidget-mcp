import { z } from "zod";
import { EcwApiError } from "../types.js";
import { errorResult, textResult, type EcwTool } from "./registry.js";

/**
 * Create a bulk eCard campaign as a DRAFT (never auto-sends). Optionally attaches
 * eCards and directory-member recipients in the same call. Sending is a separate,
 * confirmed step (ecw_send_campaign) — so an agent can compose a campaign safely
 * and a human/second step commits the send.
 *
 * Wraps the multi-step backend flow: save → saveCampaignEcards → saveRecipients.
 */
export const createCampaignTool: EcwTool = {
  name: "ecw_create_campaign",
  requires: "campaigns:write",
  register(server, client) {
    server.registerTool(
      "ecw_create_campaign",
      {
        title: "Create a campaign (draft)",
        description:
          "Create a bulk eCard campaign as a DRAFT — it is NOT sent. Optionally attach eCards (numeric ids from " +
          "ecw_search_ecards) and directory-member recipients (ids from ecw_list_team_members). Review and send " +
          "it later with ecw_send_campaign or in the dashboard.",
        inputSchema: {
          name: z.string().min(1).describe("Campaign name."),
          from_name: z.string().optional().describe("Sender display name (defaults to the account's)."),
          from_email: z.string().email().optional().describe("Sender email (defaults to the account's)."),
          ecard_ids: z
            .array(z.number().int().positive())
            .optional()
            .describe("Numeric eCard ids to include (from ecw_search_ecards)."),
          directory_member_ids: z
            .array(z.number().int().positive())
            .optional()
            .describe("Directory member ids to send to (from ecw_list_team_members)."),
        },
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
      },
      async (args: any) => {
        try {
          const saved = await client.post("/v2/api/campaign/save", {
            campaign: {
              campaign_name: args.name,
              from_name: args.from_name,
              from_email: args.from_email,
            },
          });
          const cd = saved?.data ?? saved;
          const campaignId = cd?.id;
          if (!campaignId) {
            return errorResult(`Campaign was not created (no id returned): ${JSON.stringify(cd)}`);
          }

          const steps: string[] = [`Created draft campaign "${args.name}" (id ${campaignId}).`];

          if (Array.isArray(args.ecard_ids) && args.ecard_ids.length) {
            await client.post("/v2/api/campaign/saveCampaignEcards", {
              campaignid: campaignId,
              ecardIds: args.ecard_ids,
            });
            steps.push(`Attached ${args.ecard_ids.length} eCard(s).`);
          }

          if (Array.isArray(args.directory_member_ids) && args.directory_member_ids.length) {
            await client.post("/v2/api/campaign/saveRecipients", {
              campaignid: campaignId,
              directoryMemberIds: args.directory_member_ids,
            });
            steps.push(`Added ${args.directory_member_ids.length} recipient(s) from the directory.`);
          }

          steps.push(`It's a DRAFT — review and send with ecw_send_campaign (campaign_id ${campaignId}) or in the dashboard.`);
          return textResult(steps.join(" "));
        } catch (e) {
          return errorResult(e instanceof EcwApiError ? e.message : (e as Error).message);
        }
      },
    );
  },
};
