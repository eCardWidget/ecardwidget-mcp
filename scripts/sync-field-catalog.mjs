#!/usr/bin/env node
// Sync the create/update field catalog from the eCardWidget OpenAPI spec into
// src/field-catalog.json (bundled at build time and served by ecw_describe_fields).
//
// Usage:
//   npm run sync-fields                 # from the hosted spec (default)
//   node scripts/sync-field-catalog.mjs <url-or-file>
//   OPENAPI_SOURCE=<url-or-file> npm run sync-fields
//
// The generated JSON records the CANONICAL hosted URL as its source even when
// generated from a local file, so the committed catalog never leaks a local path.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

const CANONICAL = "https://ecardwidget.com/docs/openapi.yaml";
const source = process.argv[2] || process.env.OPENAPI_SOURCE || CANONICAL;

// entity → schema name, save endpoint, and the JSON wrapper key the API expects.
const ENTITIES = [
  { entity: "widget", schema: "WidgetInput", endpoint: "POST /v2/api/widget/save", wrapper: "widget" },
  { entity: "ecard", schema: "EcardInput", endpoint: "POST /v2/api/ecard/save", wrapper: "myEcard" },
  { entity: "campaign", schema: "CampaignInput", endpoint: "POST /v2/api/campaign/save", wrapper: "campaign" },
  { entity: "automation", schema: "AutomationInput", endpoint: "POST /v2/api/automation/save", wrapper: "automation" },
];

async function loadSpec(src) {
  const text = /^https?:/i.test(src)
    ? await fetch(src).then((r) => {
        if (!r.ok) throw new Error(`Fetch ${src} → HTTP ${r.status}`);
        return r.text();
      })
    : readFileSync(src, "utf8");
  return parse(text);
}

function fieldFrom(name, prop, requiredList, schemas) {
  // Expand a $ref (e.g. WidgetInput.wconfig → Wconfig) into nested children.
  if (prop.$ref) {
    const ref = schemas[prop.$ref.split("/").pop()];
    const children = ref?.properties
      ? Object.entries(ref.properties).map(([n, p]) => fieldFrom(n, p, ref.required || [], schemas))
      : [];
    return { name, type: "object", container: true, description: ref?.description?.trim(), children };
  }
  const f = { name, type: prop.type || "object" };
  if (prop.enum) f.enum = prop.enum;
  if (prop.format) f.format = prop.format;
  if (requiredList.includes(name)) f.required = true;
  if (prop.readOnly) f.readOnly = true;
  if (prop.deprecated) f.deprecated = true;
  if (prop.description) f.description = prop.description.trim();
  return f;
}

const spec = await loadSpec(source);
const schemas = spec?.components?.schemas;
if (!schemas) throw new Error(`No components.schemas in ${source}`);

const out = { generatedFrom: /^https?:/i.test(source) ? source : CANONICAL, entities: {} };
for (const e of ENTITIES) {
  const s = schemas[e.schema];
  if (!s?.properties) throw new Error(`Schema ${e.schema} missing/empty in ${source}`);
  const required = s.required || [];
  out.entities[e.entity] = {
    endpoint: e.endpoint,
    wrapper: e.wrapper,
    description: s.description?.trim(),
    required,
    fields: Object.entries(s.properties).map(([n, p]) => fieldFrom(n, p, required, schemas)),
  };
}

const dest = fileURLToPath(new URL("../src/field-catalog.json", import.meta.url));
writeFileSync(dest, JSON.stringify(out, null, 2) + "\n");
console.error(
  `Wrote ${dest} from ${source}:\n  ` +
    Object.entries(out.entities)
      .map(([k, v]) => `${k}=${v.fields.length} fields`)
      .join(", "),
);
