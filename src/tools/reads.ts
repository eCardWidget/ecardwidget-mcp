import { z } from "zod";
import { EcwApiError, type Capability } from "../types.js";
import { errorResult, jsonResult, type EcwTool } from "./registry.js";

/**
 * Factory for the list/read tools. They're thin GETs over verified Bearer
 * endpoints; the model gets a `response_format` (concise = compact JSON,
 * detailed = pretty) plus pagination to stay token-efficient. Unknown query
 * params are ignored server-side, so passing keyword/page everywhere is safe.
 */
function makeListTool(opts: {
  name: string;
  requires: Capability;
  title: string;
  description: string;
  path: string;
  supportsKeyword?: boolean;
}): EcwTool {
  return {
    name: opts.name,
    requires: opts.requires,
    register(server, client) {
      const inputSchema: Record<string, z.ZodTypeAny> = {
        page: z.number().int().positive().optional().describe("Page number (default 1)."),
        per_page: z.number().int().positive().max(100).optional().describe("Results per page (default server-side)."),
        response_format: z
          .enum(["concise", "detailed"])
          .optional()
          .describe("concise (default, compact) or detailed (pretty-printed with all fields)."),
      };
      if (opts.supportsKeyword) {
        inputSchema.keyword = z.string().optional().describe("Free-text search filter.");
      }

      server.registerTool(
        opts.name,
        {
          title: opts.title,
          description: opts.description,
          inputSchema,
          annotations: { readOnlyHint: true, openWorldHint: true },
        },
        async (args: any) => {
          try {
            const data = await client.get(opts.path, {
              page: args.page,
              perPage: args.per_page,
              keyword: opts.supportsKeyword ? args.keyword : undefined,
            });
            const payload = data?.data ?? data;
            return jsonResult(payload, args.response_format === "detailed");
          } catch (e) {
            return errorResult(e instanceof EcwApiError ? e.message : (e as Error).message);
          }
        },
      );
    },
  };
}

export const searchEcardsTool = makeListTool({
  name: "ecw_search_ecards",
  requires: "ecards:read",
  title: "Search eCards",
  description:
    "List/search the account's eCards (templates and designs). Returns each eCard's name and id. " +
    "Use an eCard's id with ecw_send_ecard.",
  path: "/v2/api/ecard/search",
  supportsKeyword: true,
});

export const listCampaignsTool = makeListTool({
  name: "ecw_list_campaigns",
  requires: "campaigns:read",
  title: "List campaigns",
  description: "List the account's bulk eCard campaigns with their status and key details.",
  path: "/v2/api/campaign/list",
});

export const listWidgetsTool = makeListTool({
  name: "ecw_list_widgets",
  requires: "widgets:read",
  title: "List widgets",
  description:
    "List the account's widgets (embeddable eCard forms). Returns each widget's name and vanity id — " +
    "use a widget id to scope eCard listings or sends.",
  path: "/v2/api/widget/search",
  supportsKeyword: true,
});

export const listAutomationsTool = makeListTool({
  name: "ecw_list_automations",
  requires: "automations:read",
  title: "List automations",
  description: "List the account's automations (birthday, anniversary, holiday, and rule-based scheduled sends).",
  path: "/v2/api/automation/list",
});

export const listTeamMembersTool = makeListTool({
  name: "ecw_list_team_members",
  requires: "directory:read",
  title: "List team members",
  description:
    "List/search the directory (team members / recipients) with their names, emails, departments, and dates. " +
    "Use ecw_upsert_team_member to add or update one.",
  path: "/v2/api/team-member/search",
  supportsKeyword: true,
});
