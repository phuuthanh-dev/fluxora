import { BadRequestException } from "@nestjs/common";

const expressionPattern = /{{\s*([^{}]+?)\s*}}/g;
const pathPattern = /^[A-Za-z_][A-Za-z0-9_-]*(?:\.[A-Za-z_][A-Za-z0-9_-]*|\[\d+\])*$/;

export type ExpressionContext = Record<string, unknown>;
type ResolutionOptions = { rejectMissing?: boolean; restoredSteps?: ReadonlySet<string>; persistedTrigger?: boolean };

export function resolveExpressions(value: unknown, context: ExpressionContext, options: ResolutionOptions = {}): unknown {
  if (typeof value === "string") return resolveTemplate(value, context, options);
  if (Array.isArray(value)) return value.map((item) => resolveExpressions(item, context, options));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, resolveExpressions(item, context, options)]));
  }
  return value;
}

export function resolveTemplate(template: string, context: ExpressionContext, options: ResolutionOptions = {}): unknown {
  const matches = [...template.matchAll(expressionPattern)];
  if (!matches.length) return template;
  const resolve = (expression: string) => {
    const value = resolveTerm(expression, context, options);
    if (options.rejectMissing && value === undefined) invalidExpression("An expression could not be resolved. Check the previous step before running.");
    return value;
  };
  if (matches.length === 1 && matches[0]?.[0] === template) return resolve(matches[0][1] ?? "");
  return template.replace(expressionPattern, (_, expression: string) => stringify(resolve(expression)));
}

function resolveTerm(expression: string, context: ExpressionContext, options: ResolutionOptions): unknown {
  const term = expression.trim();
  const helper = /^(upper|lower|default)\((.*)\)$/.exec(term);
  if (helper) return resolveHelper(helper[1] ?? "", helper[2] ?? "", context, options);
  if (!pathPattern.test(term)) invalidExpression("Only safe path access and approved helpers are supported.");
  return readPath(context, term, options);
}

function resolveHelper(name: string, rawArguments: string, context: ExpressionContext, options: ResolutionOptions): unknown {
  const argumentsList = rawArguments.split(",").map((item) => item.trim());
  const value = resolveArgument(argumentsList[0] ?? "", context, options);
  if (options.rejectMissing && name !== "default" && value === undefined) invalidExpression("An expression could not be resolved. Check the previous step before running.");
  if (name === "upper") return typeof value === "string" ? value.toUpperCase() : stringify(value).toUpperCase();
  if (name === "lower") return typeof value === "string" ? value.toLowerCase() : stringify(value).toLowerCase();
  if (name === "default") return value ?? resolveArgument(argumentsList.slice(1).join(","), context, options);
  invalidExpression("Unsupported expression helper.");
}

function resolveArgument(value: string, context: ExpressionContext, options: ResolutionOptions): unknown {
  const quoted = /^(["'])(.*)\1$/.exec(value);
  if (quoted) return quoted[2] ?? "";
  if (!pathPattern.test(value)) invalidExpression("Expression arguments must be a safe path or quoted string.");
  return readPath(context, value, options);
}

function containsRedaction(value: unknown): boolean {
  if (typeof value === "string") return value.includes("[REDACTED]");
  if (Array.isArray(value)) return value.some(containsRedaction);
  return value !== null && typeof value === "object" && Object.values(value).some(containsRedaction);
}

function unavailableRedactedInput(): never {
  throw new BadRequestException({ code: "REDACTED_INPUT_UNAVAILABLE", message: "An execution value was redacted before it could be used. Review the workflow before retrying; use a connection for secrets." });
}

function readPath(context: ExpressionContext, path: string, options: ResolutionOptions): unknown {
  const tokens = [...path.matchAll(/[A-Za-z_][A-Za-z0-9_-]*|\[(\d+)\]/g)].map((match) => match[1] === undefined ? match[0] : Number(match[1]));
  const restoredStep = tokens[0] === "steps" && typeof tokens[1] === "string" && options.restoredSteps?.has(tokens[1]);
  const persistedTrigger = tokens[0] === "trigger" && options.persistedTrigger;
  const value = tokens.reduce<unknown>((value, token, index) => {
    // Traversing through a redacted value must not turn it into a missing
    // value that a default helper could silently replace.
    if (((restoredStep && index >= 2) || (persistedTrigger && index >= 1)) && typeof value === "string" && containsRedaction(value)) unavailableRedactedInput();
    if (typeof token === "number") return Array.isArray(value) ? value[token] : undefined;
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>)[token] : undefined;
  }, context);
  if (persistedTrigger && containsRedaction(value)) unavailableRedactedInput();
  if (tokens[0] === "steps" && options.restoredSteps?.size) {
    const unavailable = tokens.length === 1 && value && typeof value === "object" && !Array.isArray(value)
      ? [...options.restoredSteps].some((id) => containsRedaction((value as Record<string, unknown>)[id]))
      : restoredStep && containsRedaction(value);
    if (unavailable) unavailableRedactedInput();
  }
  return value;
}

function stringify(value: unknown) {
  if (value === undefined || value === null) return "";
  return typeof value === "string" ? value : JSON.stringify(value);
}

function invalidExpression(message: string): never {
  throw new BadRequestException({ code: "INVALID_EXPRESSION", message });
}
