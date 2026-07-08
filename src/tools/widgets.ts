import { z } from "zod";
import { EcwApiError } from "../types.js";
import { errorResult, textResult, type EcwTool } from "./registry.js";

/**
 * Create a brand-new widget from scratch and configure any of its options.
 * POST /v2/api/widget/save with id=0 is the create path; `wconfig` (the theme/
 * display config) is required by the endpoint, so we default it. `options` is a
 * passthrough for any other widget column, so the full builder surface is
 * reachable without enumerating every field here.
 */
export const createWidgetTool: EcwTool = {
  name: "ecw_create_widget",
  requires: "widgets:write",
  register(server, client) {
    server.registerTool(
      "ecw_create_widget",
      {
        title: "Create a widget (from scratch)",
        description:
          "Create a new, empty widget and configure any of its options. `name` is required. `wconfig` holds " +
          "the theme/display config (colors, layout, locale, …) and defaults to {\"locale\":\"en\"}. `options` " +
          "sets any other widget field (e.g. page_heading_html, page_subtitle_html, dir_force_sso, " +
          "custom_fields_preset_id, merge_tag_defaults, gift_card_enabled). Returns the new widget's numeric " +
          "id and vanity id — pass that id to ecw_create_ecard to add eCards.",
        inputSchema: {
          name: z.string().min(1).max(255).describe("Widget name (plain text; shown in lists/dropdowns)."),
          wconfig: z
            .record(z.any())
            .optional()
            .describe('Theme/display config object, e.g. {"locale":"en", ...}. Defaults to {"locale":"en"}.'),
          options: z
            .record(z.any())
            .optional()
            .describe("Any other widget field to set (page_heading_html, dir_force_sso, gift_card_enabled, merge_tag_defaults, …)."),
        },
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
      },
      async (args: any) => {
        try {
          const widget = {
            id: 0,
            name: args.name,
            wconfig: args.wconfig ?? { locale: "en" },
            ...(args.options ?? {}),
          };
          const data = await client.post("/v2/api/widget/save", { widget });
          const w = data?.data?.widget ?? {};
          return textResult(
            `Created widget "${w.name ?? args.name}" (id ${w.id}, vanity ${w.vanity_id ?? "?"}). ` +
              `Add eCards to it with ecw_create_ecard using widget_id ${w.id}.`,
          );
        } catch (e) {
          return errorResult(e instanceof EcwApiError ? e.message : (e as Error).message);
        }
      },
    );
  },
};

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
