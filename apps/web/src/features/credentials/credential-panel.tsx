"use client";

import { FormEvent, useEffect, useState } from "react";
import { apiRequest, apiUrl } from "../api/api-client";
import type { CredentialProvider, CredentialSummary } from "./credential-types";

type CredentialPreset = {
  label: string;
  data: string;
  hint: string;
};

const credentialPresets: Record<CredentialProvider, CredentialPreset> = {
  GOOGLE: {
    label: "Google account",
    data: '{\n  "accessToken": ""\n}',
    hint: "Use OAuth for Google Drive and Sheets, or paste a short-lived access token for local testing.",
  },
  STEAM: {
    label: "Steam account",
    data: '{\n  "apiKey": "",\n  "steamId": ""\n}',
    hint: "Enter a Steam Web API key and your 64-bit Steam ID. The key is encrypted before it is stored.",
  },
  GOOGLE_CHAT_WEBHOOK: {
    label: "Google Chat incoming webhook",
    data: '{\n  "webhookUrl": ""\n}',
    hint: "Paste the incoming-webhook URL from the Google Chat space that should receive workflow messages.",
  },
  HTTP: {
    label: "HTTP authentication",
    data: '{\n  "authType": "bearer",\n  "token": ""\n}',
    hint: "Use bearer, basic, or custom-header JSON authentication for HTTP and approval-webhook nodes.",
  },
};

export function CredentialPanel({ workspaceId, onClose, onSaved }: { workspaceId: string; onClose: () => void; onSaved?: (credentials: CredentialSummary[]) => void }) {
  const [credentials, setCredentials] = useState<CredentialSummary[]>([]);
  const [provider, setProvider] = useState<CredentialProvider>("GOOGLE");
  const [label, setLabel] = useState(credentialPresets.GOOGLE.label);
  const [data, setData] = useState(credentialPresets.GOOGLE.data);
  const [notice, setNotice] = useState("Load credentials to configure nodes without exposing values.");
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const load = async () => {
    try {
      const response = await apiRequest<{ credentials: CredentialSummary[] }>(`/workspaces/${workspaceId}/credentials`);
      setCredentials(response.credentials);
      onSaved?.(response.credentials);
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : "Unable to load credentials.");
    }
  };

  useEffect(() => { void load(); }, [workspaceId]);

  const changeProvider = (nextProvider: CredentialProvider) => {
    const preset = credentialPresets[nextProvider];
    setProvider(nextProvider);
    setLabel(preset.label);
    setData(preset.data);
    setJsonError(null);
    setNotice(`${nextProvider === "GOOGLE" ? "Google" : nextProvider === "STEAM" ? "Steam" : nextProvider === "GOOGLE_CHAT_WEBHOOK" ? "Google Chat" : "HTTP"} credential template loaded.`);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSaving) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(data);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Secret JSON must be an object.");
      setJsonError(null);
    } catch (reason) {
      setJsonError(reason instanceof Error ? reason.message : "Secret JSON is invalid.");
      return;
    }
    setIsSaving(true);
    try {
      await apiRequest(`/workspaces/${workspaceId}/credentials`, { method: "POST", body: JSON.stringify({ provider, label, data: parsed }) });
      setNotice("Credential encrypted and saved. Select it from a compatible node in the editor.");
      await load();
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : "Credential could not be saved.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section className="credential-panel" aria-label="Credential manager">
      <div className="credential-panel__heading"><div><p className="section-label">CREDENTIALS</p><h2>Secure connections</h2></div><button className="icon-button" type="button" aria-label="Close credential manager" onClick={onClose}>×</button></div>
      <p>Secrets are encrypted server-side and never shown again after save.</p>
      {provider === "GOOGLE" ? <button className="ghost-button credential-panel__oauth" type="button" onClick={() => { window.location.assign(`${apiUrl}/workspaces/${workspaceId}/credentials/google/connect`); }}>Connect Google with OAuth</button> : null}
      <form onSubmit={submit} className="credential-form">
        <label><span>Provider</span><select aria-label="Provider" value={provider} onChange={(event) => changeProvider(event.target.value as CredentialProvider)}><option value="GOOGLE">Google Drive / Sheets</option><option value="STEAM">Steam</option><option value="GOOGLE_CHAT_WEBHOOK">Google Chat webhook</option><option value="HTTP">HTTP</option></select></label>
        <p className="credential-form__hint" aria-live="polite">{credentialPresets[provider].hint}</p>
        <label><span>Connection name</span><input aria-label="Connection name" value={label} onChange={(event) => setLabel(event.target.value)} /></label>
        <label><span>Secret JSON</span><textarea aria-label="Secret JSON" aria-invalid={jsonError ? "true" : undefined} value={data} onChange={(event) => { setData(event.target.value); setJsonError(null); }} rows={provider === "STEAM" ? 7 : 6} spellCheck={false} /></label>
        {jsonError && <p className="credential-form__error" role="alert">{jsonError}</p>}
        <button className="run-button" type="submit" disabled={isSaving}>{isSaving ? "Encrypting…" : "Encrypt & save"}</button>
      </form>
      <p className="credential-panel__notice">{notice}</p>
      <ul className="credential-list">{credentials.map((credential) => <li key={credential.id}><strong>{credential.label}</strong><span>{credential.provider}</span><code>{credential.id}</code></li>)}</ul>
    </section>
  );
}
