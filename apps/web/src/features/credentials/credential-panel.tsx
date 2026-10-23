"use client";

import { FormEvent, useEffect, useState } from "react";
import { apiRequest, apiUrl } from "../api/api-client";

type Credential = { id: string; provider: string; label: string };

export function CredentialPanel({ workspaceId, onClose }: { workspaceId: string; onClose: () => void }) {
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [provider, setProvider] = useState("GOOGLE");
  const [label, setLabel] = useState("Google manual token");
  const [data, setData] = useState('{\n  "accessToken": ""\n}');
  const [notice, setNotice] = useState("Load credentials to configure nodes without exposing values.");

  const load = async () => {
    try {
      const response = await apiRequest<{ credentials: Credential[] }>(`/workspaces/${workspaceId}/credentials`);
      setCredentials(response.credentials);
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : "Unable to load credentials.");
    }
  };

  useEffect(() => { void load(); }, [workspaceId]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      const parsed: unknown = JSON.parse(data);
      await apiRequest(`/workspaces/${workspaceId}/credentials`, { method: "POST", body: JSON.stringify({ provider, label, data: parsed }) });
      setNotice("Credential encrypted and saved. Copy its ID into the node configuration.");
      await load();
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : "Credential could not be saved.");
    }
  };

  return (
    <section className="credential-panel" aria-label="Credential manager">
      <div className="credential-panel__heading"><div><p className="section-label">CREDENTIALS</p><h2>Secure connections</h2></div><button className="icon-button" type="button" aria-label="Close credential manager" onClick={onClose}>×</button></div>
      <p>Secrets are encrypted server-side and never shown again after save.</p>
      <button className="ghost-button" type="button" onClick={() => { window.location.assign(`${apiUrl}/workspaces/${workspaceId}/credentials/google/connect`); }}>Connect Google with OAuth</button>
      <form onSubmit={submit} className="credential-form">
        <label><span>Provider</span><select value={provider} onChange={(event) => setProvider(event.target.value)}><option value="GOOGLE">Google Drive / Sheets</option><option value="STEAM">Steam</option><option value="GOOGLE_CHAT_WEBHOOK">Google Chat webhook</option><option value="HTTP">HTTP</option></select></label>
        <label><span>Label</span><input value={label} onChange={(event) => setLabel(event.target.value)} /></label>
        <label><span>Secret JSON</span><textarea value={data} onChange={(event) => setData(event.target.value)} rows={6} /></label>
        <button className="run-button" type="submit">Encrypt &amp; save</button>
      </form>
      <p className="credential-panel__notice">{notice}</p>
      <ul className="credential-list">{credentials.map((credential) => <li key={credential.id}><strong>{credential.label}</strong><span>{credential.provider}</span><code>{credential.id}</code></li>)}</ul>
    </section>
  );
}
