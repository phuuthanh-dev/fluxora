"use client";

import { useState } from "react";
import { Button, Field, Select } from "../../components/ui";
import {
  buildStructuredOutputSchema,
  parseStructuredOutputJson,
  parseStructuredOutputSchema,
  structuredOutputBaseline,
  STRUCTURED_OUTPUT_MAX_DESCRIPTION_LENGTH,
  STRUCTURED_OUTPUT_MAX_FIELDS,
  STRUCTURED_OUTPUT_MAX_NAME_LENGTH,
  type StructuredOutputDraft,
  type StructuredOutputModel,
  type StructuredOutputRow,
  type StructuredOutputType,
} from "./structured-output-schema";

export type StructuredOutputFieldProps = {
  /** The schema object stored in the draft graph, or undefined for a new schema. */
  value: unknown;
  onChange: (value: Record<string, unknown>) => void;
  /** Keep this draft above the inspector so edits survive unmounts and node switches. */
  draft?: StructuredOutputDraft;
  onDraftChange: (draft: StructuredOutputDraft | undefined) => void;
};

export function StructuredOutputField({ value, onChange, draft, onDraftChange }: StructuredOutputFieldProps) {
  const parsed = parseStructuredOutputSchema(value);
  const [advanced, setAdvanced] = useState(() => draft?.kind === "json" || (draft === undefined && parsed === null));
  const [error, setError] = useState("");
  // External changes must not hide an existing draft or make an unsupported schema editable visually.
  const showAdvanced = draft ? draft.kind === "json" : advanced || parsed === null;
  const model = draft?.kind === "visual" ? draft.model : parsed ?? { fields: [] };
  const baseline = structuredOutputBaseline(value);
  const updateModel = (next: StructuredOutputModel) => {
    onDraftChange({ kind: "visual", baseline: draft?.baseline ?? baseline, model: next });
    setError("");
  };
  const updateRow = (index: number, patch: Partial<StructuredOutputRow>) => {
    updateModel({ ...model, fields: model.fields.map((row, i) => i === index ? { ...row, ...patch } : row) });
  };
  const apply = () => {
    if (!draft) return;
    try {
      if (draft.baseline !== baseline) throw new Error("The output schema changed elsewhere. Discard these edits and review the current schema.");
      const next = draft.kind === "visual" ? buildStructuredOutputSchema(draft.model) : parseStructuredOutputJson(draft.text);
      onChange(next);
      onDraftChange(undefined);
      setError("");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Check the output schema.");
    }
  };
  const discard = () => { onDraftChange(undefined); setError(""); };

  return <section className="config-field mongo-filter" aria-label="Structured output schema">
    <div className="mongo-filter__heading">
      <strong>Output fields</strong>
      <Button variant="ghost" disabled={draft !== undefined || (showAdvanced && parsed === null)} onClick={() => { setAdvanced(!showAdvanced); setError(""); }}>
        {showAdvanced ? "Use field builder" : "Edit JSON"}
      </Button>
    </div>
    {showAdvanced ? <>
      <Field label="Output schema (JSON)">
        <textarea rows={8} value={draft?.kind === "json" ? draft.text : value === undefined ? "" : JSON.stringify(value, null, 2)} onChange={(event) => {
          const text = event.target.value;
          onDraftChange({ kind: "json", baseline: draft?.baseline ?? baseline, text });
          setError("");
        }} />
      </Field>
      <small>The field builder supports a flat object of primitive fields. Advanced mode supports nested objects, arrays and string enums; model support varies.</small>
      {parsed === null && <small>The current schema cannot be represented by the field builder.</small>}
    </> : <>
      <small>Describe each value you want back. Every field is required and extra fields are not allowed.</small>
      <Field label="Output description (optional)">
        <textarea rows={2} maxLength={STRUCTURED_OUTPUT_MAX_DESCRIPTION_LENGTH} value={model.description ?? ""} onChange={(event) => updateModel({ ...model, description: event.target.value })} />
      </Field>
      {model.fields.map((row, index) => <fieldset className="mongo-filter__condition" key={index}>
        <legend className="visually-hidden">Field {index + 1}</legend>
        <div className="mongo-filter__row-heading"><strong>Field {index + 1}</strong><Button variant="ghost" aria-label={`Remove field ${index + 1}${row.name ? `: ${row.name}` : ""}`} onClick={() => updateModel({ ...model, fields: model.fields.filter((_, i) => i !== index) })}>Remove</Button></div>
        <Field label="Name"><input aria-label={`Field ${index + 1} name`} placeholder="e.g. summary" maxLength={STRUCTURED_OUTPUT_MAX_NAME_LENGTH} value={row.name} onChange={(event) => updateRow(index, { name: event.target.value })} /></Field>
        <Field label="Type"><Select aria-label={`Field ${index + 1} type`} value={row.type} onChange={(event) => updateRow(index, { type: event.target.value as StructuredOutputType })}>
          <option value="string">Text</option><option value="number">Number</option><option value="integer">Whole number</option><option value="boolean">True / false</option><option value="null">Null</option>
        </Select></Field>
        <Field label="Description (optional)"><textarea aria-label={`Field ${index + 1} description`} rows={2} maxLength={STRUCTURED_OUTPUT_MAX_DESCRIPTION_LENGTH} placeholder="What should this field contain?" value={row.description ?? ""} onChange={(event) => updateRow(index, { description: event.target.value })} /></Field>
      </fieldset>)}
      <div className="mongo-filter__actions"><Button variant="ghost" disabled={model.fields.length >= STRUCTURED_OUTPUT_MAX_FIELDS} onClick={() => updateModel({ ...model, fields: [...model.fields, { name: "", type: "string" }] })}>Add field</Button></div>
      <small>Up to {STRUCTURED_OUTPUT_MAX_FIELDS} fields.</small>
    </>}
    {draft && <>
      <div className="mongo-filter__actions"><Button onClick={apply}>{draft.kind === "json" ? "Apply schema JSON" : "Apply fields"}</Button><Button variant="ghost" onClick={discard}>Discard schema edits</Button></div>
      <small role="status">Apply or discard these schema edits before saving, publishing or running.</small>
    </>}
    {error && <small role="alert">{error}</small>}
  </section>;
}
