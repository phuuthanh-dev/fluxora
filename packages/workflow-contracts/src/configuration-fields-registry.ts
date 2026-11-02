import type { WorkflowNodeType } from "./index";
import type { NodeConfigurationField } from "./node-configuration-fields";
import { gmailWriteConfigurationFields } from "./gmail-write-fields";
import { notionReadConfigurationFields } from "./notion-read-fields";
import { trelloCardConfigurationFields } from "./trello-card-fields";
import { aiNodeFields } from "./ai-node-fields";
import { communicationNodeFields } from "./communication-node-fields";
import { dataNodeFields } from "./data-node-fields";
import { developerNodeFields } from "./developer-node-fields";
import { googleNodeFields } from "./google-node-fields";
import { otherNodeFields } from "./other-node-fields";
import { githubReadConfigurationFields } from "./github-read-fields";

/** Incremental UI metadata only. Missing entries mean the descriptor has not
 * moved yet; do not interpret them as an empty runtime validation schema. */
const sharedFields = {
  ...aiNodeFields,
  ...communicationNodeFields,
  ...dataNodeFields,
  ...developerNodeFields,
  ...googleNodeFields,
  ...otherNodeFields,
  "action.github.list-issues": () => githubReadConfigurationFields("issue", true),
  "action.github.get-issue": () => githubReadConfigurationFields("issue", false),
  "action.github.list-pull-requests": () => githubReadConfigurationFields("pull-request", true),
  "action.github.get-pull-request": () => githubReadConfigurationFields("pull-request", false),
  "action.gmail.send": () => gmailWriteConfigurationFields("send"),
  "action.gmail.reply": () => gmailWriteConfigurationFields("reply"),
  "action.gmail.create-draft": () => gmailWriteConfigurationFields("draft"),
  "action.gmail.update-draft": () => gmailWriteConfigurationFields("updateDraft"),
  "action.gmail.modify-label": () => gmailWriteConfigurationFields("label"),
  "action.notion.retrieve-page": () => notionReadConfigurationFields("page"),
  "action.notion.list-children": () => notionReadConfigurationFields("children"),
  "action.notion.retrieve-property": () => notionReadConfigurationFields("property"),
  "action.trello.get-card": () => trelloCardConfigurationFields("get"),
  "action.trello.update-card": () => trelloCardConfigurationFields("update"),
  "action.trello.move-card": () => trelloCardConfigurationFields("move"),
  "action.trello.archive-card": () => trelloCardConfigurationFields("archive"),
  "action.trello.list-cards": () => trelloCardConfigurationFields("list"),
  "action.trello.find-cards": () => trelloCardConfigurationFields("find"),
} satisfies Partial<Record<WorkflowNodeType, () => NodeConfigurationField[]>>;

export const sharedNodeConfigurationTypes: readonly (keyof typeof sharedFields)[] = Object.freeze(Object.keys(sharedFields) as (keyof typeof sharedFields)[]);

export function getSharedNodeConfigurationFields(type: string): NodeConfigurationField[] | undefined {
  if (!Object.hasOwn(sharedFields, type)) return undefined;
  return sharedFields[type as keyof typeof sharedFields]();
}
