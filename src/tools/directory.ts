import { z } from "zod";
import { EcwApiError } from "../types.js";
import { errorResult, jsonResult, textResult, type EcwTool } from "./registry.js";

const memberFields = {
  email: z.string().email().describe("Team member email (the unique key)."),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  department: z.string().optional(),
  title: z.string().optional(),
  manager_email: z.string().email().optional(),
  date_of_birth: z.string().optional().describe("YYYY-MM-DD (year is privacy-stored)."),
  hire_date: z.string().optional().describe("YYYY-MM-DD"),
  external_id: z.string().optional().describe("Your HR/CRM system's id for this person."),
};

function toPayload(m: any): Record<string, unknown> {
  return {
    email: m.email,
    first_name: m.first_name,
    last_name: m.last_name,
    department: m.department,
    title: m.title,
    manager_email: m.manager_email,
    date_of_birth: m.date_of_birth,
    hire_date: m.hire_date,
    external_id: m.external_id,
  };
}

/** Add or update ONE team member (upsert by email). */
export const upsertTeamMemberTool: EcwTool = {
  name: "ecw_upsert_team_member",
  requires: "directory:write",
  register(server, client) {
    server.registerTool(
      "ecw_upsert_team_member",
      {
        title: "Add or update a team member",
        description:
          "Create or update a single directory team member, matched by email. Provide any subset of fields; " +
          "email is required. For many people at once, use ecw_import_team_members. Once members exist, " +
          "target them with ecw_create_automation (recurring) or ecw_create_campaign (one-time).",
        inputSchema: memberFields,
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
      },
      async (args: any) => {
        try {
          const data = await client.post("/v2/api/pub/team-member-actions/upsert", toPayload(args));
          return jsonResult(data?.data ?? { ok: true });
        } catch (e) {
          return errorResult(e instanceof EcwApiError ? e.message : (e as Error).message);
        }
      },
    );
  },
};

/** Look up a team member by email or external id (public find endpoint). */
export const findTeamMemberTool: EcwTool = {
  name: "ecw_find_team_member",
  requires: "directory:read",
  register(server, client) {
    server.registerTool(
      "ecw_find_team_member",
      {
        title: "Find a team member",
        description: "Look up one directory team member by email or external id.",
        inputSchema: {
          email: z.string().email().optional(),
          external_id: z.string().optional(),
        },
        annotations: { readOnlyHint: true, openWorldHint: true },
      },
      async (args: any) => {
        if (!args.email && !args.external_id) {
          return errorResult("Provide an email or an external_id to look up.");
        }
        try {
          const data = await client.get("/v2/api/pub/team-member-actions/find", {
            email: args.email,
            external_id: args.external_id,
          });
          return jsonResult(data?.data ?? data);
        } catch (e) {
          return errorResult(e instanceof EcwApiError ? e.message : (e as Error).message);
        }
      },
    );
  },
};

const MAX_IMPORT = 200;

/** Bulk add/update team members, one upsert per row, respecting the per-key throttle. */
export const importTeamMembersTool: EcwTool = {
  name: "ecw_import_team_members",
  requires: "directory:write",
  register(server, client) {
    server.registerTool(
      "ecw_import_team_members",
      {
        title: "Import team members (bulk)",
        description:
          `Add or update up to ${MAX_IMPORT} team members in one call (upsert by email). Each row is upserted ` +
          "individually with automatic backoff if the rate limit is hit; returns a summary of successes/failures. " +
          "Once imported, target them with ecw_create_automation (recurring) or ecw_create_campaign (one-time).",
        inputSchema: {
          members: z
            .array(z.object(memberFields))
            .min(1)
            .max(MAX_IMPORT)
            .describe(`Array of team members (max ${MAX_IMPORT}). Each needs at least an email.`),
        },
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
      },
      async (args: any) => {
        const members: any[] = args.members ?? [];
        let ok = 0;
        const failures: Array<{ email: string; error: string }> = [];
        for (const m of members) {
          let attempts = 0;
          // Retry a row up to twice on 429, honoring Retry-After.
          for (;;) {
            try {
              await client.post("/v2/api/pub/team-member-actions/upsert", toPayload(m));
              ok++;
              break;
            } catch (e) {
              if (e instanceof EcwApiError && e.status === 429 && attempts < 2) {
                attempts++;
                await sleep((e.retryAfterSeconds ?? 60) * 1000);
                continue;
              }
              failures.push({ email: m.email, error: e instanceof EcwApiError ? e.message : (e as Error).message });
              break;
            }
          }
        }
        return textResult(
          `Imported ${ok}/${members.length} team member(s).` +
            (failures.length ? `\nFailures:\n${failures.map((f) => `  ${f.email}: ${f.error}`).join("\n")}` : ""),
        );
      },
    );
  },
};

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
