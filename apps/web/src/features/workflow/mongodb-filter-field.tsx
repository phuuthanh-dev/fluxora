"use client";

import { useState } from "react";
import { Button, Field, Select } from "../../components/ui";
import { buildMongoFilter, parseMongoFilter, type MongoFilterOperator, type MongoFilterRow } from "./mongodb-filter";
import type { StagedText } from "./inspector-drafts";

const blankRow = (): MongoFilterRow => ({ field: "", operator: "eq", type: "text", value: "" });
const choices: Array<[MongoFilterOperator, string]> = [["eq", "Equals"], ["ne", "Does not equal"], ["gt", "Greater than"], ["gte", "At least"], ["lt", "Less than"], ["lte", "At most"], ["exists", "Field exists"]];

export function MongoFilterField({ value, onChange, draft, onDraftChange, rawDraft, onRawDraftChange }: { value: string; onChange: (value: string) => void; draft?: MongoFilterRow[]; onDraftChange: (draft: MongoFilterRow[] | undefined) => void; rawDraft?: StagedText; onRawDraftChange: (draft: StagedText | undefined) => void }) {
  const [advanced, setAdvanced] = useState(() => rawDraft !== undefined || parseMongoFilter(value) === null);
  const dirty = draft !== undefined;
  const rows = draft ?? parseMongoFilter(value) ?? [];
  const [error, setError] = useState("");
  const update = (index: number, patch: Partial<MongoFilterRow>) => {
    onDraftChange(rows.map((row, i) => i === index ? { ...row, ...patch } : row));
    setError("");
  };
  const apply = () => {
    try { onChange(buildMongoFilter(rows)); onDraftChange(undefined); setError(""); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "Check your conditions."); }
  };
  const cancel = () => { onDraftChange(undefined); setError(""); };
  const applyRaw = () => {
    if (!rawDraft) return;
    try {
      if (rawDraft.baseline !== value) throw new Error("The filter changed elsewhere. Discard these edits and review the current filter.");
      const parsed: unknown = JSON.parse(rawDraft.text);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Enter a JSON object for the filter.");
      onChange(rawDraft.text); onRawDraftChange(undefined); setError("");
    } catch (failure) { setError(failure instanceof SyntaxError ? "Enter valid JSON for the filter." : failure instanceof Error ? failure.message : "Check your filter."); }
  };
  const parsed = parseMongoFilter(value);
  return <div className="config-field mongo-filter">
    <div className="mongo-filter__heading"><strong>Filter documents</strong><Button type="button" variant="ghost" disabled={dirty || rawDraft !== undefined || (advanced && parsed === null)} onClick={() => setAdvanced(!advanced)}>{advanced ? "Use visual builder" : "Edit JSON"}</Button></div>
    {advanced ? <><Field label="Filter (JSON)"><textarea aria-label="Filter (JSON)" value={rawDraft?.text ?? value} onChange={(event) => { const text = event.target.value; onRawDraftChange(text === (rawDraft?.baseline ?? value) ? undefined : { text, baseline: rawDraft?.baseline ?? value }); setError(""); }} rows={5} /></Field><small>Advanced filter is preserved as entered. The visual builder supports simple conditions only.</small>{rawDraft && <><div className="mongo-filter__actions"><Button type="button" variant="secondary" onClick={applyRaw}>Apply filter JSON</Button><Button type="button" variant="ghost" onClick={() => { onRawDraftChange(undefined); setError(""); }}>Discard filter JSON</Button></div><small role="status">Apply or discard the filter before saving, publishing or running.</small></>}{error && <small role="alert">{error}</small>}</> : <>
      <small>{rows.length ? "All conditions must match." : "No conditions: return documents up to the limit below."}</small>
      {rows.map((row, index) => <div className="mongo-filter__condition" key={index}>
        <div className="mongo-filter__row-heading"><strong>Condition {index + 1}</strong><Button type="button" variant="ghost" onClick={() => onDraftChange(rows.filter((_, i) => i !== index))}>Remove</Button></div>
        <Field label="Field"><input aria-label={`Condition ${index + 1} field`} placeholder="e.g. status" value={row.field} onChange={(event) => update(index, { field: event.target.value })} /></Field>
        <Field label="Operator"><Select aria-label={`Condition ${index + 1} operator`} value={row.operator} onChange={(event) => { const operator = event.target.value as MongoFilterOperator; update(index, operator === "exists" ? { operator, type: "boolean", value: "true" } : { operator }); }}>{choices.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</Select></Field>
        {row.operator !== "exists" && <Field label="Value type"><Select aria-label={`Condition ${index + 1} value type`} value={row.type} onChange={(event) => { const type = event.target.value as MongoFilterRow["type"]; update(index, { type, value: type === "boolean" ? "true" : "" }); }}><option value="text">Text</option><option value="number">Number</option><option value="boolean">True / false</option></Select></Field>}
        <Field label={row.operator === "exists" ? "Exists" : "Value"}>{row.type === "boolean" ? <Select aria-label={`Condition ${index + 1} value`} value={row.value} onChange={(event) => update(index, { value: event.target.value })}><option value="true">True</option><option value="false">False</option></Select> : <input aria-label={`Condition ${index + 1} value`} type={row.type === "number" ? "number" : "text"} value={row.value} onChange={(event) => update(index, { value: event.target.value })} />}</Field>
      </div>)}
      <div className="mongo-filter__actions"><Button type="button" variant="ghost" onClick={() => onDraftChange([...rows, blankRow()])}>Add condition</Button>{dirty && <><Button type="button" variant="secondary" onClick={apply}>Apply conditions</Button><Button type="button" variant="ghost" onClick={cancel}>Discard</Button></>}</div>
      {dirty && <small role="status">Apply or discard these conditions before saving, publishing or running.</small>}
      {error && <small role="alert">{error}</small>}
    </>}
  </div>;
}
