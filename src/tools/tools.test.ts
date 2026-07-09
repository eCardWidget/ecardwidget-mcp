import { describe, it, expect, beforeEach } from "vitest";
import type { EcwTool } from "./registry.js";
import { _resetConfirmStore } from "../confirm.js";
import { sendEcardTool } from "./ecards.js";
import { createCampaignTool } from "./campaigns.js";
import { createAutomationTool } from "./automations.js";
import { duplicateWidgetTool, createWidgetTool } from "./widgets.js";
import { createEcardTool } from "./ecards.js";
import { importTeamMembersTool } from "./directory.js";
import { deleteTeamMemberTool, sendCampaignTool, deleteWidgetTool, deleteEcardTool } from "./destructive.js";
import { describeFieldsTool } from "./describe-fields.js";

type Call = { method: "GET" | "POST"; path: string; body?: any; query?: any };

/** Capture a tool's handler + record client calls; canned responses by path. */
function harness(tool: EcwTool, responses: { get?: Record<string, any>; post?: Record<string, any> } = {}) {
  let handler!: (args: any) => Promise<any>;
  const server = { registerTool: (_n: string, _c: any, h: any) => { handler = h; } } as any;
  const calls: Call[] = [];
  const client = {
    get: async (path: string, query?: any) => {
      calls.push({ method: "GET", path, query });
      return responses.get?.[path] ?? {};
    },
    post: async (path: string, body?: any) => {
      calls.push({ method: "POST", path, body });
      return responses.post?.[path] ?? {};
    },
  } as any;
  tool.register(server, client);
  return { call: (args: any) => handler(args), calls };
}

const textOf = (r: any) => r.content[0].text as string;

describe("ecw_send_ecard", () => {
  it("requires recipient_email for an email send", async () => {
    const h = harness(sendEcardTool);
    const r = await h.call({ ecard_id: "e1", sender_email: "a@b.com", sender_name: "A", recipient_name: "B" });
    expect(r.isError).toBe(true);
    expect(textOf(r)).toMatch(/recipient_email is required/);
    expect(h.calls).toHaveLength(0);
  });

  it("maps snake_case args to the API's camelCase body", async () => {
    const h = harness(sendEcardTool, { post: { "/v2/api/pub/ecard-actions/send-ecard": { data: {} } } });
    await h.call({
      ecard_id: "e1", sender_email: "a@b.com", sender_name: "A",
      recipient_name: "B", recipient_email: "b@c.com", merge_tags: { org: "Acme" },
    });
    expect(h.calls[0]!.body).toMatchObject({
      ecardId: "e1", senderEmail: "a@b.com", senderName: "A",
      recipientName: "B", recipientEmail: "b@c.com", type: "email", mergeTags: { org: "Acme" },
    });
  });

  it("returns the share link for a copy-link send", async () => {
    const h = harness(sendEcardTool, { post: { "/v2/api/pub/ecard-actions/send-ecard": { data: { shareUrl: "https://x/y" } } } });
    const r = await h.call({ ecard_id: "e1", sender_email: "a@b.com", sender_name: "A", recipient_name: "B", type: "ecard_copy_link" });
    expect(textOf(r)).toContain("https://x/y");
  });
});

describe("ecw_describe_fields", () => {
  const parse = (r: any) => JSON.parse(textOf(r));

  it("returns settable widget fields with required + enums, hiding readOnly by default", async () => {
    const h = harness(describeFieldsTool);
    const out = parse(await h.call({ entity: "widget" }));
    expect(out.entity).toBe("widget");
    expect(out.wrapper).toBe("widget");
    expect(out.required).toContain("name");
    const names = out.fields.map((f: any) => f.name);
    expect(names).toContain("gift_card_enabled");
    expect(names).not.toContain("vanity_id"); // readOnly hidden
    const gc = out.fields.find((f: any) => f.name === "gift_card_enabled");
    expect(gc.enum).toEqual([0, 1]);
    // wconfig is a container with nested fields
    const wconfig = out.fields.find((f: any) => f.name === "wconfig");
    expect(Array.isArray(wconfig.fields)).toBe(true);
    expect(wconfig.fields.map((f: any) => f.name)).toContain("locale");
  });

  it("includes read-only fields when asked", async () => {
    const h = harness(describeFieldsTool);
    const names = parse(await h.call({ entity: "ecard", include_readonly: true })).fields.map((f: any) => f.name);
    expect(names).toContain("cover_image"); // readOnly, shown only with the flag
  });

  it("covers all four entities", async () => {
    const h = harness(describeFieldsTool);
    for (const entity of ["widget", "ecard", "campaign", "automation"]) {
      const out = parse(await h.call({ entity }));
      expect(out.fields.length).toBeGreaterThan(0);
      expect(out.endpoint).toContain(`/${entity === "ecard" ? "ecard" : entity}/save`);
    }
  });
});

describe("ecw_create_widget", () => {
  it("posts id=0 with a default wconfig and reports the new id", async () => {
    const h = harness(createWidgetTool, { post: { "/v2/api/widget/save": { data: { widget: { id: 14637, name: "Team Cards", vanity_id: "abc" } } } } });
    const r = await h.call({ name: "Team Cards" });
    expect(r.isError).toBeFalsy();
    expect(h.calls[0]!.body.widget).toMatchObject({ id: 0, name: "Team Cards", wconfig: { locale: "en" } });
    expect(textOf(r)).toMatch(/id 14637/);
  });

  it("merges options and a custom wconfig into the widget", async () => {
    const h = harness(createWidgetTool, { post: { "/v2/api/widget/save": { data: { widget: { id: 1 } } } } });
    await h.call({ name: "W", wconfig: { locale: "fr", theme: "dark" }, options: { gift_card_enabled: 1, page_heading_html: "<h1>Hi</h1>" } });
    expect(h.calls[0]!.body.widget).toMatchObject({
      id: 0, name: "W", wconfig: { locale: "fr", theme: "dark" }, gift_card_enabled: 1, page_heading_html: "<h1>Hi</h1>",
    });
  });
});

describe("ecw_create_ecard", () => {
  it("attaches to a widget and maps image_url → self_hosted_url", async () => {
    const h = harness(createEcardTool, { post: { "/v2/api/ecard/save": { data: { id: 90, name: "Card", widgetid: 5 } } } });
    const r = await h.call({ name: "Card", widget_id: 5, details: "<p>hi</p>", image_url: "https://x/y.png" });
    expect(r.isError).toBeFalsy();
    expect(h.calls[0]!.body.myEcard).toMatchObject({ name: "Card", widgetid: 5, details: "<p>hi</p>", self_hosted_url: "https://x/y.png" });
    expect(h.calls[0]!.body.ecardimg).toBeUndefined();
    expect(textOf(r)).toMatch(/id 90.*widget 5/);
  });

  it("sends a base64 blob as top-level ecardimg and passes options through", async () => {
    const h = harness(createEcardTool, { post: { "/v2/api/ecard/save": { data: { id: 91 } } } });
    await h.call({ name: "Blob", widget_id: 5, image_base64: "data:image/png;base64,AAAA", options: { price: "5.00", disabled: 1 } });
    expect(h.calls[0]!.body.ecardimg).toBe("data:image/png;base64,AAAA");
    expect(h.calls[0]!.body.myEcard).toMatchObject({ name: "Blob", widgetid: 5, price: "5.00", disabled: 1 });
  });
});

describe("ecw_create_campaign (multi-step)", () => {
  it("chains save → ecards → recipients and reports a draft", async () => {
    const h = harness(createCampaignTool, { post: { "/v2/api/campaign/save": { data: { id: 55 } } } });
    const r = await h.call({ name: "Spring", ecard_ids: [1, 2], directory_member_ids: [9] });
    expect(h.calls.map((c) => c.path)).toEqual([
      "/v2/api/campaign/save",
      "/v2/api/campaign/saveCampaignEcards",
      "/v2/api/campaign/saveRecipients",
    ]);
    expect(h.calls[1]!.body).toMatchObject({ campaignid: 55, ecardIds: [1, 2] });
    expect(h.calls[2]!.body).toMatchObject({ campaignid: 55, directoryMemberIds: [9] });
    expect(textOf(r)).toMatch(/DRAFT/);
    expect(textOf(r)).toContain("id 55");
  });

  it("skips the optional steps when not provided", async () => {
    const h = harness(createCampaignTool, { post: { "/v2/api/campaign/save": { data: { id: 7 } } } });
    await h.call({ name: "Bare" });
    expect(h.calls.map((c) => c.path)).toEqual(["/v2/api/campaign/save"]);
  });

  it("errors clearly if save returns no id", async () => {
    const h = harness(createCampaignTool, { post: { "/v2/api/campaign/save": { data: {} } } });
    const r = await h.call({ name: "X" });
    expect(r.isError).toBe(true);
  });
});

describe("ecw_create_automation", () => {
  it("builds a directory recipient-date automation with defaults", async () => {
    const h = harness(createAutomationTool, { post: { "/v2/api/automation/save": { data: { id: 3 } } } });
    const r = await h.call({ name: "BDay", event_type: "birthday", ecard_ids: [1] });
    expect(h.calls[0]!.body.automation).toMatchObject({
      automation_name: "BDay", event_type: "birthday", recipient_source: "directory",
      selected_ecard_ids: [1], send_time: "09:00", timezone: "America/New_York", enabled: true,
    });
    expect(textOf(r)).toContain("id 3");
  });
});

describe("ecw_duplicate_widget", () => {
  it("posts to copyWidgetWithEcards with the source id", async () => {
    const h = harness(duplicateWidgetTool, { post: { "/v2/api/widget/copyWidgetWithEcards": { data: { widgetid: "900" } } } });
    const r = await h.call({ source_widget_id: 12, ecard_limit: 3 });
    expect(h.calls[0]!.body).toMatchObject({ widgetid: 12, limit: 3 });
    expect(textOf(r)).toContain("900");
  });
});

describe("ecw_import_team_members", () => {
  it("upserts each row and summarizes", async () => {
    const h = harness(importTeamMembersTool, { post: { "/v2/api/pub/team-member-actions/upsert": {} } });
    const r = await h.call({ members: [{ email: "a@x.com" }, { email: "b@x.com" }] });
    expect(h.calls.filter((c) => c.path.endsWith("/upsert"))).toHaveLength(2);
    expect(textOf(r)).toMatch(/Imported 2\/2/);
  });
});

describe("ecw_delete_team_member (two-phase)", () => {
  beforeEach(() => _resetConfirmStore());

  it("first call previews + issues a token and does NOT delete", async () => {
    const h = harness(deleteTeamMemberTool, { get: { "/v2/api/pub/team-member-actions/find": { data: { first_name: "Grace" } } } });
    const r = await h.call({ email: "grace@acme.com" });
    expect(textOf(r)).toMatch(/PERMANENTLY delete/);
    expect(textOf(r)).toMatch(/confirm_token="[^"]+"/);
    expect(h.calls.some((c) => c.path.endsWith("/delete"))).toBe(false);
  });

  it("second call with the token executes the delete", async () => {
    const h = harness(deleteTeamMemberTool, { get: { "/v2/api/pub/team-member-actions/find": { data: {} } }, post: { "/v2/api/pub/team-member-actions/delete": {} } });
    const preview = textOf(await h.call({ email: "grace@acme.com" }));
    const token = preview.match(/confirm_token="([^"]+)"/)![1];
    const r = await h.call({ email: "grace@acme.com", confirm_token: token });
    expect(r.isError).toBeFalsy();
    expect(h.calls.some((c) => c.method === "POST" && c.path.endsWith("/delete"))).toBe(true);
  });

  it("rejects a token issued for a different email", async () => {
    const h = harness(deleteTeamMemberTool, { get: { "/v2/api/pub/team-member-actions/find": { data: {} } } });
    const token = textOf(await h.call({ email: "someone@else.com" })).match(/confirm_token="([^"]+)"/)![1];
    const r = await h.call({ email: "grace@acme.com", confirm_token: token });
    expect(r.isError).toBe(true);
    expect(h.calls.some((c) => c.path.endsWith("/delete"))).toBe(false);
  });
});

describe("ecw_delete_widget / ecw_delete_ecard (two-phase)", () => {
  beforeEach(() => _resetConfirmStore());

  it("widget: previews then deletes with a valid token", async () => {
    const h = harness(deleteWidgetTool, { post: { "/v2/api/widget/deleteWidgets": { success: true } } });
    const token = textOf(await h.call({ widget_id: 5 })).match(/confirm_token="([^"]+)"/)![1];
    const r = await h.call({ widget_id: 5, confirm_token: token });
    expect(r.isError).toBeFalsy();
    expect(h.calls.some((c) => c.path.endsWith("/deleteWidgets") && c.body.widgetids[0] === 5)).toBe(true);
  });

  it("widget: surfaces the dashboard requirement + impact when in use", async () => {
    const h = harness(deleteWidgetTool, {
      post: { "/v2/api/widget/deleteWidgets": { data: { requires_otp: true, impact: { totals: { automations: 2, campaigns: 1 } } } } },
    });
    const token = textOf(await h.call({ widget_id: 5 })).match(/confirm_token="([^"]+)"/)![1];
    const r = await h.call({ widget_id: 5, confirm_token: token });
    expect(r.isError).toBe(true);
    expect(textOf(r)).toMatch(/dashboard/);
    expect(textOf(r)).toMatch(/2 automation\(s\).*1 campaign\(s\)/);
  });

  it("ecard: previews then deletes with a valid token", async () => {
    const h = harness(deleteEcardTool, { post: { "/v2/api/ecard/deleteEcards": { success: true } } });
    const token = textOf(await h.call({ ecard_id: 88 })).match(/confirm_token="([^"]+)"/)![1];
    const r = await h.call({ ecard_id: 88, confirm_token: token });
    expect(r.isError).toBeFalsy();
    expect(h.calls.some((c) => c.path.endsWith("/deleteEcards") && c.body.ecardids[0] === 88)).toBe(true);
  });
});

describe("ecw_send_campaign (two-phase)", () => {
  beforeEach(() => _resetConfirmStore());

  it("previews then sends with a valid token", async () => {
    const h = harness(sendCampaignTool, {
      get: { "/v2/api/campaign/findOne": { data: { campaign_name: "Spring" } } },
      post: { "/v2/api/campaign/send": { data: { success: true } } },
    });
    const preview = textOf(await h.call({ campaign_id: 42 }));
    expect(preview).toMatch(/SEND campaign "Spring"/);
    const token = preview.match(/confirm_token="([^"]+)"/)![1];
    const r = await h.call({ campaign_id: 42, confirm_token: token });
    expect(r.isError).toBeFalsy();
    expect(h.calls.some((c) => c.method === "POST" && c.path.endsWith("/send"))).toBe(true);
  });

  it("surfaces the dashboard requirement for gift-card campaigns", async () => {
    const h = harness(sendCampaignTool, {
      get: { "/v2/api/campaign/findOne": { data: { campaign_name: "GC" } } },
      post: { "/v2/api/campaign/send": { data: { requires_otp: true } } },
    });
    const token = textOf(await h.call({ campaign_id: 7 })).match(/confirm_token="([^"]+)"/)![1];
    const r = await h.call({ campaign_id: 7, confirm_token: token });
    expect(r.isError).toBe(true);
    expect(textOf(r)).toMatch(/dashboard/);
  });
});
