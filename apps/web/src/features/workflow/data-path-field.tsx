"use client";

import { useId } from "react";
import { Field } from "../../components/ui";

/** Suggestions describe the selected execution, never provider or credential data. */
export function sampleFieldPaths(sample: unknown): string[] {
  const paths = new Set<string>();
  function visit(value: unknown, prefix: string, depth: number) {
    if (!value || typeof value !== "object" || depth > 4 || paths.size >= 100) return;
    if (Array.isArray(value)) { value.slice(0, 3).forEach((item) => visit(item, prefix, depth)); return; }
    for (const [key, child] of Object.entries(value)) {
      if (!/^[A-Za-z0-9_ -]+$/.test(key) || ["__proto__", "prototype", "constructor"].includes(key)) continue;
      const path = prefix ? `${prefix}.${key}` : key;
      paths.add(path);
      if (!Array.isArray(child)) visit(child, path, depth + 1);
    }
  }
  // Collection envelopes are a display convention; the runtime remains responsible
  // for deciding which output is an item stream.
  const envelope = sample && typeof sample === "object" && !Array.isArray(sample) ? sample as Record<string, unknown> : undefined;
  const collection = envelope && ["items", "rows", "results", "pages", "files", "documents"].find((key) => Array.isArray(envelope[key]));
  visit(collection ? envelope![collection] : sample, "", 0);
  return [...paths].slice(0, 100);
}

export function DataPathField({ label, value, sample, error, onChange }: { label: string; value: string; sample: unknown; error?: string; onChange: (value: string) => void }) {
  const id = useId();
  const paths = sampleFieldPaths(sample);
  return <Field label={label} className="config-field" error={error}>
    <input aria-label={label} list={id} value={value} placeholder="Choose or enter a field, e.g. customer.id" onChange={(event) => onChange(event.target.value)} />
    <datalist id={id}>{paths.map((path) => <option key={path} value={path} />)}</datalist>
    <small>{paths.length ? "Suggestions from the selected run. Nested fields use a dot." : "Run the previous step to see suggestions, or enter a field path."}</small>
  </Field>;
}
