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

export function DataPathListField({ label, value, sample, error, onChange }: { label: string; value: string; sample: unknown; error?: string; onChange: (value: string) => void }) {
  const paths = sampleFieldPaths(sample);
  const selected = value.split(",").map((field) => field.trim()).filter(Boolean);
  return <Field label={label} className="config-field" error={error}>
    {paths.length > 0 && <select aria-label="Add a field from previous output" value="" onChange={(event) => { if (event.target.value && !selected.includes(event.target.value)) onChange([...selected, event.target.value].join(", ")); }}>
      <option value="">Add a field from previous output</option>
      {paths.filter((path) => !selected.includes(path)).map((path) => <option key={path} value={path}>{path}</option>)}
    </select>}
    <input aria-label={label} value={value} placeholder="e.g. email, customer.id" onChange={(event) => onChange(event.target.value)} />
    <small>{paths.length ? "Select fields above or enter paths separated by commas." : "Run the previous step for field suggestions, or enter paths separated by commas."}</small>
  </Field>;
}
