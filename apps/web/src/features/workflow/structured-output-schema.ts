import { AI_SCHEMA_MAX_DESCRIPTION_LENGTH, AI_SCHEMA_MAX_FIELDS, AI_SCHEMA_MAX_NAME_LENGTH, isAiSchemaFieldName, validateAiSchema } from "@workflow/contracts";

/** The visual editor deliberately supports only this lossless subset of JSON Schema. */
export const STRUCTURED_OUTPUT_MAX_FIELDS = AI_SCHEMA_MAX_FIELDS;
export const STRUCTURED_OUTPUT_MAX_NAME_LENGTH = AI_SCHEMA_MAX_NAME_LENGTH;
export const STRUCTURED_OUTPUT_MAX_DESCRIPTION_LENGTH = AI_SCHEMA_MAX_DESCRIPTION_LENGTH;

export type StructuredOutputType = "string" | "number" | "integer" | "boolean" | "null";
export type StructuredOutputRow = { name: string; type: StructuredOutputType; description?: string };
export type StructuredOutputModel = { fields: StructuredOutputRow[]; description?: string };
export type StructuredOutputSchema = {
  type: "object";
  properties: Record<string, { type: StructuredOutputType; description?: string }>;
  required: string[];
  additionalProperties: false;
  description?: string;
};
export type StructuredOutputDraft =
  | { kind: "visual"; baseline: string; model: StructuredOutputModel }
  | { kind: "json"; baseline: string; text: string };

const primitiveTypes = new Set<string>(["string", "number", "integer", "boolean", "null"]);
const isObject = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const hasOnly = (value: Record<string, unknown>, keys: string[]) => Object.keys(value).every((key) => keys.includes(key));
const isDescription = (value: unknown) => typeof value === "string" && value.length <= STRUCTURED_OUTPUT_MAX_DESCRIPTION_LENGTH;

/** A stable snapshot used to reject edits against an externally changed value. */
export function structuredOutputBaseline(value: unknown): string {
  return JSON.stringify(value) ?? "undefined";
}

/** Return null instead of dropping keywords or changing a schema the builder cannot represent. */
export function parseStructuredOutputSchema(value: unknown): StructuredOutputModel | null {
  if (value === undefined) return { fields: [] };
  if (!isObject(value) || !hasOnly(value, ["type", "properties", "required", "additionalProperties", "description"]) || value.type !== "object" || value.additionalProperties !== false || !isObject(value.properties) || !Array.isArray(value.required)) return null;
  if ("description" in value && !isDescription(value.description)) return null;
  const entries = Object.entries(value.properties);
  if (entries.length > STRUCTURED_OUTPUT_MAX_FIELDS || value.required.length !== entries.length) return null;
  const fields: StructuredOutputRow[] = [];
  for (const [index, [name, property]] of entries.entries()) {
    // Preserve required order as well as all schema keywords when switching modes.
    if (value.required[index] !== name || !name.trim() || !isAiSchemaFieldName(name) || !isObject(property) || !hasOnly(property, ["type", "description"]) || typeof property.type !== "string" || !primitiveTypes.has(property.type)) return null;
    if ("description" in property && !isDescription(property.description)) return null;
    const row: StructuredOutputRow = { name, type: property.type as StructuredOutputType };
    if (typeof property.description === "string") row.description = property.description;
    fields.push(row);
  }
  const model: StructuredOutputModel = { fields };
  if (typeof value.description === "string") model.description = value.description;
  return model;
}

/** Build a strict object schema; invalid drafts are never partially applied. */
export function buildStructuredOutputSchema(model: StructuredOutputModel): StructuredOutputSchema {
  if (!model.fields.length || model.fields.length > STRUCTURED_OUTPUT_MAX_FIELDS) throw new Error(`Add between 1 and ${STRUCTURED_OUTPUT_MAX_FIELDS} fields.`);
  if (model.description !== undefined && !isDescription(model.description)) throw new Error(`Keep the output description to ${STRUCTURED_OUTPUT_MAX_DESCRIPTION_LENGTH} characters or fewer.`);
  const names = new Set<string>();
  const entries: Array<[string, { type: StructuredOutputType; description?: string }]> = [];
  for (const field of model.fields) {
    if (!field.name.trim() || !isAiSchemaFieldName(field.name)) throw new Error(`Each field needs a supported name of at most ${STRUCTURED_OUTPUT_MAX_NAME_LENGTH} characters.`);
    if (names.has(field.name)) throw new Error(`Field names must be unique: "${field.name}" is repeated.`);
    if (!primitiveTypes.has(field.type)) throw new Error("Choose a supported type for each field.");
    if (field.description !== undefined && !isDescription(field.description)) throw new Error(`Keep each field description to ${STRUCTURED_OUTPUT_MAX_DESCRIPTION_LENGTH} characters or fewer.`);
    names.add(field.name);
    const property: { type: StructuredOutputType; description?: string } = { type: field.type };
    if (field.description !== undefined) property.description = field.description;
    entries.push([field.name, property]);
  }
  const properties = Object.fromEntries(entries);
  const schema: StructuredOutputSchema = { type: "object", properties, required: Object.keys(properties), additionalProperties: false };
  if (model.description !== undefined) schema.description = model.description;
  if (!validateAiSchema(schema).ok) throw new Error("The output schema is invalid or unsupported.");
  return schema;
}

/** JSON.parse silently keeps only the last repeated key; reject that loss in advanced drafts. */
function assertNoDuplicateKeys(text: string): void {
  let position = 0;
  const whitespace = () => { while (/\s/.test(text[position] ?? "") && position < text.length) position++; };
  const readString = () => {
    const start = position++;
    while (position < text.length) {
      const char = text[position++];
      if (char === "\\") position++;
      else if (char === '"') return JSON.parse(text.slice(start, position)) as string;
    }
    throw new Error("Enter valid JSON for the output schema.");
  };
  const readValue = (depth = 0) => {
    if (depth > 32) throw new Error("The output schema is nested too deeply.");
    whitespace();
    if (text[position] === "{") {
      position++;
      const keys = new Set<string>();
      whitespace();
      while (text[position] !== "}") {
        const key = readString();
        if (keys.has(key)) throw new Error(`Duplicate JSON key: "${key}". Use each key once.`);
        keys.add(key);
        whitespace(); position++; // colon
        readValue(depth + 1); whitespace();
        if (text[position] !== ",") break;
        position++; whitespace();
      }
      position++;
    } else if (text[position] === "[") {
      position++; whitespace();
      while (text[position] !== "]") {
        readValue(depth + 1); whitespace();
        if (text[position] !== ",") break;
        position++; whitespace();
      }
      position++;
    } else if (text[position] === '"') {
      readString();
    } else {
      while (position < text.length && !/[\s,}\]]/.test(text[position] ?? "")) position++;
    }
  };
  readValue();
}

/** Advanced edits remain lossless while enforcing the shared provider-neutral subset. */
export function parseStructuredOutputJson(text: string): Record<string, unknown> {
  if (text.length > 100_000) throw new Error("The output schema is too large.");
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new Error("Enter valid JSON for the output schema."); }
  if (!isObject(value)) throw new Error("The output schema must be a JSON object.");
  assertNoDuplicateKeys(text);
  if (!validateAiSchema(value).ok) throw new Error("The output schema is invalid or unsupported.");
  return value;
}
