import { BadRequestException } from "@nestjs/common";

const expressionPattern = /{{\s*([^{}]+?)\s*}}/g;
const pathPattern = /^[A-Za-z_][A-Za-z0-9_-]*(?:\.[A-Za-z_][A-Za-z0-9_-]*|\[\d+\])*$/;

export type ExpressionContext = Record<string, unknown>;

export function resolveExpressions(value: unknown, context: ExpressionContext, options: { rejectMissing?: boolean } = {}): unknown {
  if (typeof value === "string") return resolveTemplate(value, context, options);
  if (Array.isArray(value)) return value.map((item) => resolveExpressions(item, context, options));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, resolveExpressions(item, context, options)]));
  }
  return value;
}

export function resolveTemplate(template: string, context: ExpressionContext, options: { rejectMissing?: boolean } = {}): unknown {
  const matches = [...template.matchAll(expressionPattern)];
  if (!matches.length) return template;
  const resolve = (expression: string) => {
    const value = resolveTerm(expression, context, options.rejectMissing === true);
    if (options.rejectMissing && value === undefined) invalidExpression("An expression could not be resolved. Check the previous step before running.");
    return value;
  };
  if (matches.length === 1 && matches[0]?.[0] === template) return resolve(matches[0][1] ?? "");
  return template.replace(expressionPattern, (_, expression: string) => stringify(resolve(expression)));
}

function resolveTerm(expression: string, context: ExpressionContext, rejectMissing = false): unknown {
  const term = expression.trim();
  const helper = /^(upper|lower|default)\((.*)\)$/.exec(term);
  if (helper) return resolveHelper(helper[1] ?? "", helper[2] ?? "", context, rejectMissing);
  if (!pathPattern.test(term)) invalidExpression("Only safe path access and approved helpers are supported.");
  return readPath(context, term);
}

function resolveHelper(name: string, rawArguments: string, context: ExpressionContext, rejectMissing: boolean): unknown {
  const argumentsList = rawArguments.split(",").map((item) => item.trim());
  const value = resolveArgument(argumentsList[0] ?? "", context);
  if (rejectMissing && name !== "default" && value === undefined) invalidExpression("An expression could not be resolved. Check the previous step before running.");
  if (name === "upper") return typeof value === "string" ? value.toUpperCase() : stringify(value).toUpperCase();
  if (name === "lower") return typeof value === "string" ? value.toLowerCase() : stringify(value).toLowerCase();
  if (name === "default") return value ?? resolveArgument(argumentsList.slice(1).join(","), context);
  invalidExpression("Unsupported expression helper.");
}

function resolveArgument(value: string, context: ExpressionContext): unknown {
  const quoted = /^(["'])(.*)\1$/.exec(value);
  if (quoted) return quoted[2] ?? "";
  if (!pathPattern.test(value)) invalidExpression("Expression arguments must be a safe path or quoted string.");
  return readPath(context, value);
}

function readPath(context: ExpressionContext, path: string): unknown {
  const tokens = [...path.matchAll(/[A-Za-z_][A-Za-z0-9_-]*|\[(\d+)\]/g)].map((match) => match[1] === undefined ? match[0] : Number(match[1]));
  return tokens.reduce<unknown>((value, token) => {
    if (typeof token === "number") return Array.isArray(value) ? value[token] : undefined;
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>)[token] : undefined;
  }, context);
}

function stringify(value: unknown) {
  if (value === undefined || value === null) return "";
  return typeof value === "string" ? value : JSON.stringify(value);
}

function invalidExpression(message: string): never {
  throw new BadRequestException({ code: "INVALID_EXPRESSION", message });
}
