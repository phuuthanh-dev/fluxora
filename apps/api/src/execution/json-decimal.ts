// Compare decimal spellings without converting their significant digits to a
// Number. This checks JSON round-tripping, not exact binary representation.
function canonicalDecimal(value: string): string {
  const [mantissa = "", exponent = "0"] = value.toLowerCase().split("e");
  const negative = mantissa.startsWith("-");
  const [whole = "", fraction = ""] = (negative ? mantissa.slice(1) : mantissa).split(".");
  let digits = `${whole}${fraction}`.replace(/^0+/, "");
  if (!digits) return "0";
  let scale = Number(exponent) - fraction.length;
  while (digits.endsWith("0")) { digits = digits.slice(0, -1); scale++; }
  return `${negative ? "-" : ""}${digits}e${scale}`;
}

export function preservesJsonDecimal(source: string, value: number): boolean {
  return source.length <= 100 && Number.isFinite(value) &&
    (!Number.isInteger(value) || Number.isSafeInteger(value)) &&
    canonicalDecimal(source) === canonicalDecimal(String(value));
}

/** Parse only when numeric tokens survive the JavaScript number representation. */
export function parseJsonPreservingNumbers(text: string): unknown {
  return JSON.parse(text, (_key: string, value: unknown, context?: { source?: string }) => {
    if (typeof value === "number" && (typeof context?.source !== "string" || !preservesJsonDecimal(context.source, value))) throw new RangeError("JSON number cannot be preserved");
    return value;
  }) as unknown;
}
