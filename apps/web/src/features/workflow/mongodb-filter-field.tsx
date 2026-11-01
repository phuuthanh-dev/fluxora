"use client";

import { useEffect, useState } from "react";
import { Button, Field, Select } from "../../components/ui";
import { buildMongoFilter, parseMongoFilter, type MongoFilterOperator, type MongoFilterRow } from "./mongodb-filter";

const blankRow = (): MongoFilterRow => ({ field: "", operator: "eq", type: "text", value: "" });
const choices: Array<[MongoFilterOperator, string]> = [["eq", "Equals"], ["ne", "Does not equal"], ["gt", "Greater than"], ["gte", "At least"], ["lt", "Less than"], ["lte", "At most"], ["exists", "Field exists"]];

export function MongoFilterField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [advanced, setAdvanced] = useState(() => parseMongoFilter(value) === null);
  const [rows, setRows] = useState<MongoFilterRow[]>(() => parseMongoFilter(value) ?? []);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { if (!dirty) setRows(parseMongoFilter(value) ?? []); }, [value, dirty]);
  const update = (index: number, patch: Partial<MongoFilterRow>) => {
    setRows((current) => current.map((row, i) => i === index ? { ...row, ...patch } : row));
    setDirty(true); setError("");
  };
  const apply = () => {
    try { onChange(buildMongoFilter(rows)); setDirty(false); setError(""); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "Check your conditions."); }
  };
  const cancel = () => { setRows(parseMongoFilter(value) ?? []); setDirty(false); setError(""); };
  const parsed = parseMongoFilter(value);
  return <div className="config-field mongo-filter">
    <div className="mongo-filter__heading"><strong>Filter documents</strong><Button type="button" variant="ghost" disabled={dirty || (advanced && parsed === null)} onClick={() => { setRows(parsed ?? []); setAdvanced(!advanced); }}>{advanced ? "Use visual builder" : "Edit JSON"}</Button></div>
    {advanced ? <><Field label="Filter (JSON)"><textarea aria-label="Filter (JSON)" value={value} onChange={(event) => onChange(event.target.value)} rows={5} /></Field><small>Advanced filter is preserved as entered. The visual builder supports simple conditions only.</small></> : <>
      <small>{rows.length ? "All conditions must match." : "No conditions: return documents up to the limit below."}</small>
      {rows.map((row, index) => <div className="mongo-filter__condition" key={index}>
        <div className="mongo-filter__row-heading"><strong>Condition {index + 1}</strong><Button type="button" variant="ghost" onClick={() => { setRows(rows.filter((_, i) => i !== index)); setDirty(true); }}>Remove</Button></div>
        <Field label="Field"><input aria-label={`Condition ${index + 1} field`} placeholder="e.g. status" value={row.field} onChange={(event) => update(index, { field: event.target.value })} /></Field>
        <Field label="Operator"><Select aria-label={`Condition ${index + 1} operator`} value={row.operator} onChange={(event) => { const operator = event.target.value as MongoFilterOperator; update(index, operator === "exists" ? { operator, type: "boolean", value: "true" } : { operator }); }}>{choices.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</Select></Field>
        {row.operator !== "exists" && <Field label="Value type"><Select aria-label={`Condition ${index + 1} value type`} value={row.type} onChange={(event) => { const type = event.target.value as MongoFilterRow["type"]; update(index, { type, value: type === "boolean" ? "true" : "" }); }}><option value="text">Text</option><option value="number">Number</option><option value="boolean">True / false</option></Select></Field>}
        <Field label={row.operator === "exists" ? "Exists" : "Value"}>{row.type === "boolean" ? <Select aria-label={`Condition ${index + 1} value`} value={row.value} onChange={(event) => update(index, { value: event.target.value })}><option value="true">True</option><option value="false">False</option></Select> : <input aria-label={`Condition ${index + 1} value`} type={row.type === "number" ? "number" : "text"} value={row.value} onChange={(event) => update(index, { value: event.target.value })} />}</Field>
      </div>)}
      <div className="mongo-filter__actions"><Button type="button" variant="ghost" onClick={() => { setRows([...rows, blankRow()]); setDirty(true); }}>Add condition</Button>{dirty && <><Button type="button" variant="secondary" onClick={apply}>Apply conditions</Button><Button type="button" variant="ghost" onClick={cancel}>Discard</Button></>}</div>
      {dirty && <small role="status">Apply conditions before running or saving. The previous filter remains in use until applied.</small>}
      {error && <small role="alert">{error}</small>}
    </>}
  </div>;
}
