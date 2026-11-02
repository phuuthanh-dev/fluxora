import type { MongoFilterRow } from "./mongodb-filter";
import type { StructuredOutputDraft } from "./structured-output-schema";
import type { RelationalDraft } from "./relational-selection";
import type { SheetsMappingDraft } from "./google-sheets-mapping";

export type StagedText = { text: string; baseline: string };
export type InspectorDraft = { filter?: MongoFilterRow[]; filterRaw?: StagedText; json?: StagedText; testData?: StagedText; structuredOutput?: StructuredOutputDraft; relational?: RelationalDraft; sheetsMapping?: SheetsMappingDraft };
export type InspectorDraftKind = keyof InspectorDraft;
export type UpdateInspectorDraft = (kind: InspectorDraftKind, value: MongoFilterRow[] | StagedText | StructuredOutputDraft | RelationalDraft | SheetsMappingDraft | undefined) => void;
