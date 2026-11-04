"use client";

import { useEffect, useRef, useState } from "react";
import { Button, Field, Select } from "../../components/ui";
import { apiRequest } from "../api/api-client";
import { columnLabel, literalSheetTitle, sheetRange, sheetsBaseline, type SheetHeader, type SheetsMappingDraft } from "./google-sheets-mapping";

type Tab = { id: number; title: string };

export function GoogleSheetsMappingField({ workspaceId, config, draft, onDraftChange, onApply, applyBlockedReason }: {
  workspaceId: string;
  config: Record<string, unknown>;
  draft?: SheetsMappingDraft;
  onDraftChange: (draft: SheetsMappingDraft | undefined) => void;
  onApply: (draft: SheetsMappingDraft) => boolean;
  applyBlockedReason?: string;
}) {
  const credentialId = typeof config.credentialId === "string" ? config.credentialId : "";
  const spreadsheetId = typeof config.spreadsheetId === "string" ? config.spreadsheetId : "";
  const scope = JSON.stringify([workspaceId, credentialId, spreadsheetId]);
  const scopeRef = useRef(scope);
  const draftRef = useRef(draft);
  scopeRef.current = scope;
  draftRef.current = draft;
  const controller = useRef<AbortController | null>(null);
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [tabsScope, setTabsScope] = useState("");
  const [hasMore, setHasMore] = useState(false);
  const [selectedId, setSelectedId] = useState("");
  const [manualTab, setManualTab] = useState("");
  const [loading, setLoading] = useState<"tabs" | "headers" | null>(null);
  const [error, setError] = useState("");
  const canDiscover = Boolean(workspaceId && credentialId && /^[A-Za-z0-9_-]{1,200}$/.test(spreadsheetId));
  const stale = Boolean(draft && draft.baseline !== sheetsBaseline(workspaceId, config));

  useEffect(() => {
    controller.current?.abort();
    setTabs([]); setTabsScope(""); setHasMore(false); setSelectedId(""); setLoading(null); setError("");
    return () => controller.current?.abort();
  }, [scope]);

  const request = () => {
    controller.current?.abort();
    const next = new AbortController();
    controller.current = next;
    return next;
  };
  const endpoint = `/workspaces/${encodeURIComponent(workspaceId)}/credentials/${encodeURIComponent(credentialId)}/google/sheets`;
  const loadTabs = async () => {
    if (!canDiscover) return;
    const active = request();
    const requestedScope = scope;
    setError(""); setLoading("tabs"); setTabs([]); setTabsScope(""); setSelectedId("");
    try {
      const params = new URLSearchParams({ spreadsheetId });
      const response = await apiRequest<{ tabs: Tab[]; hasMore: boolean }>(`${endpoint}/tabs?${params}`, { signal: active.signal });
      if (!active.signal.aborted && scopeRef.current === requestedScope) { setTabs(response.tabs); setTabsScope(requestedScope); setHasMore(response.hasMore); }
    } catch (reason) {
      if (!active.signal.aborted && scopeRef.current === requestedScope) setError(reason instanceof Error ? reason.message : "Tabs could not be loaded. Use the range field manually.");
    } finally { if (!active.signal.aborted && scopeRef.current === requestedScope) setLoading(null); }
  };
  const stageTab = (tab: string) => {
    if (!literalSheetTitle(tab)) { setError("Enter a literal tab name. For expressions, use the Range field."); return; }
    setError("");
    onDraftChange({ kind: "sheets", baseline: sheetsBaseline(workspaceId, config), tab, headers: null, mappedValues: null });
  };
  const loadHeaders = async () => {
    if (!draft || stale || !canDiscover) return;
    const active = request();
    const requestedScope = scope;
    const requestedDraft = draft;
    setError(""); setLoading("headers");
    try {
      const params = new URLSearchParams({ spreadsheetId, sheet: requestedDraft.tab });
      const response = await apiRequest<{ headers: SheetHeader[]; columnLimit: number }>(`${endpoint}/headers?${params}`, { signal: active.signal });
      const current = draftRef.current;
      if (!active.signal.aborted && scopeRef.current === requestedScope && current && current.baseline === requestedDraft.baseline && current.tab === requestedDraft.tab && current.mappedValues === null) onDraftChange({ ...current, headers: response.headers });
    } catch (reason) {
      if (!active.signal.aborted && scopeRef.current === requestedScope) setError(reason instanceof Error ? reason.message : "Headers could not be loaded. Use the range and values fields manually.");
    } finally { if (!active.signal.aborted && scopeRef.current === requestedScope) setLoading(null); }
  };
  const discard = () => { controller.current?.abort(); setLoading(null); setError(""); onDraftChange(undefined); };
  const apply = () => {
    if (!draft) return;
    try { if (!onApply(draft)) throw new Error("The configuration or another pending edit changed. Discard this preview and review the current configuration."); onDraftChange(undefined); setError(""); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not apply the mapping."); }
  };

  return <section className="config-field" aria-label="Google Sheets tab and header assistant">
    <strong>Tab and header assistant</strong>
    <small>Use the existing Range and Values fields for manual entry or expressions. This assistant changes nothing until you apply a preview.</small>
    <small>Changing the connection or spreadsheet keeps the existing range and values. Review them before writing to a different spreadsheet.</small>
    {!canDiscover && <small>Select a Google connection and a literal spreadsheet ID to discover tabs and headers. Expressions can be entered in the fields above.</small>}
    {!draft && <>
      <Button type="button" variant="secondary" disabled={!canDiscover || loading !== null} onClick={() => void loadTabs()}>{loading === "tabs" ? "Loading tabs…" : "Load tabs"}</Button>
      {tabsScope === scope && <><Field label="Sheet tab"><Select aria-label="Sheet tab" value={selectedId} onChange={(event) => setSelectedId(event.target.value)}><option value="">Select a tab</option>{tabs.map((tab) => <option key={tab.id} value={String(tab.id)}>{tab.title}</option>)}</Select></Field>{!tabs.length && <small>No tabs found. Enter a tab name or range manually.</small>}{hasMore && <small>Only the first 100 tabs are shown. Enter another tab name manually.</small>}<Button type="button" variant="ghost" disabled={!selectedId || loading !== null} onClick={() => { const tab = tabs.find((item) => String(item.id) === selectedId); if (tab) stageTab(tab.title); }}>Preview selected tab</Button></>}
      <Field label="Or enter a tab name"><input value={manualTab} onChange={(event) => setManualTab(event.target.value)} maxLength={100} placeholder="Sheet1" /></Field>
      <Button type="button" variant="ghost" disabled={!canDiscover || !manualTab.trim() || loading !== null} onClick={() => stageTab(manualTab)}>Preview entered tab</Button>
    </>}
    {draft && <>
      <small role="status">Unapplied Sheets edits block saving, publishing and running. Apply or discard this preview.</small>
      {stale && <small role="alert">The connection, spreadsheet, operation, range or values changed. Discard this preview and start again.</small>}
      <p>Current range: <code>{String(config.range ?? "(empty)")}</code><br />Proposed range: <code>{sheetRange(draft.tab, config.operation)}</code></p>
      <small>{config.operation === "read" ? "Reads all rows in columns A–CV, including the header row. Larger results may exceed the response limit; use Range for a smaller selection." : "Applying replaces the whole range with the tab starting at A1. Review it carefully; it can target different cells."}</small>
      <small>Loading headers reads the first row of this tab (up to 100 cells); that row may contain data. Headers can change later.</small>
      <Button type="button" variant="secondary" disabled={stale || !canDiscover || loading !== null || draft.mappedValues !== null} onClick={() => void loadHeaders()}>{loading === "headers" ? "Reading headers…" : draft.headers ? "Reload headers" : "Read headers"}</Button>
      {draft.headers && <><small>Only the first 100 columns are read; trailing empty cells may be omitted. Blank and duplicate names retain their positions.</small>{draft.headers.length === 0 ? <small>No headers found in the first row.</small> : <div>{draft.headers.map((header) => <div key={header.column}><strong>{columnLabel(header.column)}</strong> · {header.name || "(blank header)"}{draft.mappedValues && <Field label={`Value for column ${columnLabel(header.column)}`}><input value={draft.mappedValues[header.column - 1] ?? ""} maxLength={4000} placeholder="Value or expression" onChange={(event) => { const values = [...draft.mappedValues!]; values[header.column - 1] = event.target.value; onDraftChange({ ...draft, mappedValues: values }); }} /></Field>}</div>)}</div>}
      {config.operation === "append" && draft.headers.length > 0 && draft.mappedValues === null && <Button type="button" variant="ghost" disabled={stale} onClick={() => onDraftChange({ ...draft, mappedValues: Array.from({ length: draft.headers!.length }, () => "") })}>Prepare one append row</Button>}
      {draft.mappedValues && <><small>Applying replaces the entire existing Values matrix with this single row, including blank cells. Values can be expressions; no header row is written.</small><pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", maxHeight: "12rem", overflow: "auto" }}>{JSON.stringify([draft.mappedValues], null, 2)}</pre><Button type="button" variant="ghost" onClick={() => onDraftChange({ ...draft, mappedValues: null })}>Remove row mapping</Button></>}</>}
      {applyBlockedReason && <small role="status">{applyBlockedReason}</small>}
      <Button type="button" variant="secondary" disabled={stale || loading !== null || Boolean(applyBlockedReason)} onClick={apply}>Apply preview</Button><Button type="button" variant="ghost" onClick={discard}>Discard preview</Button>
    </>}
    {error && <small role="alert">{error}</small>}
  </section>;
}
