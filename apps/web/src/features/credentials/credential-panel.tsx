"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { LockKeyhole } from "lucide-react";
import { ApiClientError, apiRequest, apiUrl } from "../api/api-client";
import type { CredentialProvider, CredentialReferenceDetails, CredentialSummary } from "./credential-types";
import { Button, Field, IconButton, Select, Status, useDialogFocus } from "../../components/ui";

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
  GITHUB: {
    label: "GitHub connector",
    data: '{\n  "token": ""\n}',
    hint: "Enter a GitHub token for workflow actions. This connector credential is separate from GitHub account sign-in.",
  },
};

type ActiveAction = { credentialId: string; type: "rename" | "rotate" | "delete" };

function requestErrorMessage(reason: unknown, fallback: string) {
  if (reason instanceof TypeError && /failed to fetch/i.test(reason.message)) {
    return `Unable to reach the API at ${apiUrl}. Start the API server and try again.`;
  }
  return reason instanceof Error ? reason.message : fallback;
}

type CredentialManagerProps = {
  workspaceId: string;
  onClose?: () => void;
  onSaved?: (credentials: CredentialSummary[]) => void;
  presentation?: "panel" | "page";
};

export function CredentialManager({ workspaceId, onClose, onSaved, presentation = "panel" }: CredentialManagerProps) {
  const panelRef = useDialogFocus<HTMLElement>({
    active: presentation === "panel",
    trapFocus: false,
    onClose,
  });
  const [credentials, setCredentials] = useState<CredentialSummary[]>([]);
  const [provider, setProvider] = useState<CredentialProvider>("GOOGLE");
  const [label, setLabel] = useState(credentialPresets.GOOGLE.label);
  const [data, setData] = useState(credentialPresets.GOOGLE.data);
  const [notice, setNotice] = useState("Encrypted server-side. Node runs never expose your secret values.");
  const [createError, setCreateError] = useState<string | null>(null);
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Card action state
  const [activeAction, setActiveAction] = useState<ActiveAction | null>(null);
  const [actionLabel, setActionLabel] = useState("");
  const [actionData, setActionData] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [blockerDetails, setBlockerDetails] = useState<CredentialReferenceDetails | null>(null);
  const [isLoadingReferences, setIsLoadingReferences] = useState(false);
  const [isActionSubmitting, setIsActionSubmitting] = useState(false);
  const referenceRequestRef = useRef(0);

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
      GITHUB: "GitHub",
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
    referenceRequestRef.current += 1;
    setActiveAction(null);
    setActionLabel("");
    setActionData("");
    setActionError(null);
    setBlockerDetails(null);
    setIsLoadingReferences(false);
  };

  const loadReferences = async (cred: CredentialSummary) => {
    const requestId = ++referenceRequestRef.current;
    setIsLoadingReferences(true);
    try {
      const response = await apiRequest<{ references: CredentialReferenceDetails }>(`/workspaces/${workspaceId}/credentials/${cred.id}/references`);
      if (requestId === referenceRequestRef.current) setBlockerDetails(response.references);
    } catch (reason) {
      if (requestId === referenceRequestRef.current) setActionError(requestErrorMessage(reason, "Credential usage could not be loaded."));
    } finally {
      if (requestId === referenceRequestRef.current) setIsLoadingReferences(false);
    }
  };

  const startRename = (cred: CredentialSummary) => {
    setActiveAction({ credentialId: cred.id, type: "rename" });
    setActionLabel(cred.label);
    setActionError(null);
    setBlockerDetails(null);
    void loadReferences(cred);
  };

  const startRotate = (cred: CredentialSummary) => {
    setActiveAction({ credentialId: cred.id, type: "rotate" });
    setActionData(credentialPresets[cred.provider]?.data ?? '{\n  ""\n}');
    setActionError(null);
    setBlockerDetails(null);
    void loadReferences(cred);
  };

  const startDelete = (cred: CredentialSummary) => {
    setActiveAction({ credentialId: cred.id, type: "delete" });
    setActionError(null);
    setBlockerDetails(null);
    void loadReferences(cred);
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
      parsed = JSON.parse(actionData);
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
    cred.isManaged ?? (cred.provider === "GOOGLE" && cred.label === "Google OAuth");

  return (
    <section
      ref={panelRef}
      className={`credential-panel credential-panel--${presentation}`}
      aria-label="Credential manager"
      role={presentation === "panel" ? "dialog" : "region"}
      aria-modal={presentation === "panel" ? false : undefined}
      tabIndex={presentation === "panel" ? -1 : undefined}
    >
      <div className="credential-panel__heading">
        <div>
          <p className="section-label">CREDENTIALS</p>
          <h2>Secure connections</h2>
        </div>
        {onClose ? <IconButton className="icon-button" label="Close credential manager" onClick={onClose}>×</IconButton> : null}
      </div>
      <p>Secrets are encrypted server-side and never shown again after save.</p>
      {presentation === "panel" ? (
        <Button variant="ghost" className="credential-panel__directory-link" onClick={() => window.open(`/dashboard/connections?workspace=${encodeURIComponent(workspaceId)}`, "_blank", "noopener,noreferrer")}>
          Open full connection center
        </Button>
      ) : null}
      {provider === "GOOGLE" ? (
        <Button variant="ghost" className="ghost-button credential-panel__oauth" onClick={() => { window.location.assign(`${apiUrl}/workspaces/${workspaceId}/credentials/google/connect`); }}>
          Connect Google with OAuth
        </Button>
      ) : null}
      <form onSubmit={submit} className="credential-form">
        <Field label="Provider" className="credential-form__field">
          <Select aria-label="Provider" value={provider} onChange={(event) => changeProvider(event.target.value as CredentialProvider)}>
            <option value="GOOGLE">Google Drive / Sheets</option>
            <option value="STEAM">Steam</option>
            <option value="GOOGLE_CHAT_WEBHOOK">Google Chat webhook</option>
            <option value="DISCORD_WEBHOOK">Discord webhook</option>
            <option value="TELEGRAM_BOT">Telegram bot</option>
            <option value="GITHUB">GitHub connector</option>
            <option value="HTTP">HTTP</option>
          </Select>
        </Field>
        <p className="credential-form__hint" aria-live="polite">{credentialPresets[provider].hint}</p>
        <Field label="Connection name" className="credential-form__field">
          <input aria-label="Connection name" value={label} onChange={(event) => { setLabel(event.target.value); setCreateError(null); }} />
        </Field>
        <Field label="Secret JSON" className="credential-form__field">
          <textarea aria-label="Secret JSON" aria-invalid={jsonError ? "true" : undefined} value={data} onChange={(event) => { setData(event.target.value); setJsonError(null); setCreateError(null); }} rows={provider === "STEAM" ? 7 : 6} spellCheck={false} />
        </Field>
        {jsonError && <p className="credential-form__error" role="alert">{jsonError}</p>}
        {createError && <p className="credential-form__error" role="alert">{createError}</p>}
        <Button variant="primary" className="run-button" type="submit" disabled={isSaving}>{isSaving ? "Encrypting…" : "Encrypt & save"}</Button>
      </form>
      <Status tone="info" className="credential-panel__notice" aria-live="polite">
        <span className="credential-panel__notice-icon"><LockKeyhole size={15} aria-hidden="true" /></span>
        <span className="credential-panel__notice-copy">{notice}</span>
      </Status>
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
                {isGoogleOAuth(credential) ? (
                  <div className="credential-card__oauth-managed">
                    <p className="credential-card__oauth-text">
                      Managed by Google OAuth. Reconnect through Google sign-in to refresh or reauthorize permissions.
                    </p>
                      <Button
                        variant="ghost"
                      type="button"
                      className="ghost-button credential-panel__oauth"
                      onClick={() => { window.location.assign(`${apiUrl}/workspaces/${workspaceId}/credentials/google/connect`); }}
                    >
                      Reconnect Google OAuth
                    </Button>
                  </div>
                ) : (
                  <div className="credential-card__actions">
                    <Button
                      variant="ghost"
                      type="button"
                      className="ghost-button"
                      aria-label={`Rename ${credential.label}`}
                      onClick={() => startRename(credential)}
                    >
                      Rename
                    </Button>
                    <Button
                      variant="ghost"
                      type="button"
                      className="ghost-button"
                      aria-label={`Rotate secret for ${credential.label}`}
                      onClick={() => startRotate(credential)}
                    >
                      Rotate secret
                    </Button>
                    <Button
                      variant="ghost"
                      type="button"
                      className="ghost-button credential-card__btn-delete"
                      aria-label={`Delete ${credential.label}`}
                      onClick={() => startDelete(credential)}
                    >
                      Delete
                    </Button>
                  </div>
                )}
              </div>

              {isRenaming && (
                <form className="credential-card__form" onSubmit={(event) => void submitRename(event, credential)}>
                  <CredentialReferenceSummary details={blockerDetails} isLoading={isLoadingReferences} />
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
                    <Button variant="primary" type="submit" className="run-button" disabled={isActionSubmitting}>
                      {isActionSubmitting ? "Saving…" : "Save name"}
                    </Button>
                    <Button variant="ghost" type="button" className="ghost-button" onClick={cancelAction} disabled={isActionSubmitting}>
                      Cancel
                    </Button>
                  </div>
                </form>
              )}

              {isRotating && (
                <form className="credential-card__form" onSubmit={(event) => void submitRotate(event, credential)}>
                  <CredentialReferenceSummary details={blockerDetails} isLoading={isLoadingReferences} />
                  <p className="credential-card__warning">
                    {credential.provider === "TELEGRAM_BOT"
                      ? "Updating replaces only the bot token. Any legacy fallback chat ID stored with this credential will be preserved server-side until destinations are migrated to workflow nodes."
                      : "Existing secret values cannot be displayed for security. Enter a complete replacement JSON payload."}
                  </p>
                  <label>
                    <span>Replacement secret JSON</span>
                    <textarea
                      aria-label="Replacement secret JSON"
                      value={actionData}
                      onChange={(event) => { setActionData(event.target.value); setActionError(null); }}
                      rows={credential.provider === "STEAM" ? 7 : 5}
                      spellCheck={false}
                      autoFocus
                    />
                  </label>
                  {actionError && <p className="credential-card__error" role="alert">{actionError}</p>}
                  <div className="credential-card__form-actions">
                    <Button variant="primary" type="submit" className="run-button" disabled={isActionSubmitting}>
                      {isActionSubmitting ? "Rotating…" : "Rotate secret"}
                    </Button>
                    <Button variant="ghost" type="button" className="ghost-button" onClick={cancelAction} disabled={isActionSubmitting}>
                      Cancel
                    </Button>
                  </div>
                </form>
              )}

              {isDeleting && (
                <div className="credential-card__form">
                  <CredentialReferenceSummary details={blockerDetails} isLoading={isLoadingReferences} />
                  <p className="credential-card__warning">
                    Are you sure you want to delete <strong>{credential.label}</strong>? This action cannot be undone.
                  </p>
                  {actionError && (
                    <div className="credential-card__error" role="alert">
                      <p>{actionError}</p>
                    </div>
                  )}
                  <div className="credential-card__form-actions">
                    <Button
                      variant="danger"
                      type="button"
                      className="danger-button"
                      onClick={() => void confirmDelete(credential)}
                      disabled={isActionSubmitting}
                    >
                      {isActionSubmitting ? "Deleting…" : "Confirm delete"}
                    </Button>
                    <Button variant="ghost" type="button" className="ghost-button" onClick={cancelAction} disabled={isActionSubmitting}>
                      Cancel
                    </Button>
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

function CredentialReferenceSummary({ details, isLoading }: { details: CredentialReferenceDetails | null; isLoading: boolean }) {
  if (isLoading) {
    return <div className="credential-card__references" aria-live="polite">Checking where this connection is used…</div>;
  }
  if (!details) return null;

  const workflows = details.workflows ?? [];
  const executions = details.executions ?? [];
  if (workflows.length === 0 && executions.length === 0) {
    return <div className="credential-card__references credential-card__references--empty" aria-live="polite">Not used by any current workflow or active execution.</div>;
  }

  return (
    <section className="credential-card__references" aria-label="Credential usage">
      <strong>Used by</strong>
      {workflows.length > 0 ? (
        <div>
          <span className="credential-card__references-label">Current workflows</span>
          <ul>
            {workflows.map((workflow) => (
              <li key={workflow.id}>
                <span>{workflow.name}</span>
                <small>{(workflow.locations ?? ["draft"]).join(" + ")}</small>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {executions.length > 0 ? (
        <div>
          <span className="credential-card__references-label">Active executions</span>
          <ul>
            {executions.map((execution) => (
              <li key={execution.id}>
                <span>{execution.status ?? "Active"} · {execution.mode ?? "LIVE"}</span>
                <small>{execution.id}</small>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

export function CredentialPanel(props: Omit<CredentialManagerProps, "presentation"> & { onClose: () => void }) {
  return <CredentialManager {...props} presentation="panel" />;
}
