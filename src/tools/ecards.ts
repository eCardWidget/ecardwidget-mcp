import { z } from "zod";
import { EcwApiError } from "../types.js";
import { errorResult, jsonResult, textResult, type EcwTool } from "./registry.js";

/**
 * List the eCards available inside a specific widget — the way to discover the
 * `ecardId` values that ecw_send_ecard needs. (Public get-ecards endpoint.)
 */
export const getWidgetEcardsTool: EcwTool = {
  name: "ecw_get_widget_ecards",
  requires: "ecards:read",
  register(server, client) {
    server.registerTool(
      "ecw_get_widget_ecards",
      {
        title: "Get a widget's eCards",
        description:
          "List the eCards inside a widget, returning each eCard's `ecardid` and name. Pass a widget's " +
          "vanity id (from ecw_list_widgets). Use the returned ecardid with ecw_send_ecard.",
        inputSchema: {
          widget_id: z.string().min(1).describe("Widget vanity id (from ecw_list_widgets)."),
        },
        annotations: { readOnlyHint: true, openWorldHint: true },
      },
      async (args: any) => {
        try {
          const data = await client.get("/v2/api/pub/ecard-actions/get-ecards", { widgetId: args.widget_id });
          return jsonResult(data?.data ?? data);
        } catch (e) {
          return errorResult(e instanceof EcwApiError ? e.message : (e as Error).message);
        }
      },
    );
  },
};

/**
 * Create a new eCard design and attach it to a widget. POST /v2/api/ecard/save
 * (which calls saveEcard internally). Artwork can be supplied as a public URL
 * (stored as self_hosted_url) or a base64 blob (ecardimg). `options` passes
 * through any other eCard column so the full design surface is reachable.
 */
export const createEcardTool: EcwTool = {
  name: "ecw_create_ecard",
  requires: "ecards:write",
  register(server, client) {
    server.registerTool(
      "ecw_create_ecard",
      {
        title: "Create an eCard",
        description:
          "Create a new eCard and attach it to a widget. `name` and `widget_id` are required. Supply the " +
          "artwork EITHER as `image_url` (public https URL) OR `image_base64` (base64 string or data: URI) — " +
          "or neither for a text-only card. `details` is the eCard's HTML body. `options` sets any other eCard " +
          "field (price, url_redirect_after_send, videoLink, disabled, customFieldsConfig, …). Get a widget_id " +
          "from ecw_create_widget or ecw_list_widgets. Next: send it with ecw_send_ecard, or include it in a " +
          "campaign (ecw_create_campaign) or automation (ecw_create_automation).",
        inputSchema: {
          name: z.string().min(1).max(255).describe("eCard name/title (required)."),
          widget_id: z
            .number()
            .int()
            .positive()
            .describe("Numeric widget id to attach this eCard to (from ecw_create_widget / ecw_list_widgets)."),
          details: z.string().optional().describe("eCard HTML body (sanitized server-side)."),
          image_url: z
            .string()
            .url()
            .optional()
            .describe("Public https URL of the eCard image (stored as self_hosted_url)."),
          image_base64: z
            .string()
            .optional()
            .describe("eCard image as base64 (raw or data: URI). Use instead of image_url."),
          options: z
            .record(z.any())
            .optional()
            .describe("Any other eCard field (price, url_redirect_after_send, videoLink, disabled, customFieldsConfig, …)."),
        },
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
      },
      async (args: any) => {
        try {
          const myEcard: Record<string, unknown> = {
            name: args.name,
            widgetid: args.widget_id,
            details: args.details ?? " ",
            ...(args.options ?? {}),
          };
          if (args.image_url) myEcard.self_hosted_url = args.image_url;
          const body: Record<string, unknown> = { myEcard };
          if (args.image_base64) body.ecardimg = args.image_base64;
          const data = await client.post("/v2/api/ecard/save", body);
          const e = data?.data ?? {};
          return textResult(
            `Created eCard "${e.name ?? args.name}" (id ${e.id ?? "?"}) on widget ${e.widgetid ?? args.widget_id}.`,
          );
        } catch (err) {
          return errorResult(err instanceof EcwApiError ? err.message : (err as Error).message);
        }
      },
    );
  },
};

/**
 * Send / schedule / share a single eCard. Reaches an external recipient (email)
 * so it's annotated openWorldHint; it is a normal single-recipient write (NOT
 * the two-phase destructive flow, which is reserved for send-to-many campaigns).
 */
export const sendEcardTool: EcwTool = {
  name: "ecw_send_ecard",
  requires: "ecards:write",
  register(server, client) {
    server.registerTool(
      "ecw_send_ecard",
      {
        title: "Send an eCard",
        description:
          "Send, schedule, or share a single eCard. Emails it now by default; set type='ecard_copy_link' to " +
          "get a shareable link instead of emailing; set scheduled_send_date (future ISO datetime) to schedule. " +
          "Get an ecard_id from ecw_get_widget_ecards or ecw_search_ecards.",
        inputSchema: {
          ecard_id: z.string().min(1).describe("eCard vanity id (from ecw_get_widget_ecards / ecw_search_ecards)."),
          sender_email: z.string().email().describe("Who the eCard is from."),
          sender_name: z.string().min(1).describe("Sender display name."),
          recipient_name: z.string().min(1).describe("Recipient display name."),
          recipient_email: z
            .string()
            .email()
            .optional()
            .describe("Required for email sends; omit for a share link."),
          personal_message: z.string().optional().describe("Optional personal note (basic HTML allowed)."),
          type: z
            .enum(["email", "ecard_copy_link"])
            .optional()
            .describe("email (default) emails it; ecard_copy_link returns a shareUrl instead."),
          scheduled_send_date: z
            .string()
            .optional()
            .describe("Optional FUTURE ISO datetime to schedule the send; omit to send now."),
          locale: z.string().optional().describe("Render language (e.g. en, spanish, french). Defaults to en."),
          merge_tags: z
            .record(z.string())
            .optional()
            .describe("Key/value pairs filling the eCard's custom fields / merge tags."),
        },
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
      },
      async (args: any) => {
        const type = args.type ?? "email";
        if (type === "email" && !args.recipient_email) {
          return errorResult("recipient_email is required when type is 'email'. Provide it, or use type='ecard_copy_link'.");
        }
        try {
          const data = await client.post("/v2/api/pub/ecard-actions/send-ecard", {
            ecardId: args.ecard_id,
            senderEmail: args.sender_email,
            senderName: args.sender_name,
            recipientName: args.recipient_name,
            recipientEmail: args.recipient_email,
            personalMessage: args.personal_message,
            type,
            scheduledSendDate: args.scheduled_send_date,
            locale: args.locale,
            mergeTags: args.merge_tags,
          });
          const result = data?.data ?? data;
          const shareUrl = result?.shareUrl ?? result?.share_url;
          if (shareUrl) return textResult(`Share link created: ${shareUrl}`);
          return textResult(
            `eCard ${args.scheduled_send_date ? "scheduled" : "sent"} to ${args.recipient_name}` +
              (args.recipient_email ? ` <${args.recipient_email}>` : "") + ".",
          );
        } catch (e) {
          return errorResult(e instanceof EcwApiError ? e.message : (e as Error).message);
        }
      },
    );
  },
};
