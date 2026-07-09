import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Capability, KeyInfo } from "./types.js";

/**
 * A guided flow template surfaced to the client (as a slash-command / suggestion).
 * Prompts encode multi-step workflows so the model knows what's possible and how
 * the tools chain. Like tools, a prompt is registered ONLY when the key is scoped
 * for the capability it drives.
 */
export interface EcwPrompt {
  name: string;
  requires: Capability | null;
  register: (server: McpServer) => void;
}

/** Register the flow prompts the key is authorized for; report what was on/off. */
export function registerScopedPrompts(
  server: McpServer,
  keyInfo: KeyInfo,
  prompts: EcwPrompt[],
): { registered: string[]; skipped: string[] } {
  const caps = new Set(keyInfo.capabilities);
  const registered: string[] = [];
  const skipped: string[] = [];
  for (const p of prompts) {
    if (p.requires === null || caps.has(p.requires)) {
      p.register(server);
      registered.push(p.name);
    } else {
      skipped.push(p.name);
    }
  }
  return { registered, skipped };
}

function userText(text: string) {
  return { messages: [{ role: "user" as const, content: { type: "text" as const, text } }] };
}

const RUN_CAMPAIGN: EcwPrompt = {
  name: "run_campaign",
  requires: "campaigns:write",
  register(server) {
    server.registerPrompt(
      "run_campaign",
      {
        title: "Run a campaign",
        description: "Guided flow: create a campaign draft, attach eCards + recipients, review, then send.",
        argsSchema: {
          audience: z.string().optional().describe("Who to send to (e.g. 'all engineering', a CSV, a segment)."),
          occasion: z.string().optional().describe("What the campaign is for (e.g. 'Q3 thank-you')."),
          ecard: z.string().optional().describe("Which eCard to send, if known."),
        },
      },
      (args) =>
        userText(
          "Help me run an eCardWidget campaign end to end.\n\n" +
            "Flow:\n" +
            '1. Call ecw_describe_fields("campaign") if you need the field list.\n' +
            "2. ecw_create_campaign — creates a DRAFT (campaign name, from name/email; attach eCards and directory recipients).\n" +
            "3. Confirm the recipient count and the eCard(s) with me.\n" +
            "4. ecw_send_campaign — TWO-STEP: call once for a preview + token, then again with the token to actually send.\n\n" +
            (args.occasion ? `Occasion: ${args.occasion}.\n` : "") +
            (args.audience ? `Audience: ${args.audience}.\n` : "") +
            (args.ecard ? `eCard: ${args.ecard}.\n` : "") +
            "Ask me for anything you still need (name, sender, audience, eCard) and NEVER send without my explicit go-ahead.",
        ),
    );
  },
};

const SETUP_AUTOMATION: EcwPrompt = {
  name: "setup_automation",
  requires: "automations:write",
  register(server) {
    server.registerPrompt(
      "setup_automation",
      {
        title: "Set up an automation",
        description: "Guided flow: create a recurring birthday / anniversary / onboarding automation.",
        argsSchema: {
          occasion: z.string().optional().describe("birthday, anniversary, or onboarding."),
        },
      },
      (args) =>
        userText(
          `Help me set up a recurring eCardWidget automation${args.occasion ? ` for ${args.occasion}` : ""}.\n\n` +
            "Flow:\n" +
            '1. ecw_describe_fields("automation") for the fields (event_type, trigger_type, timing, selected_ecard_ids, send_time, timezone).\n' +
            "2. ecw_create_automation — supported: birthday, anniversary, onboarding. It targets directory members and sends the eCard(s) you pick at the configured local send time.\n\n" +
            "Ask me for: the occasion, which eCard(s) to send, the from name/email, and the send time + timezone. Confirm before creating (gift-card automations are OTP-gated in the dashboard).",
        ),
    );
  },
};

const SPIN_UP_WIDGET: EcwPrompt = {
  name: "spin_up_widget",
  requires: "widgets:write",
  register(server) {
    server.registerPrompt(
      "spin_up_widget",
      {
        title: "Create a widget with eCards",
        description: "Guided flow: create a widget, then add eCards to it (image via URL or base64).",
        argsSchema: {
          purpose: z.string().optional().describe("What the widget is for (e.g. 'team thank-you cards')."),
        },
      },
      (args) =>
        userText(
          `Help me spin up a new eCardWidget widget with eCards${args.purpose ? ` for ${args.purpose}` : ""}.\n\n` +
            "Flow:\n" +
            '1. ecw_describe_fields("widget") and ecw_describe_fields("ecard") for the available options.\n' +
            "2. ecw_create_widget — name + any options (theme/wconfig, gift cards, directory, …).\n" +
            "3. ecw_create_ecard for each card, attaching to the new widget_id; artwork via image_url OR image_base64.\n\n" +
            "Ask me for the widget name/purpose and the cards (names + images) I want.",
        ),
    );
  },
};

const IMPORT_DIRECTORY: EcwPrompt = {
  name: "import_directory",
  requires: "directory:write",
  register(server) {
    server.registerPrompt(
      "import_directory",
      {
        title: "Import team members",
        description: "Guided flow: bulk-import members into the directory that campaigns/automations target.",
      },
      () =>
        userText(
          "Help me import team members into the eCardWidget directory (the people automations and campaigns target).\n\n" +
            "Flow:\n" +
            "1. Use ecw_import_team_members for a batch, or ecw_upsert_team_member for one. Each member needs at least an email; add name, birthday, work anniversary, department, and manager where available.\n" +
            "2. For large batches, show me the parsed rows and column mapping to confirm before importing.\n\n" +
            "Ask me to paste the member rows / CSV, then map the columns to member fields.",
        ),
    );
  },
};

/** The full prompt catalog (scope-filtered at registration). */
export const ALL_PROMPTS: EcwPrompt[] = [RUN_CAMPAIGN, SETUP_AUTOMATION, SPIN_UP_WIDGET, IMPORT_DIRECTORY];
