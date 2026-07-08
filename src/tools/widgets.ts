import { z } from "zod";
import { EcwApiError } from "../types.js";
import { errorResult, textResult, type EcwTool } from "./registry.js";

/**
 * Create a new widget by duplicating an existing one (with its eCards). This is
 * the reliable "spin up a new widget" path — it yields a complete, valid widget
 * (theme, settings, and eCards intact) rather than a bare shell. Use
 * ecw_list_widgets to pick a source, then rename/configure the copy afterward.
 */
export const duplicateWidgetTool: EcwTool = {
  name: "ecw_duplicate_widget",
  requires: "widgets:write",
  register(server, client) {
    server.registerTool(
      "ecw_duplicate_widget",
      {
        title: "Create a widget (duplicate an existing one)",
        description:
          "Create a new widget by duplicating an existing one — the copy keeps the source's theme, " +
          "settings, and eCards, so it's immediately usable. Pass the numeric id of a source widget " +
          "(from ecw_list_widgets). The new widget is named 'Copy - <source name>'; rename it in the " +
          "dashboard or with a follow-up update.",
        inputSchema: {
          source_widget_id: z
            .number()
            .int()
            .positive()
            .describe("Numeric id of the widget to duplicate (from ecw_list_widgets)."),
          ecard_limit: z
            .number()
            .int()
            .positive()
            .optional()
            .describe("Optional cap on how many eCards to copy (default: all)."),
        },
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
      },
      async (args: any) => {
        try {
          const data = await client.post("/v2/api/widget/copyWidgetWithEcards", {
            widgetid: args.source_widget_id,
            limit: args.ecard_limit,
          });
          const newId = data?.data?.widgetid ?? data?.widgetid;
          return textResult(
            newId
              ? `Created a new widget (id ${newId}) by duplicating widget ${args.source_widget_id}. ` +
                  `Rename/configure it in the dashboard or with a follow-up update.`
              : `Widget duplicated from ${args.source_widget_id}.`,
          );
        } catch (e) {
          return errorResult(e instanceof EcwApiError ? e.message : (e as Error).message);
        }
      },
    );
  },
};
