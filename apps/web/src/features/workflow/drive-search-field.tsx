"use client";

import { useState } from "react";
import { Button, Field, Select } from "../../components/ui";
import { buildDriveSearch, parseDriveSearch, type DriveSearch, type DriveSearchType } from "./drive-search";
import { ResourcePicker } from "./resource-picker";

export function DriveSearchField({ value, workspaceId, credentialId, onChange }: { value: string; workspaceId: string; credentialId: string; onChange: (value: string) => void }) {
  const [advanced, setAdvanced] = useState(() => parseDriveSearch(value) === null);
  const [error, setError] = useState("");
  const search = parseDriveSearch(value);
  const update = (patch: Partial<DriveSearch>) => {
    if (!search) return;
    try { onChange(buildDriveSearch({ ...search, ...patch })); setError(""); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Check your search filters."); }
  };
  return <div className="config-field">
    <div className="mongo-filter__heading"><strong>Search files</strong><Button type="button" variant="ghost" disabled={advanced && !search} onClick={() => { setAdvanced(!advanced); setError(""); }}>{advanced ? "Use filters" : "Advanced query"}</Button></div>
    {advanced || !search ? <><Field label="Search query"><input aria-label="Search query" value={value} onChange={(event) => onChange(event.target.value)} /></Field><small>Existing Drive queries and expressions are preserved. To use filters with an unsupported query, clear it or simplify it first.</small></> : <>
      <Field label="Name starts with"><input aria-label="Name starts with" value={search.name} onChange={(event) => update({ name: event.target.value })} /></Field>
      <Field label="File type"><Select aria-label="File type" value={search.type} onChange={(event) => update({ type: event.target.value as DriveSearchType })}><option value="any">Any type</option><option value="document">Google Docs</option><option value="spreadsheet">Google Sheets</option><option value="folder">Folder</option><option value="pdf">PDF</option></Select></Field>
      <ResourcePicker workspaceId={workspaceId} resource="google-folder" credentialId={credentialId} label="Parent folder (optional)" value={search.folder} placeholder="Search loaded folders" onChange={(folder) => update({ folder })} />
      <small>Folder matches direct children only. Leave filters empty to search all accessible files.</small>
    </>}
    {error && <small role="alert">{error}</small>}
  </div>;
}
