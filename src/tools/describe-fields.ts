import { z } from "zod";
import { errorResult, jsonResult, type EcwTool } from "./registry.js";
import catalog from "../field-catalog.json" with { type: "json" };

type CatalogField = {
  name: string;
  type: string;
  enum?: unknown[];
  format?: string;
  required?: boolean;
  readOnly?: boolean;
  deprecated?: boolean;
  container?: boolean;
  description?: string;
  children?: CatalogField[];
};

type CatalogEntity = {
  endpoint: string;
  wrapper: string;
  description?: string;
  required: string[];
  fields: CatalogField[];
};

const ENTITIES = catalog.entities as Record<string, CatalogEntity>;

/**
 * Serve the create/update field catalog (synced from the OpenAPI spec via
 * `npm run sync-fields`) so the agent knows what it can set on a widget, eCard,
 * campaign, or automation before calling the matching create tool. No API call,
 * no scope required — it's reference data.
 */
export const describeFieldsTool: EcwTool = {
  name: "ecw_describe_fields",
  requires: null,
  register(server) {
    server.registerTool(
      "ecw_describe_fields",
      {
        title: "Describe create/update fields",
        description:
          "List the fields you can set when creating or updating a widget, eCard, campaign, or automation — " +
          "field names, types, allowed values (enums), and which are required. Call this before " +
          "ecw_create_widget / ecw_create_ecard / ecw_create_campaign / ecw_create_automation to learn what " +
          "to pass (including the `options` passthrough). Sourced from the eCardWidget OpenAPI spec.",
        inputSchema: {
          entity: z
            .enum(["widget", "ecard", "campaign", "automation"])
            .describe("Which entity's create/update fields to describe."),
          include_readonly: z
            .boolean()
            .optional()
            .describe("Include read-only / system fields too (default false — only settable fields)."),
        },
        annotations: { readOnlyHint: true, openWorldHint: false },
      },
      async (args: { entity: string; include_readonly?: boolean }) => {
        const ent = ENTITIES[args.entity];
        if (!ent) return errorResult(`Unknown entity "${args.entity}". Choose: widget, ecard, campaign, automation.`);

        const keep = (fields: CatalogField[]): CatalogField[] =>
          args.include_readonly ? fields : fields.filter((f) => !f.readOnly);

        const shape = (f: CatalogField): Record<string, unknown> => {
          const o: Record<string, unknown> = { name: f.name, type: f.type };
          if (f.enum) o.enum = f.enum;
          if (f.format) o.format = f.format;
          if (f.required) o.required = true;
          if (f.readOnly) o.readOnly = true;
          if (f.deprecated) o.deprecated = true;
          if (f.description) o.description = f.description;
          if (f.children) o.fields = keep(f.children).map(shape);
          return o;
        };

        return jsonResult({
          entity: args.entity,
          endpoint: ent.endpoint,
          wrapper: ent.wrapper,
          note:
            `On ${ent.endpoint}, send these under the "${ent.wrapper}" object. In the MCP create tools, ` +
            "typed params cover the common fields and anything else goes in `options` (or `wconfig` for widgets).",
          required: ent.required,
          fields: keep(ent.fields).map(shape),
        });
      },
    );
  },
};
