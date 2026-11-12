"use client";

import { useEffect, useState } from "react";
import { Button, Field, Select } from "../../components/ui";
import { apiRequest } from "../api/api-client";

type Row = { column: string; type: string; value: string };
type Option = { id: string; name: string };

export function AirtableFields({ workspaceId, config, onChange, error }: { workspaceId: string; config: Record<string, unknown>; onChange: (rows: Row[]) => void; error?: string }) {
  const [options, setOptions] = useState<Option[]>([]);
  const [status, setStatus] = useState("");
  const [reload, setReload] = useState(0);
  const credentialId = typeof config.credentialId === "string" ? config.credentialId : "";
  const baseId = typeof config.baseId === "string" ? config.baseId : "";
  const tableId = typeof config.tableId === "string" ? config.tableId : "";
  const rows: Row[] = Array.isArray(config.fields) ? config.fields.map((item: unknown) => {
    const row = item && typeof item === "object" ? item as Record<string, unknown> : {};
    return { column: typeof row.column === "string" ? row.column : "", type: typeof row.type === "string" ? row.type : "text", value: row.value == null ? "" : String(row.value) };
  }) : [];
  useEffect(() => {
    let active = true;
    setOptions([]);
    if (!credentialId || !baseId || !tableId || [baseId, tableId].some((value) => value.includes("{{"))) { setStatus("Choose a connection, base and table to load fields."); return; }
    setStatus("Loading fields…");
    const query = new URLSearchParams({ baseId, tableId });
    apiRequest<{ items: Option[]; truncated: boolean }>(`/workspaces/${encodeURIComponent(workspaceId)}/credentials/${encodeURIComponent(credentialId)}/airtable/fields?${query}`)
      .then((result) => { if (active) { setOptions(result.items); setStatus(result.truncated ? "Only the first 100 fields are shown." : "Choose a field to update."); } })
      .catch(() => { if (active) setStatus("Fields could not be loaded. Check access and try again."); });
    return () => { active = false; };
  }, [workspaceId, credentialId, baseId, tableId, reload]);
  const update = (index: number, patch: Partial<Row>) => onChange(rows.map((row, i) => i === index ? { ...row, ...patch } : row));
  return <section className="config-field mongo-filter" aria-label="Airtable field values">
    <div className="mongo-filter__row-heading"><strong>Field values</strong><Button type="button" variant="ghost" disabled={!credentialId || !baseId || !tableId} onClick={() => setReload((value) => value + 1)}>Reload fields</Button></div>
    <small role="status">{status} Changing the connection, base or table clears selected values.</small>
    {error && <p role="alert" className="ui-field__error">{error}</p>}
    {rows.map((row, index) => <div className="mongo-filter__condition" key={index}>
      <div className="mongo-filter__row-heading"><strong>Field {index + 1}</strong><Button type="button" variant="ghost" aria-label={`Remove field ${index + 1}`} onClick={() => onChange(rows.filter((_, i) => i !== index))}>Remove</Button></div>
      <Field label="Field"><Select aria-label={`Field ${index + 1}`} value={row.column} onChange={(event) => update(index, { column: event.target.value })}><option value="">Select a field</option>{row.column && !options.some((option) => option.id === row.column) && <option value={row.column}>Saved field · {row.column}</option>}{options.filter((option) => option.id === row.column || !rows.some((other) => other.column === option.id)).map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</Select></Field>
      <Field label="Value type"><Select aria-label={`Field ${index + 1} value type`} value={row.type} onChange={(event) => update(index, { type: event.target.value, value: event.target.value === "boolean" ? "true" : "" })}><option value="text">Text</option><option value="number">Number</option><option value="boolean">True / false</option><option value="null">Clear value</option><option value="expression">Value from a previous step</option></Select></Field>
      {row.type !== "null" && <Field label="Value">{row.type === "boolean" ? <Select aria-label={`Field ${index + 1} value`} value={row.value} onChange={(event) => update(index, { value: event.target.value })}><option value="true">True</option><option value="false">False</option></Select> : <input aria-label={`Field ${index + 1} value`} data-expression-target={row.type === "expression" ? "" : undefined} value={row.value} placeholder={row.type === "expression" ? "{{ $json.value }}" : "Enter a value"} onChange={(event) => update(index, { value: event.target.value })} />}</Field>}
    </div>)}
    <Button type="button" variant="ghost" disabled={rows.length >= 50 || !options.length} onClick={() => onChange([...rows, { column: "", type: "text", value: "" }])}>Add field</Button>
    <small>Only selected fields are changed. If a write times out, check Airtable before retrying.</small>
  </section>;
}
