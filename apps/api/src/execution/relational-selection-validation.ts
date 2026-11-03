import { NodeFailure } from "./node-failure";

/** Integers outside this range may already have lost digits in JSON or expressions. */
export function requireSafeSelectionNumber(value: unknown): void {
  if (typeof value === "number" && (!Number.isFinite(value) || (Number.isInteger(value) && !Number.isSafeInteger(value)))) {
    throw new NodeFailure("INVALID_INPUT", "A numeric filter value cannot be represented safely. Use text for large integer identifiers.", false);
  }
}

/** An unresolved expression must never be mistaken for an omitted selection. */
export function requireResolvedSelection(config: Record<string, unknown>, keys: readonly string[], provider: string) {
  const containsUndefined = (value: unknown): boolean => {
    if (value === undefined) return true;
    if (Array.isArray(value)) {
      for (let index = 0; index < value.length; index++) if (!Object.hasOwn(value, index) || containsUndefined(value[index])) return true;
      return false;
    }
    if (value !== null && typeof value === "object") return Object.values(value).some(containsUndefined);
    return false;
  };
  if (keys.some((key) => Object.hasOwn(config, key) && containsUndefined(config[key]))) {
    throw new NodeFailure("INVALID_INPUT", `${provider} selection contains an unresolved value.`, false);
  }
}
