"use client";

import { useId, useState } from "react";
import { Button, Field, Select } from "../../components/ui";
import { buildRelationalSelection, isRelationalBaselineCurrent, parseRelationalManual, parseRelationalSelection, relationalBaseline, type RelationalBaseline, type RelationalDraft, type RelationalForm, type RelationalMetadata, type RelationalOperator, type RelationalProvider, type RelationalSelection } from "./relational-selection";

export type RelationalSelectionFieldProps = {
  provider: RelationalProvider;
  /** Only selection keys, including unsupported ones; never pass the full node config. */
  value: RelationalSelection;
  /** Include node, credential, schema, table and a revision that changes on every external edit. */
  contextKey: string;
  /** Discovery is advisory. Set partial when the provider reports incomplete or truncated metadata. */
  metadata: RelationalMetadata;
  /** Parent persists this per node across unmounts and blocks save, publish and every run while present. */
  draft?: RelationalDraft;
  /** Another staged editor must be resolved before this selection can be applied. */
  applyBlockedReason?: string;
  onDraftChange: (draft: RelationalDraft | undefined) => void;
  /** Atomically compare baseline to the latest projection, provider and context; replace ALL selection keys, preserve other config, and return false on conflict. */
  onApply: (value: RelationalSelection, baseline: RelationalBaseline) => boolean;
};

const blankCondition = () => ({ column: "", operator: "equals" as const, type: "string" as const, value: "" });
const comparisons: Array<[RelationalOperator, string]> = [["equals", "Equals"], ["notEquals", "Does not equal"], ["greaterThan", "Greater than"], ["lessThan", "Less than"]];
const supabaseComparisons: Array<[RelationalOperator, string]> = [["greaterThanOrEqual", "Greater than or equal"], ["lessThanOrEqual", "Less than or equal"], ["isNull", "Is null"], ["isNotNull", "Is not null"]];

function ColumnControl({ label, value, onChange, metadata }: { label: string; value: string; onChange: (value: string) => void; metadata: RelationalMetadata }) {
  const id = useId();
  return <Field label={label}><input aria-label={label} value={value} onChange={(event) => onChange(event.target.value)} placeholder="Exact column name" list={metadata.status === "available" ? id : undefined} />
    {metadata.status === "available" && <datalist id={id}>{metadata.columns.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</datalist>}
  </Field>;
}

/** The owner must enforce staged state and compare-and-apply in its authoritative state update. */
export function RelationalSelectionField({ provider, value, contextKey, metadata, draft, applyBlockedReason, onDraftChange, onApply }: RelationalSelectionFieldProps) {
  const parsed = parseRelationalSelection(value, provider);
  const [manual, setManual] = useState(false);
  const [error, setError] = useState("");
  const isManual = draft ? draft.mode === "manual" : manual || parsed === null;
  const form = draft?.mode === "visual" ? draft.form : parsed;
  const stale = draft !== undefined && !isRelationalBaselineCurrent(draft.baseline, value, contextKey, provider);
  const update = (next: RelationalForm) => {
    onDraftChange({ mode: "visual", baseline: draft?.baseline ?? relationalBaseline(value, contextKey, provider), form: next });
    setError("");
  };
  const discard = () => { onDraftChange(undefined); setError(""); };
  const apply = () => {
    if (!draft) return;
    try {
      if (!isRelationalBaselineCurrent(draft.baseline, value, contextKey, provider)) throw new Error("The selection or table changed elsewhere. Discard these edits and review the current settings.");
      const next = draft.mode === "visual" ? buildRelationalSelection(draft.form, provider) : parseRelationalManual(draft.text, provider);
      if (!onApply(next, draft.baseline)) throw new Error("The selection or table changed elsewhere. Discard these edits and review the current settings.");
      onDraftChange(undefined);
      setError("");
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Check the selection settings."); }
  };
  const changeCondition = (index: number, patch: Partial<RelationalForm["conditions"][number]>) => {
    if (form) update({ ...form, conditions: form.conditions.map((row, i) => i === index ? { ...row, ...patch } : row) });
  };
  const changeOrder = (index: number, patch: Partial<RelationalForm["order"][number]>) => {
    if (form) update({ ...form, order: form.order.map((row, i) => i === index ? { ...row, ...patch } : row) });
  };
  return <div className="config-field mongo-filter">
    <div className="mongo-filter__heading"><strong>Choose rows and columns</strong><Button variant="ghost" disabled={draft !== undefined || (isManual && parsed === null)} onClick={() => { setManual(!isManual); setError(""); }}>{isManual ? "Use visual builder" : "Advanced settings"}</Button></div>
    <small>Changing the connection, schema or table keeps these selection settings. Review columns, conditions, sort and offset for the new resource before running.</small>
    {isManual ? <>
      {parsed === null && <small role="status">These settings cannot be shown safely in the visual builder. They remain unchanged until you apply an edit.</small>}
      <Field label="Selection settings (JSON)"><textarea aria-label="Selection settings (JSON)" rows={7} value={draft?.mode === "manual" ? draft.text : JSON.stringify(value, null, 2)} onChange={(event) => { onDraftChange({ mode: "manual", baseline: draft?.baseline ?? relationalBaseline(value, contextKey, provider), text: event.target.value }); setError(""); }} /></Field>
      <small>Use JSON for expressions or settings the visual builder cannot show. The provider validates these settings when the node runs.</small>
    </> : form && <>
      {metadata.status === "unavailable" ? <small role="status">Column metadata is unavailable. Enter exact column names manually.</small> : metadata.partial ? <small role="status">Column metadata is incomplete; other columns may exist. Enter exact names manually or choose a suggestion.</small> : <small>Choose a suggested column or enter its exact name manually. Metadata does not guarantee access.</small>}
      <small>{form.columns.length === 0 ? "All columns will be included." : "Only the chosen columns will be included."}</small>
      {form.columns.map((column, index) => <div className="mongo-filter__condition" key={index}>
        <div className="mongo-filter__row-heading"><strong>Column {index + 1}</strong><Button variant="ghost" aria-label={`Remove column ${index + 1}`} onClick={() => update({ ...form, columns: form.columns.filter((_, i) => i !== index) })}>Remove</Button></div>
        <ColumnControl label={`Column ${index + 1}`} value={column} metadata={metadata} onChange={(next) => update({ ...form, columns: form.columns.map((item, i) => i === index ? next : item) })} />
      </div>)}
      <Button variant="ghost" disabled={form.columns.length >= 50} onClick={() => update({ ...form, columns: [...form.columns, ""] })}>Add column</Button>
      <small>{form.conditions.length ? "All conditions must match." : "No conditions: include all rows, up to the row limit."}</small>
      {form.conditions.map((row, index) => <div className="mongo-filter__condition" key={index}>
        <div className="mongo-filter__row-heading"><strong>Condition {index + 1}</strong><Button variant="ghost" aria-label={`Remove condition ${index + 1}`} onClick={() => update({ ...form, conditions: form.conditions.filter((_, i) => i !== index) })}>Remove</Button></div>
        <ColumnControl label={`Condition ${index + 1} column`} value={row.column} metadata={metadata} onChange={(column) => changeCondition(index, { column })} />
        <Field label="Comparison"><Select aria-label={`Condition ${index + 1} comparison`} value={row.operator} onChange={(event) => changeCondition(index, { operator: event.target.value as RelationalOperator })}>{[...comparisons, ...(provider === "supabase" ? supabaseComparisons : [])].map(([key, label]) => <option key={key} value={key}>{label}</option>)}</Select></Field>
        {row.operator !== "isNull" && row.operator !== "isNotNull" && <>
          <Field label="Value type"><Select aria-label={`Condition ${index + 1} value type`} value={row.type} onChange={(event) => { const type = event.target.value as RelationalForm["conditions"][number]["type"]; changeCondition(index, { type, value: type === "boolean" ? "true" : "" }); }}><option value="string">Text</option><option value="number">Number</option><option value="boolean">True / false</option></Select></Field>
          <Field label="Value">{row.type === "boolean" ? <Select aria-label={`Condition ${index + 1} value`} value={row.value} onChange={(event) => changeCondition(index, { value: event.target.value })}><option value="true">True</option><option value="false">False</option></Select> : <input aria-label={`Condition ${index + 1} value`} type={row.type === "number" ? "number" : "text"} step={row.type === "number" ? "any" : undefined} value={row.value} onChange={(event) => changeCondition(index, { value: event.target.value })} />}</Field>
        </>}
      </div>)}
      <Button variant="ghost" disabled={form.conditions.length >= 20} onClick={() => update({ ...form, conditions: [...form.conditions, blankCondition()] })}>Add condition</Button>
      {form.order.map((entry, index) => <div className="mongo-filter__condition" key={index}>
        <div className="mongo-filter__row-heading"><strong>Sort {index + 1}</strong><Button variant="ghost" aria-label={`Remove sort ${index + 1}`} onClick={() => update({ ...form, order: form.order.filter((_, i) => i !== index) })}>Remove</Button></div>
        <ColumnControl label={`Sort ${index + 1} column`} value={entry.column} metadata={metadata} onChange={(column) => changeOrder(index, { column })} />
        <Field label="Sort direction"><Select aria-label={`Sort ${index + 1} direction`} value={entry.direction} onChange={(event) => changeOrder(index, { direction: event.target.value as "asc" | "desc" })}><option value="asc">Ascending</option><option value="desc">Descending</option></Select></Field>
        {provider === "supabase" && <Field label="Null placement"><Select aria-label={`Sort ${index + 1} null placement`} value={entry.nulls} onChange={(event) => changeOrder(index, { nulls: event.target.value as "" | "first" | "last" })}><option value="">Default</option><option value="first">First</option><option value="last">Last</option></Select></Field>}
      </div>)}
      <Button variant="ghost" disabled={form.order.length >= (provider === "postgres" ? 1 : 10)} onClick={() => update({ ...form, order: [...form.order, { column: "", direction: "asc", nulls: "" }] })}>Add sort</Button>
      <Field label="Rows to skip"><input aria-label="Rows to skip" type="number" min="0" max={provider === "postgres" ? 100000 : 1000000} step="1" value={form.offset} onChange={(event) => update({ ...form, offset: event.target.value })} /></Field>
      <small>{"Skipping rows requires a sort order. Without sorting, the order of rows is unspecified. "}For more stable pages, sort by a unique column{provider === "supabase" ? " or add one as a final tie-breaker" : ""}. Changes to data can still shift rows between pages.</small>
    </>}
    {draft && <><div className="mongo-filter__actions"><Button variant="secondary" disabled={stale || Boolean(applyBlockedReason)} onClick={apply}>Apply selection</Button><Button variant="ghost" onClick={discard}>Discard</Button></div><small role="status">{stale ? "The selection or table changed elsewhere. Discard these edits to continue." : applyBlockedReason ?? "Apply or discard these edits before saving, publishing or running."}</small></>}
    {error && <small role="alert">{error}</small>}
  </div>;
}
