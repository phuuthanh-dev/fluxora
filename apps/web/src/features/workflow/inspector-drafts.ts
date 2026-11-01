import type { MongoFilterRow } from "./mongodb-filter";

export type StagedText = { text: string; baseline: string };
export type InspectorDraft = { filter?: MongoFilterRow[]; filterRaw?: StagedText; json?: StagedText; testData?: StagedText };
export type InspectorDraftKind = keyof InspectorDraft;
export type UpdateInspectorDraft = (kind: InspectorDraftKind, value: MongoFilterRow[] | StagedText | undefined) => void;
