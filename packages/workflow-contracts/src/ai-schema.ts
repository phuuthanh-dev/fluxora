/** Shared, provider-neutral subset for AI structured outputs. No runtime dependencies. */
export type AiSchema = {
  type: "object" | "array" | "string" | "number" | "integer" | "boolean" | "null";
  description?: string;
  properties?: Record<string, AiSchema>;
  required?: string[];
  additionalProperties?: false;
  items?: AiSchema;
  enum?: string[];
};

export const AI_SCHEMA_MAX_FIELDS = 50;
export const AI_SCHEMA_MAX_NAME_LENGTH = 128;
export const AI_SCHEMA_MAX_DESCRIPTION_LENGTH = 1000;
export const AI_SCHEMA_MAX_ENUM_VALUES = 1000;
export const AI_SCHEMA_INVALID_MESSAGE = "Structured output schema is invalid or unsupported.";

export function isAiSchemaFieldName(name: string): boolean {
  return name.length > 0 && name.length <= AI_SCHEMA_MAX_NAME_LENGTH && !["__proto__", "prototype", "constructor"].includes(name);
}

type SchemaResult = { ok: true; schema: AiSchema } | { ok: false; code: "INVALID_AI_SCHEMA"; message: string };

/** Validate untrusted schema without embedding its names, descriptions, or values in errors. */
export function validateAiSchema(value: unknown): SchemaResult {
  const invalid: SchemaResult = { ok: false, code: "INVALID_AI_SCHEMA", message: AI_SCHEMA_INVALID_MESSAGE };
  const object = (raw: unknown): Record<string, unknown> | undefined =>
    raw !== null && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : undefined;
  let nodes = 0;
  let characters = 0;
  let enumValues = 0;
  const seen = new Set<object>();
  function visit(raw: unknown, depth: number): boolean {
    const schema = object(raw);
    if (!schema || depth > 8 || ++nodes > 100 || seen.has(schema)) return false;
    seen.add(schema);
    const type = schema.type;
    if (typeof type !== "string" || !["object", "array", "string", "number", "integer", "boolean", "null"].includes(type)) return false;
    const allowed = type === "object" ? ["type", "description", "properties", "required", "additionalProperties"] : type === "array" ? ["type", "description", "items"] : type === "string" ? ["type", "description", "enum"] : ["type", "description"];
    if (Object.keys(schema).some((key) => !allowed.includes(key))) return false;
    if (Object.hasOwn(schema, "description") && (typeof schema.description !== "string" || schema.description.length > AI_SCHEMA_MAX_DESCRIPTION_LENGTH)) return false;
    if (type === "object") {
      const properties = object(schema.properties);
      if (!properties || schema.additionalProperties !== false || !Array.isArray(schema.required)) return false;
      const keys = Object.keys(properties);
      characters += keys.reduce((sum, key) => sum + key.length, 0);
      if (characters > 32_000 || keys.length > AI_SCHEMA_MAX_FIELDS || keys.some((key) => !isAiSchemaFieldName(key))) return false;
      if (schema.required.length !== keys.length || new Set(schema.required).size !== keys.length || schema.required.some((key: unknown) => typeof key !== "string" || !Object.hasOwn(properties, key))) return false;
      return keys.every((key) => visit(properties[key], depth + 1));
    }
    if (type === "array") return visit(schema.items, depth + 1);
    if (type === "string" && Object.hasOwn(schema, "enum")) {
      if (!Array.isArray(schema.enum) || schema.enum.length < 1 || schema.enum.length > 50 || schema.enum.some((item: unknown) => typeof item !== "string" || item.length > 1000) || new Set(schema.enum).size !== schema.enum.length) return false;
      enumValues += schema.enum.length;
      characters += schema.enum.reduce((sum: number, item: string) => sum + item.length, 0);
      if (enumValues > AI_SCHEMA_MAX_ENUM_VALUES || characters > 32_000) return false;
    }
    return true;
  }
  const root = object(value);
  return root?.type === "object" && visit(value, 0) ? { ok: true, schema: value as AiSchema } : invalid;
}
