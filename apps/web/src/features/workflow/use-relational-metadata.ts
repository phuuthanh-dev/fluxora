"use client";

import { useEffect, useRef, useState } from "react";
import { apiRequest } from "../api/api-client";
import type { CredentialSummary } from "../credentials/credential-types";
import type { RelationalMetadata, RelationalProvider } from "./relational-selection";

/** Advisory metadata is scoped to the current workspace, connection and table. */
export function useRelationalMetadata({ provider, workspaceId, workflowId, nodeId, owner, credentialId, table, schema, credentials }: {
  provider: RelationalProvider; workspaceId: string; workflowId: string; nodeId: string; owner: boolean;
  credentialId: string; table: string; schema: string; credentials: CredentialSummary[];
}) {
  const validIdentifier = /^[A-Za-z_][A-Za-z0-9_$]{0,62}$/;
  const credential = credentials.find((item) => item.id === credentialId && item.provider === (provider === "postgres" ? "POSTGRES" : "SUPABASE"));
  const eligible = owner && Boolean(workspaceId && workflowId && credentialId && credential && validIdentifier.test(table) && (provider !== "postgres" || validIdentifier.test(schema)));
  const resourceKey = JSON.stringify([workspaceId, workflowId, nodeId, provider, credentialId, credential?.updatedAt, schema, table, eligible]);
  const generation = useRef({ resourceKey: "", value: 0 });
  if (generation.current.resourceKey !== resourceKey) generation.current = { resourceKey, value: generation.current.value + 1 };
  const metadataKey = JSON.stringify([resourceKey, generation.current.value]);
  const [state, setState] = useState<{ key: string; metadata: RelationalMetadata }>({ key: "", metadata: { status: "unavailable" } });
  useEffect(() => {
    if (!eligible) return;
    let current = true;
    const controller = new AbortController();
    const params = new URLSearchParams({ table });
    if (provider === "postgres") params.set("schema", schema);
    const base = `/workspaces/${encodeURIComponent(workspaceId)}/credentials/${encodeURIComponent(credentialId)}`;
    void apiRequest<{ columns?: Array<{ name?: unknown; type?: unknown }>; partial?: boolean; hasMore?: boolean }>(`${base}/${provider}/columns?${params}`, { signal: controller.signal })
      .then((response) => {
        if (!current) return;
        if (!Array.isArray(response.columns)) { setState({ key: metadataKey, metadata: { status: "unavailable" } }); return; }
        const columns = response.columns.flatMap((column) => column && typeof column.name === "string" && validIdentifier.test(column.name) ? [{ value: column.name, label: typeof column.type === "string" && column.type ? `${column.name} · ${column.type}` : column.name }] : []);
        setState({ key: metadataKey, metadata: { status: "available", columns, partial: provider === "postgres" || response.partial === true || response.hasMore === true || columns.length !== response.columns.length } });
      }).catch(() => { if (current) setState({ key: metadataKey, metadata: { status: "unavailable" } }); });
    return () => { current = false; controller.abort(); };
  }, [metadataKey, eligible, workspaceId, credentialId, table, schema, provider]);
  const metadata: RelationalMetadata = eligible && state.key === metadataKey ? state.metadata : { status: "unavailable" };
  return { metadata, loading: eligible && state.key !== metadataKey, eligible };
}
