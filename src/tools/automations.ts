import { z } from "zod";
import { EcwApiError } from "../types.js";
import { errorResult, textResult, type EcwTool } from "./registry.js";

/**
 * Create a recipient-date automation (birthday / anniversary / onboarding) that
 * auto-sends an eCard to directory members on their special day. These are the
 * common, self-contained automation types — they match members by their stored
 * date fields and need no extra trigger config.
 *
 * (Holiday, fixed-date, and rule-based automations require additional trigger
 * configuration and are best set up in the dashboard; this tool doesn't create
 * those.)
 */
export const createAutomationTool: EcwTool = {
  name: "ecw_create_automation",
  requires: "automations:write",
  register(server, client) {
    server.registerTool(
      "ecw_create_automation",
      {
        title: "Create an automation (birthday / anniversary / onboarding)",
        description:
          "Create an automation that automatically sends an eCard to directory members on a recurring " +
          "personal date: 'birthday', 'anniversary' (work anniversary), or 'onboarding'. Pick the eCards it " +
          "sends from (numeric ids from ecw_search_ecards — a random one is chosen per send). Members are " +
          "matched from the directory by their stored dates. Holiday/fixed-date/rule-based automations aren't " +
          "created here — set those up in the dashboard.",
        inputSchema: {
          name: z.string().min(1).describe("A name for the automation."),
          event_type: z
            .enum(["birthday", "anniversary", "onboarding"])
            .describe("birthday, anniversary (work anniversary), or onboarding."),
          ecard_ids: z
            .array(z.number().int().positive())
            .min(1)
            .describe("Numeric eCard ids to send from (from ecw_search_ecards). One is chosen at random per send."),
          from_name: z.string().optional().describe("Sender display name (defaults to the account's)."),
          from_email: z.string().email().optional().describe("Sender email (defaults to the account's)."),
          send_time: z
            .string()
            .regex(/^\d{2}:\d{2}$/)
            .optional()
            .describe("Local send time HH:MM (24h). Default 09:00."),
          timezone: z.string().optional().describe("IANA timezone for send_time. Default America/New_York."),
          enabled: z.boolean().optional().describe("Start it enabled (default true)."),
        },
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
      },
      async (args: any) => {
        try {
          const data = await client.post("/v2/api/automation/save", {
            automation: {
              automation_name: args.name,
              event_type: args.event_type,
              recipient_source: "directory",
              selected_ecard_ids: args.ecard_ids,
              from_name: args.from_name,
              from_email: args.from_email,
              send_time: args.send_time ?? "09:00",
              timezone: args.timezone ?? "America/New_York",
              enabled: args.enabled ?? true,
            },
          });
          const result = data?.data ?? data;
          const id = result?.id;
          return textResult(
            id
              ? `Created ${args.event_type} automation "${args.name}" (id ${id}), ` +
                  `${args.enabled === false ? "disabled" : "enabled"}, sending at ${args.send_time ?? "09:00"} ` +
                  `${args.timezone ?? "America/New_York"} from ${args.ecard_ids.length} eCard(s).`
              : `Automation "${args.name}" saved.`,
          );
        } catch (e) {
          return errorResult(e instanceof EcwApiError ? e.message : (e as Error).message);
        }
      },
    );
  },
};
