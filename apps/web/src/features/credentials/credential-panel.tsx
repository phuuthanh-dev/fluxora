"use client";

import { FormEvent, useEffect, useState } from "react";
import { ApiClientError, apiRequest, apiUrl } from "../api/api-client";
import type { CredentialProvider, CredentialReferenceDetails, CredentialSummary } from "./credential-types";

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
    hint: "Enter a Steam Web API key and your 64-bit Steam ID. A linked Steam identity can confirm the ID, but never replaces this API credential.",
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
  DISCORD_WEBHOOK: {
    label: "Discord incoming webhook",
    data: '{\n  "webhookUrl": ""\n}',
    hint: "Paste the webhook URL from your Discord channel integrations.",
  },
  TELEGRAM_BOT: {
    label: "Telegram bot",
    data: '{\n  "botToken": ""\n}',
    hint: "Enter your Telegram Bot API token from @BotFather. Destination Chat ID is configured on the Telegram message node (credential chatId is deprecated).",
  },
};

type ActiveAction = { credentialId: string; type: "rename" | "rotate" | "delete" };

function requestErrorMessage(reason: unknown, fallback: string) {
  if (reason instanceof TypeError && /failed to fetch/i.test(reason.message)) {
    return `Unable to reach the API at ${apiUrl}. Start the API server and try again.`;
  }
  return reason instanceof Error ? reason.message : fallback;
}

export function CredentialPanel({ workspaceId, onClose, onSaved }: { workspaceId: string; onClose: () => void; onSaved?: (credentials: CredentialSummary[]) => void }) {
  const [credentials, setCredentials] = useState<CredentialSummary[]>([]);
  const [provider, setProvider] = useState<CredentialProvider>("GOOGLE");
  const [label, setLabel] = useState(credentialPresets.GOOGLE.label);
  const [data, setData] = useState(credentialPresets.GOOGLE.data);
  const [notice, setNotice] = useState("Load credentials to configure nodes without exposing values.");
  const [createError, setCreateError] = useState<string | null>(null);
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Card action state
  const [activeAction, setActiveAction] = useState<ActiveAction | null>(null);
  const [actionLabel, setActionLabel] = useState("");
  const [actionData, setActionData] = useState("");
  const [actionSecret, setActionSecret] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [blockerDetails, setBlockerDetails] = useState<CredentialReferenceDetails | null>(null);
  const [isActionSubmitting, setIsActionSubmitting] = useState(false);

  const load = async () => {
    try {
      const response = await apiRequest<{ credentials: CredentialSummary[] }>(`/workspaces/${workspaceId}/credentials`);
      setCredentials(response.credentials);
      onSaved?.(response.credentials);
    } catch (reason) {
      setNotice(requestErrorMessage(reason, "Unable to load credentials."));
    }
  };

  useEffect(() => { void load(); }, [workspaceId]);

  const changeProvider = (nextProvider: CredentialProvider) => {
    const preset = credentialPresets[nextProvider];
    setProvider(nextProvider);
    setLabel(preset.label);
    setData(preset.data);
    setJsonError(null);
    setCreateError(null);
    const providerLabels: Record<CredentialProvider, string> = {
      GOOGLE: "Google",
      STEAM: "Steam",
      GOOGLE_CHAT_WEBHOOK: "Google Chat",
      HTTP: "HTTP",
      DISCORD_WEBHOOK: "Discord",
      TELEGRAM_BOT: "Telegram",
    };
    setNotice(`${providerLabels[nextProvider] ?? nextProvider} credential template loaded.`);
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
    setCreateError(null);
    try {
      await apiRequest(`/workspaces/${workspaceId}/credentials`, { method: "POST", body: JSON.stringify({ provider, label, data: parsed }) });
      setNotice("Credential encrypted and saved. Select it from a compatible node in the editor.");
      setCreateError(null);
      const preset = credentialPresets[provider];
      setLabel(preset.label);
      setData(preset.data);
      await load();
    } catch (reason) {
      setCreateError(requestErrorMessage(reason, "Credential could not be saved."));
    } finally {
      setIsSaving(false);
    }
  };

  const cancelAction = () => {
    setActiveAction(null);
    setActionLabel("");
    setActionData("");
    setActionSecret("");
    setActionError(null);
    setBlockerDetails(null);
  };

  const startRename = (cred: CredentialSummary) => {
    setActiveAction({ credentialId: cred.id, type: "rename" });
    setActionLabel(cred.label);
    setActionError(null);
    setBlockerDetails(null);
  };

  const startRotate = (cred: CredentialSummary) => {
    setActiveAction({ credentialId: cred.id, type: "rotate" });
    setActionData(cred.provider === "TELEGRAM_BOT" ? "" : (credentialPresets[cred.provider]?.data ?? '{\n  ""\n}'));
    setActionSecret("");
    setActionError(null);
    setBlockerDetails(null);
  };

  const startDelete = (cred: CredentialSummary) => {
    setActiveAction({ credentialId: cred.id, type: "delete" });
    setActionError(null);
    setBlockerDetails(null);
  };

  const submitRename = async (event: FormEvent, cred: CredentialSummary) => {
    event.preventDefault();
    if (isActionSubmitting) return;
    const trimmed = actionLabel.trim();
    if (!trimmed) {
      setActionError("Credential label must not be empty.");
      return;
    }
    setIsActionSubmitting(true);
    setActionError(null);
    try {
      await apiRequest(`/workspaces/${workspaceId}/credentials/${cred.id}`, {
        method: "PATCH",
        body: JSON.stringify({ label: trimmed }),
      });
      setNotice(`Credential renamed to "${trimmed}". Node bindings preserved.`);
      cancelAction();
      await load();
    } catch (reason) {
      setActionError(requestErrorMessage(reason, "Credential could not be renamed."));
    } finally {
      setIsActionSubmitting(false);
    }
  };

  const submitRotate = async (event: FormEvent, cred: CredentialSummary) => {
    event.preventDefault();
    if (isActionSubmitting) return;
    let parsed: unknown;
    try {
      if (cred.provider === "TELEGRAM_BOT") {
        if (!actionSecret.trim()) throw new Error("Telegram bot token is required.");
        parsed = { botToken: actionSecret.trim() };
      } else {
        parsed = JSON.parse(actionData);
      }
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Secret JSON must be an object.");
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : "Secret JSON is invalid.");
      return;
    }
    setIsActionSubmitting(true);
    setActionError(null);
    try {
      await apiRequest(`/workspaces/${workspaceId}/credentials/${cred.id}`, {
        method: "PATCH",
        body: JSON.stringify({ data: parsed }),
      });
      setNotice(`Secret rotated for "${cred.label}". Node bindings preserved.`);
      cancelAction();
      await load();
    } catch (reason) {
      setActionError(requestErrorMessage(reason, "Secret could not be rotated."));
    } finally {
      setIsActionSubmitting(false);
    }
  };

  const confirmDelete = async (cred: CredentialSummary) => {
    if (isActionSubmitting) return;
    setIsActionSubmitting(true);
    setActionError(null);
    setBlockerDetails(null);
    try {
      await apiRequest(`/workspaces/${workspaceId}/credentials/${cred.id}`, { method: "DELETE" });
      setNotice(`Credential "${cred.label}" deleted.`);
      cancelAction();
      await load();
    } catch (reason) {
      setActionError(requestErrorMessage(reason, "Credential could not be deleted."));
      if (reason instanceof ApiClientError && reason.code === "CREDENTIAL_IN_USE") {
        setBlockerDetails((reason.details as CredentialReferenceDetails) ?? null);
      }
    } finally {
      setIsActionSubmitting(false);
    }
  };

  const isGoogleOAuth = (cred: CredentialSummary) =>
    cred.provider === "GOOGLE" && cred.label.toLowerCase().includes("oauth");

  return (
    <section className="credential-panel" aria-label="Credential manager">
      <div className="credential-panel__heading">
        <div>
          <p className="section-label">CREDENTIALS</p>
          <h2>Secure connections</h2>
        </div>
        <button className="icon-button" type="button" aria-label="Close credential manager" onClick={onClose}>×</button>
      </div>
      <p>Secrets are encrypted server-side and never shown again after save.</p>
      {provider === "GOOGLE" ? (
        <button className="ghost-button credential-panel__oauth" type="button" onClick={() => { window.location.assign(`${apiUrl}/workspaces/${workspaceId}/credentials/google/connect`); }}>
          Connect Google with OAuth
        </button>
      ) : null}
      <form onSubmit={submit} className="credential-form">
        <label>
          <span>Provider</span>
          <select aria-label="Provider" value={provider} onChange={(event) => changeProvider(event.target.value as CredentialProvider)}>
            <option value="GOOGLE">Google Drive / Sheets</option>
            <option value="STEAM">Steam</option>
            <option value="GOOGLE_CHAT_WEBHOOK">Google Chat webhook</option>
            <option value="DISCORD_WEBHOOK">Discord webhook</option>
            <option value="TELEGRAM_BOT">Telegram bot</option>
            <option value="HTTP">HTTP</option>
          </select>
        </label>
        <p className="credential-form__hint" aria-live="polite">{credentialPresets[provider].hint}</p>
        <label>
          <span>Connection name</span>
          <input aria-label="Connection name" value={label} onChange={(event) => { setLabel(event.target.value); setCreateError(null); }} />
        </label>
        <label>
          <span>Secret JSON</span>
          <textarea aria-label="Secret JSON" aria-invalid={jsonError ? "true" : undefined} value={data} onChange={(event) => { setData(event.target.value); setJsonError(null); setCreateError(null); }} rows={provider === "STEAM" ? 7 : 6} spellCheck={false} />
        </label>
        {jsonError && <p className="credential-form__error" role="alert">{jsonError}</p>}
        {createError && <p className="credential-form__error" role="alert">{createError}</p>}
        <button className="run-button" type="submit" disabled={isSaving}>{isSaving ? "Encrypting…" : "Encrypt & save"}</button>
      </form>
      <p className="credential-panel__notice">{notice}</p>
      <ul className="credential-list">
        {credentials.map((credential) => {
          const isRenaming = activeAction?.credentialId === credential.id && activeAction.type === "rename";
          const isRotating = activeAction?.credentialId === credential.id && activeAction.type === "rotate";
          const isDeleting = activeAction?.credentialId === credential.id && activeAction.type === "delete";

          return (
            <li key={credential.id} className="credential-card" data-credential-id={credential.id}>
              <div className="credential-card__header">
                <div className="credential-card__info">
                  <strong>{credential.label}</strong>
                  <span>{credential.provider}</span>
                  <code>{credential.id}</code>
                </div>
                <div className="credential-card__actions">
                  <button
                    type="button"
                    className="ghost-button"
                    aria-label={`Rename ${credential.label}`}
                    onClick={() => startRename(credential)}
                  >
                    Rename
                  </button>
                  <button
                    type="button"
                    className="ghost-button"
                    aria-label={`Rotate secret for ${credential.label}`}
                    onClick={() => startRotate(credential)}
                  >
                    Rotate secret
                  </button>
                  <button
                    type="button"
                    className="ghost-button credential-card__btn-delete"
                    aria-label={`Delete ${credential.label}`}
                    onClick={() => startDelete(credential)}
                  >
                    Delete
                  </button>
                </div>
              </div>

              {isRenaming && (
                <form className="credential-card__form" onSubmit={(event) => void submitRename(event, credential)}>
                  <label>
                    <span>New connection name</span>
                    <input
                      aria-label="New connection name"
                      value={actionLabel}
                      onChange={(event) => { setActionLabel(event.target.value); setActionError(null); }}
                      autoFocus
                    />
                  </label>
                  {actionError && <p className="credential-card__error" role="alert">{actionError}</p>}
                  <div className="credential-card__form-actions">
                    <button type="submit" className="run-button" disabled={isActionSubmitting}>
                      {isActionSubmitting ? "Saving…" : "Save name"}
                    </button>
                    <button type="button" className="ghost-button" onClick={cancelAction} disabled={isActionSubmitting}>
                      Cancel
                    </button>
                  </div>
                </form>
              )}

              {isRotating && (
                isGoogleOAuth(credential) ? (
                  <div className="credential-card__form">
                    <p className="credential-card__warning">
                      Google OAuth credentials cannot be rotated with raw secrets. Reconnect through Google OAuth to refresh access.
                    </p>
                    <div className="credential-card__form-actions">
                      <button
                        type="button"
                        className="ghost-button credential-panel__oauth"
                        onClick={() => { window.location.assign(`${apiUrl}/workspaces/${workspaceId}/credentials/google/connect`); }}
                      >
                        Reconnect Google OAuth
                      </button>
                      <button type="button" className="ghost-button" onClick={cancelAction}>
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <form className="credential-card__form" onSubmit={(event) => void submitRotate(event, credential)}>
                    <p className="credential-card__warning">
                      Existing secret values cannot be displayed for security. Enter a complete replacement secret.
                    </p>
                    {credential.provider === "TELEGRAM_BOT" ? (
                      <label>
                        <span>New Telegram bot token</span>
                        <input
                          aria-label="New Telegram bot token"
                          type="password"
                          autoComplete="new-password"
                          value={actionSecret}
                          onChange={(event) => { setActionSecret(event.target.value); setActionError(null); }}
                          placeholder="Paste the token from @BotFather"
                          autoFocus
                        />
                      </label>
                    ) : (
                      <label>
                        <span>Replacement secret JSON</span>
                        <textarea
                          aria-label="Replacement secret JSON"
                          value={actionData}
                          onChange={(event) => { setActionData(event.target.value); setActionError(null); }}
                          rows={5}
                          spellCheck={false}
                          autoFocus
                        />
                      </label>
                    )}
                    {actionError && <p className="credential-card__error" role="alert">{actionError}</p>}
                    <div className="credential-card__form-actions">
                      <button type="submit" className="run-button" disabled={isActionSubmitting}>
                        {isActionSubmitting ? "Rotating…" : "Rotate secret"}
                      </button>
                      <button type="button" className="ghost-button" onClick={cancelAction} disabled={isActionSubmitting}>
                        Cancel
                      </button>
                    </div>
                  </form>
                )
              )}

              {isDeleting && (
                <div className="credential-card__form">
                  <p className="credential-card__warning">
                    Are you sure you want to delete <strong>{credential.label}</strong>? This action cannot be undone.
                  </p>
                  {actionError && (
                    <div className="credential-card__error" role="alert">
                      <p>{actionError}</p>
                      {blockerDetails?.workflows && blockerDetails.workflows.length > 0 && (
                        <p className="credential-card__blocker-list">
                          Referenced in workflow: {blockerDetails.workflows.map((wf) => `${wf.name} (${wf.id})`).join(", ")}
                        </p>
                      )}
                      {blockerDetails?.executions && blockerDetails.executions.length > 0 && (
                        <p className="credential-card__blocker-list">
                          Referenced in active execution: {blockerDetails.executions.map((e) => e.id).join(", ")}
                        </p>
                      )}
                    </div>
                  )}
                  <div className="credential-card__form-actions">
                    <button
                      type="button"
                      className="danger-button"
                      onClick={() => void confirmDelete(credential)}
                      disabled={isActionSubmitting}
                    >
                      {isActionSubmitting ? "Deleting…" : "Confirm delete"}
                    </button>
                    <button type="button" className="ghost-button" onClick={cancelAction} disabled={isActionSubmitting}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
