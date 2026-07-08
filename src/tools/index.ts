import type { EcwTool } from "./registry.js";
import { whoamiTool } from "./whoami.js";
import {
  searchEcardsTool,
  listCampaignsTool,
  listWidgetsTool,
  listAutomationsTool,
  listTeamMembersTool,
} from "./reads.js";
import { getWidgetEcardsTool, sendEcardTool, createEcardTool } from "./ecards.js";
import { upsertTeamMemberTool, findTeamMemberTool, importTeamMembersTool } from "./directory.js";
import { duplicateWidgetTool, createWidgetTool } from "./widgets.js";
import { createAutomationTool } from "./automations.js";
import { createCampaignTool } from "./campaigns.js";
import {
  deleteTeamMemberTool,
  deactivateTeamMemberTool,
  sendCampaignTool,
  deleteWidgetTool,
  deleteEcardTool,
} from "./destructive.js";

/**
 * The full tool catalog. `registerScopedTools` filters this to the tools the
 * calling key is authorized for.
 */
export const ALL_TOOLS: EcwTool[] = [
  // Introspection (always on)
  whoamiTool,
  // Reads
  searchEcardsTool,
  getWidgetEcardsTool,
  listCampaignsTool,
  listWidgetsTool,
  listAutomationsTool,
  listTeamMembersTool,
  findTeamMemberTool,
  // Writes (create / update)
  sendEcardTool,
  createEcardTool,
  upsertTeamMemberTool,
  importTeamMembersTool,
  createWidgetTool,
  duplicateWidgetTool,
  createAutomationTool,
  createCampaignTool,
  // Destructive (two-phase confirm / reversible)
  deactivateTeamMemberTool,
  deleteTeamMemberTool,
  deleteWidgetTool,
  deleteEcardTool,
  sendCampaignTool,
];
