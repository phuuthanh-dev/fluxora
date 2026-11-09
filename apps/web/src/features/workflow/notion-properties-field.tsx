"use client";

import { useEffect, useState } from "react";
import { Button, Field, Select } from "../../components/ui";
import { apiRequest } from "../api/api-client";

type PropertyType = "title" | "rich_text" | "number" | "select" | "status" | "date" | "checkbox";
type Property = { id: string; name: string; type: PropertyType; options?: Array<{ id: string; name: string }> };
type Row = { id: string; type: PropertyType; value: string | number | boolean | null };
const labels: Record<PropertyType, string> = { title: "Title", rich_text: "Text", number: "Number", select: "Select", status: "Status", date: "Date", checkbox: "Checkbox" };

export function NotionPropertiesField({ workspaceId, config, onChange, error }: { workspaceId: string; config: Record<string, unknown>; onChange: (value: Row[]) => void; error?: string }) {
  const [schema, setSchema] = useState<{ scope: string; properties: Property[]; hasMore: boolean } | null>(null);
  const [loading, setLoading] = useState(false);
  const [failure, setFailure] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [expressions, setExpressions] = useState<string[]>([]);
  const credentialId = typeof config.credentialId === "string" ? config.credentialId : "";
  const dataSourceId = typeof config.dataSourceId === "string" ? config.dataSourceId : "";
  const scope = JSON.stringify([workspaceId, credentialId, dataSourceId]);
  const rows = Array.isArray(config.properties) ? config.properties as Row[] : [];
  const properties = schema?.scope === scope ? schema.properties : [];
  useEffect(() => {
    let active = true;
    setFailure(""); setSchema(null); setExpressions([]);
    if (!workspaceId || !credentialId || !dataSourceId || dataSourceId.includes("{{")) { setLoading(false); return; }
    setLoading(true);
    apiRequest<{ properties: Property[]; hasMore: boolean }>(`/workspaces/${encodeURIComponent(workspaceId)}/credentials/${encodeURIComponent(credentialId)}/notion/writable-properties?${new URLSearchParams({ dataSourceId })}`)
      .then((result) => { if (active) setSchema({ scope, ...result }); })
      .catch(() => { if (active) setFailure("Properties could not be loaded. Check access to this data source, then retry."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [scope, workspaceId, credentialId, dataSourceId, refresh]);
  const update = (index: number, value: Row["value"]) => onChange(rows.map((row, i) => i === index ? { ...row, value } : row));
  return <section className="mongo-filter config-field" aria-label="Notion properties">
    <div className="mongo-filter__row-heading"><strong>Properties</strong><Button type="button" variant="ghost" disabled={loading || !dataSourceId} onClick={() => setRefresh((value) => value + 1)}>Reload properties</Button></div>
    <p className="structured-output-setting__help">Only selected properties change. Add the title when creating a page. Formula, relation, rollup and other unsupported types are not editable here.</p>
    {error && <p role="alert" className="ui-field__error">{error}</p>}
    {loading && <small role="status">Loading data source properties…</small>}
    {failure && <p role="alert">{failure}</p>}
    {!dataSourceId && <small>Choose a data source to load its fields.</small>}
    {schema?.scope === scope && schema.hasMore && <small>Only the first 100 writable properties are shown.</small>}
    <Field label="Add a property"><Select aria-label="Add a property" value="" disabled={loading || !properties.length || rows.length >= 50} onChange={(event) => { const property = properties.find((item) => item.id === event.target.value); if (property) onChange([...rows, { id: property.id, type: property.type, value: property.type === "checkbox" ? false : property.type === "number" ? 0 : "" }]); }}><option value="">Select property</option>{properties.filter((property) => !rows.some((row) => row.id === property.id)).map((property) => <option key={property.id} value={property.id}>{property.name} · {labels[property.type]}</option>)}</Select></Field>
    {rows.map((row, index) => {
      const property = properties.find((item) => item.id === row.id);
      const expression = expressions.includes(row.id) || typeof row.value === "string" && row.value.includes("{{");
      const name = property?.name ?? row.id;
      return <div className="mongo-filter__condition" key={`${row.id}-${index}`}>
        <div className="mongo-filter__row-heading"><strong>{name}</strong><Button type="button" variant="ghost" aria-label={`Remove ${name}`} onClick={() => onChange(rows.filter((_, i) => i !== index))}>Remove</Button></div>
        {schema?.scope === scope && (!property || property.type !== row.type) && <p role="alert">This field no longer matches the schema. Remove it and choose the updated field.</p>}
        <label className="checkbox-field"><input type="checkbox" checked={expression} onChange={(event) => { setExpressions((current) => event.target.checked ? [...current, row.id] : current.filter((id) => id !== row.id)); update(index, event.target.checked ? "{{ $json.value }}" : row.type === "checkbox" ? false : row.type === "number" ? 0 : ""); }} />Use a value from an earlier step</label>
        {expression ? <Field label={`${name} expression`}><input aria-label={`${name} expression`} value={String(row.value ?? "")} onChange={(event) => update(index, event.target.value)} placeholder="{{ $json.value }}" /></Field>
          : row.value === null ? <small>Clear this value when the node runs.</small>
          : row.type === "checkbox" ? <label className="checkbox-field"><input type="checkbox" checked={row.value === true} onChange={(event) => update(index, event.target.checked)} />{name}</label>
          : row.type === "select" || row.type === "status" ? <Field label={name}><Select aria-label={name} value={String(row.value ?? "")} onChange={(event) => update(index, event.target.value)}><option value="">Select value</option>{!property?.options?.some((option) => option.id === row.value) && row.value && <option value={String(row.value)}>Saved option — reload to confirm</option>}{property?.options?.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</Select></Field>
          : <Field label={name}><input aria-label={name} type={row.type === "number" ? "number" : "text"} step={row.type === "number" ? "any" : undefined} placeholder={row.type === "date" ? "YYYY-MM-DD or timestamp with timezone" : "Enter value"} value={String(row.value ?? "")} onChange={(event) => update(index, row.type === "number" && event.target.value !== "" ? Number(event.target.value) : event.target.value)} /></Field>}
        {!["title", "checkbox"].includes(row.type) && <label className="checkbox-field"><input type="checkbox" checked={row.value === null} onChange={(event) => update(index, event.target.checked ? null : row.type === "number" ? 0 : "")} />Clear value</label>}
      </div>;
    })}
  </section>;
}
