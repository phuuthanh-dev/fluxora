"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { ArrowUpRight, Check, ChevronDown, ChevronRight, ChevronUp, KeyRound, LockKeyhole, MoreVertical, Plus, Search } from "lucide-react";
import { ApiClientError, apiRequest, apiUrl } from "../api/api-client";
import type { CredentialProvider, CredentialReferenceDetails, CredentialSummary, GmailCapability } from "./credential-types";
import { Button, Dialog, DialogHeader, EmptyState, Field, IconButton, Menu, Select, Skeleton, Status, useDialogFocus } from "../../components/ui";

import { Collapse, Disclosure } from "../../components/ui/disclosure";
import "./credentials.css";
import { CredentialSecretFields } from "./credential-secret-fields";
import { NodeIcon, type NodeIconName } from "../workflow/node-icon";

const providerIcons: Record<CredentialProvider, NodeIconName> = { AIRTABLE: "airtable", GOOGLE: "google", STEAM: "steam", RIOT: "riot-games", GOOGLE_CHAT_WEBHOOK: "google-chat", GOOGLE_CHAT_OAUTH: "google-chat", GMAIL: "gmail", GOOGLE_CALENDAR: "google-calendar", MONGODB: "mongodb", NOTION: "notion", TRELLO: "trello", SENTRY: "sentry", VERCEL: "vercel", SUPABASE: "supabase", REDDIT: "reddit", POSTGRES: "postgres", HTTP: "http", DISCORD_WEBHOOK: "discord", SLACK_WEBHOOK: "slack", SLACK_OAUTH: "slack", TELEGRAM_BOT: "telegram", JIRA: "jira", GITLAB: "gitlab", GITHUB: "github", SMTP: "email", GEMINI: "gemini", OPENAI: "openai" };

type CredentialPreset = {
  label: string;
  data: string;
  hint: string;
};

const credentialPresets: Record<CredentialProvider, CredentialPreset> = {
  AIRTABLE: { label: "Airtable", data: "{}", hint: "Connect your own Airtable account and select the bases Fluxora can access." },
  RIOT: { label: "Riot API", data: '{\n  "apiKey": ""\n}', hint: "Use your own Riot API key for its approved product. Development keys expire after 24 hours; personal keys are not for public products." },
  GOOGLE_CALENDAR: { label: "Google Calendar manual token", data: '{\n  "accessToken": ""\n}', hint: "Connect Google Calendar separately. Calendar events can appear in execution history." },
  GMAIL: { label: "Gmail manual token", data: '{\n  "accessToken": ""\n}', hint: "Connect Gmail separately from Google sign-in and Drive. Reading requires Gmail access." },
  NOTION: { label: "Notion", data: '{\n  "token": ""\n}', hint: "Use your own Notion token. For an integration token, share the pages with that integration; a personal access token uses your own access." },
  TRELLO: { label: "Trello", data: '{\n  "apiKey": "",\n  "token": ""\n}', hint: "Enter a Trello API key and user token with board read and write access." },
  SENTRY: { label: "Sentry", data: '{\n  "token": "",\n  "region": "global"\n}', hint: "Use a Sentry token with organization and issue read permissions. Issue titles may appear in execution history." },
  VERCEL: { label: "Vercel", data: '{\n  "token": ""\n}', hint: "Use your own Vercel access token. This connection reads projects and deployments available to that token." },
  REDDIT: { label: "Reddit", data: '{\n  "clientId": "",\n  "clientSecret": "",\n  "username": ""\n}', hint: "Use an approved Reddit application. This connection reads public posts using app-only access." },
  SUPABASE: { label: "Supabase", data: '{\n  "projectRef": "",\n  "apiKey": "",\n  "managementToken": ""\n}', hint: "Connect to the Supabase Cloud Data API. Secret keys bypass Row Level Security; rows may appear in execution history." },
  POSTGRES: { label: "PostgreSQL", data: '{\n  "host": "",\n  "port": 5432,\n  "database": "",\n  "username": "",\n  "password": ""\n}', hint: "Connect to a public PostgreSQL host using a trusted TLS certificate. Private networks are not currently supported." },
  MONGODB: { label: "MongoDB", data: '{\n  "host": "",\n  "port": 27017,\n  "username": "",\n  "password": "",\n  "authDatabase": "admin"\n}', hint: "Connect to a public TLS-enabled MongoDB server or SRV cluster using fields or a connection string." },
  GOOGLE_CHAT_OAUTH: { label: "Google Chat manual token", data: '{\n  "accessToken": ""\n}', hint: "Connect Google Chat separately from Drive and Sheets. Manual access tokens are short-lived." },
  OPENAI: {
    label: "OpenAI API",
    data: '{\n  "apiKey": ""\n}',
    hint: "Enter your OpenAI API key. API usage may incur charges on your OpenAI account.",
  },
  GEMINI: {
    label: "Gemini API",
    data: '{\n  "apiKey": ""\n}',
    hint: "Enter your Gemini API key. This connection is separate from Google account sign-in.",
  },
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
  SLACK_WEBHOOK: { label: "Slack incoming webhook", data: '{\n  "webhookUrl": ""\n}', hint: "Paste a Slack incoming webhook URL. The webhook posts to the channel selected in Slack." },
  SLACK_OAUTH: { label: "Slack workspace", data: "{}", hint: "Connect your Slack workspace to choose a channel when sending a message." },
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
  JIRA: { label: "Jira", data: "{}", hint: "Connect your own Jira Cloud site using Atlassian OAuth." },
  GITLAB: { label: "GitLab", data: '{\n  "token": ""\n}', hint: "Use your own gitlab.com personal access token. read_api permits reads; api is required for writes. Webhook authentication is configured separately." },
  GITHUB: {
    label: "GitHub connector",
    data: '{\n  "token": ""\n}',
    hint: "Enter a GitHub token for workflow actions and repository discovery. GitHub webhook registrations use their own signing secret. This connection is separate from GitHub account sign-in.",
  },
  SMTP: {
    label: "SMTP email",
    data: '{\n  "host": "smtp.example.com",\n  "port": 587,\n  "username": "",\n  "password": "",\n  "from": ""\n}',
    hint: "Use an SMTP submission host with port 587 (required STARTTLS) or 465 (TLS). Port 25 and self-signed certificates are not supported.",
  },
};

type ProviderOption = { value: CredentialProvider | "EMAIL"; label: string; keywords?: string };
const providerGroups: { label: string; options: ProviderOption[] }[] = [
  { label: "Communication", options: [{ value: "EMAIL", label: "Email", keywords: "gmail smtp" }, { value: "GOOGLE_CHAT_OAUTH", label: "Google Chat OAuth" }, { value: "GOOGLE_CHAT_WEBHOOK", label: "Google Chat webhook" }, { value: "DISCORD_WEBHOOK", label: "Discord webhook" }, { value: "SLACK_OAUTH", label: "Slack workspace" }, { value: "SLACK_WEBHOOK", label: "Slack webhook" }, { value: "TELEGRAM_BOT", label: "Telegram bot" }] },
  { label: "Productivity", options: [{ value: "GOOGLE", label: "Google Drive / Sheets" }, { value: "GOOGLE_CALENDAR", label: "Google Calendar" }, { value: "NOTION", label: "Notion" }, { value: "AIRTABLE", label: "Airtable" }, { value: "JIRA", label: "Jira" }, { value: "TRELLO", label: "Trello" }] },
  { label: "Developer & data", options: [{ value: "GITHUB", label: "GitHub connector" }, { value: "GITLAB", label: "GitLab" }, { value: "SENTRY", label: "Sentry" }, { value: "VERCEL", label: "Vercel" }, { value: "SUPABASE", label: "Supabase" }, { value: "MONGODB", label: "MongoDB" }, { value: "POSTGRES", label: "PostgreSQL" }, { value: "HTTP", label: "HTTP" }] },
  { label: "AI", options: [{ value: "GEMINI", label: "Gemini API" }, { value: "OPENAI", label: "OpenAI API" }] },
  { label: "Social & gaming", options: [{ value: "REDDIT", label: "Reddit" }, { value: "STEAM", label: "Steam" }, { value: "RIOT", label: "Riot Games" }] },
];

type ActiveAction = { credentialId: string; type: "rename" | "rotate" | "delete" | "oauth" | "details" };

function requestErrorMessage(reason: unknown, fallback: string) {
  if (reason instanceof TypeError && /failed to fetch/i.test(reason.message)) {
    return `Unable to reach the API at ${apiUrl}. Start the API server and try again.`;
  }
  return reason instanceof Error ? reason.message : fallback;
}

function credentialProviderLabel(provider: CredentialProvider) {
  const labels: Record<CredentialProvider, string> = {
    AIRTABLE: "Airtable",
    GOOGLE: "Google",
    STEAM: "Steam",
    RIOT: "Riot Games",
    GOOGLE_CHAT_WEBHOOK: "Google Chat webhook",
    HTTP: "HTTP authentication",
    DISCORD_WEBHOOK: "Discord webhook",
    SLACK_WEBHOOK: "Slack webhook",
    SLACK_OAUTH: "Slack workspace",
    TELEGRAM_BOT: "Telegram bot",
    JIRA: "Jira", GITLAB: "GitLab", GITHUB: "GitHub",
    SMTP: "SMTP email",
    GEMINI: "Gemini",
    OPENAI: "OpenAI",
    MONGODB: "MongoDB",
    NOTION: "Notion",
    TRELLO: "Trello",
    SENTRY: "Sentry",
    VERCEL: "Vercel",
    SUPABASE: "Supabase",
    REDDIT: "Reddit",
    POSTGRES: "PostgreSQL",
    GOOGLE_CHAT_OAUTH: "Google Chat OAuth",
    GMAIL: "Gmail",
    GOOGLE_CALENDAR: "Google Calendar",
  };

  return labels[provider];
}

type CredentialManagerProps = {
  workspaceId: string;
  onClose?: () => void;
  onSaved?: (credentials: CredentialSummary[]) => void;
  presentation?: "panel" | "page";
};

export function CredentialManager(props: CredentialManagerProps) {
  return <WorkspaceCredentials key={props.workspaceId} {...props} />;
}

function WorkspaceCredentials({ workspaceId, onClose, onSaved, presentation = "panel" }: CredentialManagerProps) {
  const panelRef = useDialogFocus<HTMLElement>({
    active: presentation === "panel",
    trapFocus: false,
    onClose,
  });
  const [credentials, setCredentials] = useState<CredentialSummary[]>([]);
  const formRef = useRef<HTMLFormElement>(null);
  const providerPickerRef = useRef<HTMLDetailsElement>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [methodFilter, setMethodFilter] = useState<"all" | "oauth" | "manual">("all");
  const [providerQuery, setProviderQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const initializedRef = useRef(false);
  const mountedRef = useRef(true);
  const loadRequestRef = useRef(0);
  const [provider, setProvider] = useState<CredentialProvider>("GOOGLE");
  const [label, setLabel] = useState(credentialPresets.GOOGLE.label);
  const [data, setData] = useState(credentialPresets.GOOGLE.data);
  const [notice, setNotice] = useState("");
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
    const request = ++loadRequestRef.current;
    setLoading(true);
    setLoadError(null);
    try {
      const response = await apiRequest<{ credentials: CredentialSummary[] }>(`/workspaces/${workspaceId}/credentials`);
      if (!mountedRef.current || request !== loadRequestRef.current) return;
      setCredentials(response.credentials);
      if (!initializedRef.current) {
        setCreateOpen(presentation === "panel" || response.credentials.length === 0);
        initializedRef.current = true;
      }
      onSaved?.(response.credentials);
    } catch (reason) {
      if (mountedRef.current && request === loadRequestRef.current) setLoadError(requestErrorMessage(reason, "Unable to load credentials."));
    } finally {
      if (mountedRef.current && request === loadRequestRef.current) setLoading(false);
    }
  };

  useEffect(() => {
    mountedRef.current = true;
    void load();
    return () => { mountedRef.current = false; loadRequestRef.current += 1; };
  }, [workspaceId]);

  const toggleCreate = () => {
    initializedRef.current = true;
    setCreateOpen(!createOpen);
    if (!createOpen) window.requestAnimationFrame(() => {
      formRef.current?.scrollIntoView({ behavior: "auto", block: "nearest" });
      formRef.current?.querySelector<HTMLElement>('.credential-provider-picker summary')?.focus({ preventScroll: true });
    });
  };

  const changeProvider = (nextProvider: CredentialProvider) => {
    const preset = credentialPresets[nextProvider];
    setProvider(nextProvider);
    setLabel(preset.label);
    setData(preset.data);
    setJsonError(null);
    setCreateError(null);
    const providerLabels: Record<CredentialProvider, string> = {
      AIRTABLE: "Airtable",
    GOOGLE: "Google",
      STEAM: "Steam",
      RIOT: "Riot Games",
      GOOGLE_CHAT_WEBHOOK: "Google Chat",
      HTTP: "HTTP",
      DISCORD_WEBHOOK: "Discord",
      SLACK_WEBHOOK: "Slack",
      SLACK_OAUTH: "Slack workspace",
      TELEGRAM_BOT: "Telegram",
      JIRA: "Jira", GITLAB: "GitLab", GITHUB: "GitHub",
      SMTP: "SMTP email",
      GEMINI: "Gemini",
      OPENAI: "OpenAI",
      MONGODB: "MongoDB",
      NOTION: "Notion",
      TRELLO: "Trello",
      SENTRY: "Sentry",
      VERCEL: "Vercel",
      SUPABASE: "Supabase",
      REDDIT: "Reddit",
      POSTGRES: "PostgreSQL",
      GOOGLE_CHAT_OAUTH: "Google Chat OAuth",
      GMAIL: "Gmail",
      GOOGLE_CALENDAR: "Google Calendar",
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
    ["GOOGLE", "GOOGLE_CHAT_OAUTH", "GMAIL", "GOOGLE_CALENDAR"].includes(cred.provider) && (cred.isManaged ?? (cred.provider === "GOOGLE" && cred.label === "Google OAuth"));


  const isManaged = (credential: CredentialSummary) => isGoogleOAuth(credential) || credential.provider === "SLACK_OAUTH" || credential.provider === "JIRA" || credential.provider === "AIRTABLE" || (credential.provider === "NOTION" && credential.isManaged === true);
  const openSettings = (credential: CredentialSummary) => {
    cancelAction();
    setActiveAction({ credentialId: credential.id, type: isManaged(credential) ? "oauth" : "details" });
  };
  const closeSettings = () => { if (!isActionSubmitting) cancelAction(); };
  const selectedCredential = credentials.find((credential) => credential.id === activeAction?.credentialId);
  const renderAction = (credential: CredentialSummary) => {
    const isRenaming = activeAction?.type === "rename";
    const isRotating = activeAction?.type === "rotate";
    const isDeleting = activeAction?.type === "delete";
    const isManagingOAuth = activeAction?.type === "oauth";
    return <>
      {activeAction?.type === "details" && <div className="connection-details__overview">
        <p>Your secret is stored securely. To change it, enter replacement values.</p>
        {credential.hints?.length ? <div className="credential-card__hints" aria-label="Saved credential identification">{credential.hints.map((hint) => <span key={hint.field}>{hint.label} <code>{hint.masked}</code></span>)}</div> : null}
        <div className="connection-details__actions"><Button variant="secondary" onClick={() => startRotate(credential)}>Rotate secret</Button><Button variant="ghost" onClick={() => startRename(credential)}>Rename</Button></div>
      </div>}
              {isManagingOAuth ? <>
                <div className="credential-card__oauth-managed">
                  {isGoogleOAuth(credential) ? <>
                    <p className="credential-card__oauth-text">Reconnect with the same Google account. Google may combine permissions with prior grants.</p>
                    {credential.googleReconnectRequired ? <p role="status">Reconnect to verify permissions before the current token expires.</p> : null}
                    {credential.googleLegacyScopesUnverified ? <p role="status">Reconnect to verify permissions for newer features.</p> : null}
                    {credential.provider === "GMAIL" ? <GmailOAuthConsent workspaceId={workspaceId} credentialId={credential.id} identityUnverified={credential.googleIdentityUnverified} initialCapabilities={credential.gmailCapabilities} /> : credential.provider === "GOOGLE_CHAT_OAUTH" ? <GoogleChatOAuthConsent workspaceId={workspaceId} credentialId={credential.id} identityUnverified={credential.googleIdentityUnverified} initialManage={credential.chatManageEnabled} /> : <Button
                      variant="secondary" type="button" className="credential-panel__oauth"
                      onClick={() => startGoogleConnection(workspaceId, credential.provider === "GOOGLE_CALENDAR" ? "calendar" : "google", credential.id, credential.googleIdentityUnverified)}
                    >Reconnect Google</Button>}
                  </> : credential.provider === "AIRTABLE" ? <>
                    <p className="credential-card__oauth-text">Reconnect the same Airtable account and choose accessible bases.</p>
                    <Button variant="secondary" type="button" onClick={() => window.location.assign(`${apiUrl}/workspaces/${workspaceId}/credentials/airtable/connect?credentialId=${encodeURIComponent(credential.id)}`)}>Reconnect Airtable</Button>
                  </> : credential.provider === "JIRA" ? <>
                    <p className="credential-card__oauth-text">Reconnect the same Jira site and account.</p>
                    <Button variant="secondary" type="button" onClick={() => window.location.assign(`${apiUrl}/workspaces/${workspaceId}/credentials/jira/connect?credentialId=${encodeURIComponent(credential.id)}`)}>Reconnect Jira</Button>
                  </> : credential.provider === "NOTION" ? <>
                    <p className="credential-card__oauth-text">Reconnect the same Notion workspace and choose the pages Fluxora can access. Existing workflows keep this connection.</p>
                    <Button variant="secondary" type="button" onClick={() => window.location.assign(`${apiUrl}/workspaces/${workspaceId}/credentials/notion/connect?credentialId=${encodeURIComponent(credential.id)}`)}>Reconnect Notion</Button>
                  </> : <>
                    <p className="credential-card__oauth-text">Reconnect the same Slack workspace if access expires or is revoked. To connect a different workspace, add a new connection.</p>
                    <div className="credential-card__form-actions">
                      <Button variant="secondary" type="button" onClick={() => window.location.assign(`${apiUrl}/workspaces/${workspaceId}/credentials/slack/connect?credentialId=${encodeURIComponent(credential.id)}`)}>Reconnect Slack</Button>
                      <Button variant="secondary" type="button" onClick={() => window.location.assign(`${apiUrl}/workspaces/${workspaceId}/credentials/slack/connect?credentialId=${encodeURIComponent(credential.id)}&permissions=events`)}>Enable Slack triggers</Button>
                    </div>
                    <p>Trigger access allows reading messages in public channels the bot has joined and receiving app mentions. Slack will ask you to approve these permissions.</p>
                  </>}
                </div>
              </> : null}

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
                      : "Existing secret values cannot be displayed for security. Enter all replacement values. The advanced JSON option preserves custom fields."}
                  </p>
                  <CredentialSecretFields provider={credential.provider} value={actionData} replacement onChange={(value) => { setActionData(value); setActionError(null); }} />
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
                  {blockerDetails && ((blockerDetails.workflows?.length ?? 0) > 0 || (blockerDetails.executions?.length ?? 0) > 0) ? <p className="credential-card__warning" role="status">This connection is in use and cannot be deleted yet. Select another connection in the listed workflows, save and republish where needed, then try again after active executions finish.</p> : null}
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
    </>;
  };

  const currentProvider = provider === "SMTP" || provider === "GMAIL" ? "EMAIL" : provider;
  const matchingProviderGroups = providerGroups.map((group) => ({ ...group, options: group.options.filter((option) => `${option.label} ${option.keywords ?? ""}`.toLowerCase().includes(providerQuery.trim().toLowerCase())) })).filter((group) => group.options.length);
  const currentProviderLabel = providerGroups.flatMap((group) => group.options).find((option) => option.value === currentProvider)?.label ?? currentProvider;
  const providerMatchCount = matchingProviderGroups.reduce((count, group) => count + group.options.length, 0);
  const oauthCount = credentials.filter(isManaged).length;
  const visibleCredentials = credentials.filter((credential) =>
    (methodFilter === "all" || (methodFilter === "oauth" ? isManaged(credential) : !isManaged(credential))) &&
    `${credential.label} ${credentialProviderLabel(credential.provider)}`.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <section
      ref={panelRef}
      className={`credential-panel credential-panel--${presentation}`}
      aria-label="Credential manager"
      role={presentation === "panel" ? "dialog" : "region"}
      aria-modal={presentation === "panel" ? false : undefined}
      tabIndex={presentation === "panel" ? -1 : undefined}
    >
      {presentation === "panel" && <div className="credential-panel__heading">
        <div><p className="section-label">CONNECTIONS</p><h2>Secure connections</h2></div>
        {onClose ? <IconButton label="Close credential manager" onClick={onClose}>×</IconButton> : null}
      </div>}
      {presentation === "panel" ? (
        <div className="credential-panel__directory">
          <Button variant="ghost" className="credential-panel__directory-link" onClick={() => window.open(`/dashboard/connections?workspace=${encodeURIComponent(workspaceId)}`, "_blank", "noopener,noreferrer")}>
            Open connection center <ArrowUpRight size={13} aria-hidden="true" />
          </Button>
        </div>
      ) : null}
      <div className="credential-toolbar">
        <label className="credential-search"><Search size={16} aria-hidden="true" /><input type="search" aria-label="Search connections" placeholder="Search name or app" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
        <Button variant={createOpen ? "secondary" : "primary"} type="button" aria-expanded={createOpen} aria-controls="credential-create-content" onClick={toggleCreate}>{createOpen ? <ChevronUp size={15} /> : <Plus size={15} />}{createOpen ? "Hide new connection" : "New connection"}</Button>
      </div>
      {presentation === "page" && <div className="connection-methods" role="group" aria-label="Filter connection method">
        {([["all", "All connections", credentials.length], ["oauth", "OAuth", oauthCount], ["manual", "Manual", credentials.length - oauthCount]] as const).map(([value, label, count]) =>
          <button key={value} type="button" aria-pressed={methodFilter === value} onClick={() => setMethodFilter(value)}>{label}<span>{count}</span></button>)}
      </div>}
      <Collapse open={createOpen} id="credential-create-content" className="credential-create">
      <form ref={formRef} onSubmit={submit} className="credential-form" aria-label="New connection">
        <div className="credential-form__title"><h3>New connection</h3><p>Choose an app and add its authorization details.</p></div>
        <div className="credential-provider-picker">
          <span className="credential-provider-picker__label" id="provider-picker-label">App</span>
          <details ref={providerPickerRef} className="credential-provider-picker__details" onToggle={(event) => {
            if (event.currentTarget.open) event.currentTarget.querySelector<HTMLInputElement>('input[aria-label="Find an app"]')?.focus({ preventScroll: true });
          }} onKeyDown={(event) => {
            if (event.key === "Escape" && providerPickerRef.current?.open) {
              event.preventDefault();
              providerPickerRef.current.open = false;
              providerPickerRef.current.querySelector<HTMLElement>("summary")?.focus();
            }
          }}>
            <summary aria-labelledby="provider-picker-label provider-picker-current">
              <span className="credential-card__icon" aria-hidden="true"><NodeIcon name={providerIcons[currentProvider === "EMAIL" ? "GMAIL" : currentProvider]} size={21} /></span>
              <span className="credential-provider-picker__current" id="provider-picker-current"><small>Selected app</small><strong>{currentProviderLabel}</strong></span>
              <span className="credential-provider-picker__change">Change <ChevronDown size={16} aria-hidden="true" /></span>
            </summary>
            <div className="credential-provider-picker__menu">
              <label className="credential-provider-picker__search"><Search size={17} aria-hidden="true" /><span className="visually-hidden">Find an app</span><input type="search" aria-label="Find an app" placeholder="Search apps" value={providerQuery} onKeyDown={(event) => { if (event.key === "Enter") event.preventDefault(); }} onChange={(event) => setProviderQuery(event.target.value)} /></label>
              <p className="credential-provider-picker__result" role="status">{providerMatchCount ? `${providerMatchCount} ${providerMatchCount === 1 ? "app" : "apps"} available` : "No apps found. Try another search."}</p>
              <div className="credential-provider-picker__list">
                {matchingProviderGroups.map((group) => (
                  <section key={group.label} aria-label={group.label}>
                    <h4>{group.label}</h4>
                    <div className="credential-provider-picker__options">
                      {group.options.map((option) => (
                        <button type="button" className="credential-provider-picker__option" key={option.value} aria-pressed={option.value === currentProvider} onClick={() => {
                          changeProvider(option.value === "EMAIL" ? "GMAIL" : option.value);
                          setProviderQuery("");
                          if (providerPickerRef.current) {
                            providerPickerRef.current.open = false;
                            providerPickerRef.current.querySelector<HTMLElement>("summary")?.focus();
                          }
                        }}>
                          <span className="credential-card__icon" aria-hidden="true"><NodeIcon name={providerIcons[option.value === "EMAIL" ? "GMAIL" : option.value]} size={20} /></span>
                          <span>{option.label}</span>
                          {option.value === currentProvider && <Check size={16} aria-hidden="true" />}
                        </button>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            </div>
          </details>
        </div>
        {provider === "SMTP" || provider === "GMAIL" ? <Field label="Connection type" className="credential-form__field">
          <Select aria-label="Email connection type" value={provider} onChange={(event) => changeProvider(event.target.value as "GMAIL" | "SMTP")}>
            <option value="GMAIL">Gmail API (read and optional actions)</option>
            <option value="SMTP">SMTP (send email)</option>
          </Select>
        </Field> : null}
        {provider !== "SLACK_OAUTH" && provider !== "JIRA" && provider !== "AIRTABLE" && <Field label="Connection name" className="credential-form__field">
          <input aria-label="Connection name" value={label} onChange={(event) => { setLabel(event.target.value); setCreateError(null); }} />
        </Field>}
        {provider === "GOOGLE" ? (
          <div className="credential-form__oauth-helper">
            <span>Google requests access to view, create, edit and delete files in your Drive, including spreadsheets. This connection is separate from Google sign-in.</span>
            <button type="button" className="credential-form__oauth-link" onClick={() => { window.location.assign(`${apiUrl}/workspaces/${workspaceId}/credentials/google/connect`); }}>
              Connect Google <ArrowUpRight size={13} aria-hidden="true" />
            </button>
          </div>
        ) : null}
        {provider === "GOOGLE_CHAT_OAUTH" ? <GoogleChatOAuthConsent workspaceId={workspaceId} /> : null}
        {provider === "GMAIL" ? <GmailOAuthConsent workspaceId={workspaceId} /> : null}
        {provider === "GOOGLE_CALENDAR" ? <div className="credential-form__oauth-helper"><span>Google Calendar requests permission to view and edit events, list your calendars and check availability. Events may appear in workflow execution history.</span><button type="button" className="credential-form__oauth-link" onClick={() => window.location.assign(`${apiUrl}/workspaces/${workspaceId}/credentials/google-calendar/connect`)}>Connect Google Calendar <ArrowUpRight size={13} aria-hidden="true" /></button></div> : null}
        {provider === "TRELLO" ? <div className="credential-form__oauth-helper"><span>Create an API key for a Trello Power-Up, then authorize a token with access to the boards you need.</span><a className="credential-form__oauth-link" href="https://developer.atlassian.com/cloud/trello/guides/rest-api/authorization/" target="_blank" rel="noopener noreferrer">Trello setup guide <ArrowUpRight size={13} aria-hidden="true" /></a></div> : null}
        {provider === "SENTRY" ? <div className="credential-form__oauth-helper"><span>Create a Sentry authentication token with organization and issue read scopes.</span><a className="credential-form__oauth-link" href="https://docs.sentry.io/api/guides/create-auth-token/" target="_blank" rel="noopener noreferrer">Sentry setup guide <ArrowUpRight size={13} aria-hidden="true" /></a></div> : null}
        {provider === "VERCEL" ? <div className="credential-form__oauth-helper"><span>Create an access token for the personal account or team you want to use.</span><a className="credential-form__oauth-link" href="https://vercel.com/docs/rest-api" target="_blank" rel="noopener noreferrer">Vercel API guide <ArrowUpRight size={13} aria-hidden="true" /></a></div> : null}
        {provider === "REDDIT" ? <div className="credential-form__oauth-helper"><span>Reddit has stopped accepting new public Data API access requests and plans to retire remaining access in March 2027. Existing approved apps may still work during the transition.</span><a className="credential-form__oauth-link" href="https://support.reddithelp.com/hc/en-us/articles/54353370049684-Changelog-October-8-2026" target="_blank" rel="noopener noreferrer">Reddit access timeline <ArrowUpRight size={13} aria-hidden="true" /></a></div> : null}
        {provider === "SUPABASE" ? <div className="credential-form__oauth-helper"><span>Find your project reference and API key in the Supabase dashboard. A secret key grants elevated access and bypasses Row Level Security.</span><a className="credential-form__oauth-link" href="https://supabase.com/docs/guides/getting-started/api-keys" target="_blank" rel="noopener noreferrer">Supabase key guide <ArrowUpRight size={13} aria-hidden="true" /></a><a className="credential-form__oauth-link" href="https://supabase.com/docs/guides/platform/personal-access-tokens" target="_blank" rel="noopener noreferrer">Scoped management token guide <ArrowUpRight size={13} aria-hidden="true" /></a></div> : null}
        <p className="credential-form__hint" aria-live="polite">{credentialPresets[provider].hint}</p>
        {provider === "NOTION" && <div className="credential-form__oauth-helper"><span>Connect your own Notion workspace and select the pages Fluxora may read and update, or enter an integration token below.</span><Button variant="secondary" type="button" onClick={() => window.location.assign(`${apiUrl}/workspaces/${workspaceId}/credentials/notion/connect`)}>Connect Notion</Button></div>}
        {provider === "AIRTABLE" ? <div className="credential-form__oauth-helper"><span>Choose the Airtable bases you want to connect. Airtable will show the requested permissions.</span><Button variant="secondary" type="button" onClick={() => window.location.assign(`${apiUrl}/workspaces/${workspaceId}/credentials/airtable/connect`)}>Connect Airtable</Button></div> : provider === "JIRA" ? <div className="credential-form__oauth-helper"><span>Choose your Jira site and approve issue access with Atlassian. Availability depends on server setup and Atlassian app distribution.</span><Button variant="secondary" type="button" onClick={() => window.location.assign(`${apiUrl}/workspaces/${workspaceId}/credentials/jira/connect`)}>Connect Jira</Button></div> : provider === "SLACK_OAUTH" ? <div className="credential-form__oauth-helper"><span>Slack lets Fluxora list public channels and send messages as its bot.</span><button type="button" className="credential-form__oauth-link" onClick={() => window.location.assign(`${apiUrl}/workspaces/${workspaceId}/credentials/slack/connect`)}>Connect Slack <ArrowUpRight size={13} aria-hidden="true" /></button></div> : <CredentialSecretFields provider={provider} value={data} onChange={(value) => { setData(value); setJsonError(null); setCreateError(null); }} />}
        {jsonError && <p className="credential-form__error" role="alert">{jsonError}</p>}
        {createError && <p className="credential-form__error" role="alert">{createError}</p>}
        {provider !== "SLACK_OAUTH" && provider !== "JIRA" && provider !== "AIRTABLE" && <Button variant="primary" className="run-button" type="submit" disabled={isSaving}>{isSaving ? "Encrypting…" : "Encrypt & save"}</Button>}
      </form>
      </Collapse>
      {loading ? <div className="credential-list-loading" aria-busy="true" aria-label="Loading connections"><Skeleton /><Skeleton /></div> : loadError ? <Status tone="error" role="alert">{loadError}<Button variant="ghost" onClick={() => void load()}>Retry connections</Button></Status> : visibleCredentials.length === 0 ? <EmptyState icon={<KeyRound size={22} />} title={query || methodFilter !== "all" ? "No matching connections" : "Your connections will appear here"} description={query || methodFilter !== "all" ? "Try another app, name or connection method." : "Add an app once, then select it in any compatible workflow node."} action={query || methodFilter !== "all" ? <Button variant="ghost" onClick={() => { setQuery(""); setMethodFilter("all"); }}>Clear filters</Button> : undefined} /> : (
      <div className="connection-directory">
        {presentation === "page" && <div className="connection-directory__columns" aria-hidden="true"><span>Connection</span><span>Method</span><span>Last updated</span><span /></div>}
        <ul className="credential-list">
          {visibleCredentials.map((credential) => {
            const managed = isManaged(credential);
            const attention = credential.googleReconnectRequired ? "Reconnect required" : credential.googleIdentityUnverified ? "Verify account" : credential.googleLegacyScopesUnverified ? "Review permissions" : null;
            return <li key={credential.id} className="credential-card" data-credential-id={credential.id}>
              <div className="credential-card__row">
                <button type="button" className="credential-card__identity" onClick={() => openSettings(credential)} aria-label={`Open ${credential.label}`}>
                  <span className="credential-card__icon"><NodeIcon name={providerIcons[credential.provider]} size={22} /></span>
                  <span className="credential-card__info"><strong title={credential.label}>{credential.label}</strong><span className="credential-card__metadata"><span className="credential-card__provider">{credentialProviderLabel(credential.provider)}</span>{attention && <span className="credential-card__attention">{attention}</span>}</span></span>
                </button>
                <span className="credential-card__method"><span className="credential-card__managed-badge">{managed ? "OAuth" : "Manual"}</span></span>
                <span className="credential-card__updated">{credential.updatedAt ? new Date(credential.updatedAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "—"}</span>
                <div className="credential-card__controls">
                  <Button variant="ghost" className="credential-card__settings" onClick={() => openSettings(credential)} aria-label={`Connection settings for ${credential.label}`}>Manage<ChevronRight size={14} /></Button>
                  <Menu label={`Actions for ${credential.label}`} trigger={<MoreVertical size={17} aria-hidden="true" />} className="credential-card__menu" contentClassName="credential-card__menu-content">
                    <button type="button" onClick={() => openSettings(credential)}>Connection settings</button>
                    {!isGoogleOAuth(credential) && <button type="button" aria-label={`Rename ${credential.label}`} onClick={() => startRename(credential)}>Rename</button>}
                    {!managed && <button type="button" aria-label={`Rotate secret for ${credential.label}`} onClick={() => startRotate(credential)}>Rotate secret</button>}
                    <button type="button" className="credential-card__menu-delete" aria-label={`Delete ${credential.label}`} onClick={() => startDelete(credential)}>Delete</button>
                  </Menu>
                </div>
              </div>
              {presentation === "panel" && activeAction?.credentialId === credential.id && <div className="credential-card__inline-settings">{renderAction(credential)}<Button variant="ghost" onClick={closeSettings} disabled={isActionSubmitting}>Close settings</Button></div>}
            </li>;
          })}
        </ul>
        <div className="connection-directory__footer"><LockKeyhole size={13} aria-hidden="true" /><span>{visibleCredentials.length} of {credentials.length} connections · Secrets encrypted</span></div>
      </div>
      )}
      <Disclosure className="credential-security-note" summary="How connections and permissions work">
        <p>Connections belong to this workspace and use your own app accounts. Full secrets are encrypted and never shown after saving. Some tokens display their last two characters for identification in connection settings.</p>
        <p>Google may combine returned permissions with prior grants to this app, even when connections appear separately. Review the permissions on Google’s consent screen.</p>
      </Disclosure>
      {presentation === "page" && selectedCredential && activeAction && <div className="connection-details-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) closeSettings(); }}>
        <Dialog label="Connection settings" className="connection-details" onClose={closeSettings} initialFocusSelector='[aria-label="Close connection settings"]'>
          <DialogHeader eyebrow="CONNECTION" title={activeAction.type === "rename" ? "Rename connection" : activeAction.type === "rotate" ? "Replace secret" : activeAction.type === "delete" ? "Delete connection" : "Connection settings"} onClose={closeSettings} closeLabel="Close connection settings" />
          <div className="connection-details__identity"><span className="credential-card__icon"><NodeIcon name={providerIcons[selectedCredential.provider]} size={24} /></span><div><strong>{selectedCredential.label}</strong><span>{credentialProviderLabel(selectedCredential.provider)} · {isManaged(selectedCredential) ? "OAuth" : "Manual connection"}</span></div></div>
          <div className="connection-details__body">{renderAction(selectedCredential)}</div>
          <div className="connection-details__footer"><LockKeyhole size={14} /><span>Your saved secrets are never displayed.</span></div>
        </Dialog>
      </div>}

      {notice && <Status tone="info" className="credential-panel__notice" aria-live="polite">
        <span className="credential-panel__notice-icon"><LockKeyhole size={15} aria-hidden="true" /></span>
        <span className="credential-panel__notice-copy">{notice}</span>
      </Status>}

    </section>
  );
}

const gmailOptionalPermissions: Array<{ id: Exclude<GmailCapability, "readonly">; label: string }> = [
  { id: "send", label: "Send email (sensitive)" },
  { id: "compose", label: "Manage drafts and send (restricted)" },
  { id: "modify", label: "Modify mailbox, compose and send (restricted)" },
  { id: "labels", label: "Manage labels (non-sensitive)" },
];

function startGoogleConnection(workspaceId: string, kind: "google" | "calendar" | "chat" | "gmail", credentialId?: string, identityUnverified?: boolean, options?: { capabilities?: string; manage?: string }) {
  const params = new URLSearchParams();
  if (options?.capabilities) params.set("capabilities", options.capabilities);
  if (options?.manage) params.set("manage", options.manage);
  if (credentialId) params.set("credentialId", credentialId);
  if (credentialId && identityUnverified) {
    params.set("workspace", workspaceId); params.set("kind", kind); params.set("google_oauth", "legacy_identity_unknown");
    window.location.assign(`/dashboard/connections?${params.toString()}`);
    return;
  }
  const path = kind === "chat" ? "google-chat" : kind === "calendar" ? "google-calendar" : kind;
  window.location.assign(`${apiUrl}/workspaces/${encodeURIComponent(workspaceId)}/credentials/${path}/connect?${params.toString()}`);
}

function GoogleChatOAuthConsent({ workspaceId, credentialId, initialManage, identityUnverified }: { workspaceId: string; credentialId?: string; initialManage?: boolean; identityUnverified?: boolean }) {
  const [manage, setManage] = useState(Boolean(initialManage));
  const Permissions = credentialId ? "details" : "div";
  const navigate = () => {
    startGoogleConnection(workspaceId, "chat", credentialId, identityUnverified, { manage: manage ? "1" : "0" });
  };
  return <div className="credential-form__oauth-helper gmail-oauth-consent">
    <Permissions className="credential-oauth-permissions">
    {credentialId ? <summary>Google Chat permissions</summary> : null}
    <p>Google Chat requests access to list spaces and send messages. Select additional access only if this connection needs it.</p>
    <fieldset><legend>Google Chat permissions</legend>
      <label><input type="checkbox" checked disabled readOnly /> List spaces and send messages</label>
      <label><input type="checkbox" checked={manage} onChange={(event) => setManage(event.target.checked)} /> Manage messages and reactions</label>
    </fieldset>
    <p>Management grants broader access to view, update and delete messages and manage reactions. Google verification and account eligibility may be required. Existing workflows that need this permission may stop working if you remove it.</p>
    </Permissions>
    <button type="button" className="credential-form__oauth-link" onClick={navigate}>{credentialId ? "Reconnect Google Chat" : "Connect Google Chat"} <ArrowUpRight size={13} aria-hidden="true" /></button>
  </div>;
}

function GmailOAuthConsent({ workspaceId, credentialId, initialCapabilities, identityUnverified }: { workspaceId: string; credentialId?: string; initialCapabilities?: GmailCapability[]; identityUnverified?: boolean }) {
  const [selected, setSelected] = useState<GmailCapability[]>(() => initialCapabilities?.includes("readonly") ? initialCapabilities : ["readonly"]);
  const Permissions = credentialId ? "details" : "div";
  const navigate = () => {
    startGoogleConnection(workspaceId, "gmail", credentialId, identityUnverified, { capabilities: selected.join(",") });
  };
  return <div className="credential-form__oauth-helper gmail-oauth-consent">
    <Permissions className="credential-oauth-permissions">
    {credentialId ? <summary>Gmail permissions</summary> : null}
    <p>Read access is required for existing Gmail workflows. Message contents may appear in execution history. Select only additional access you want this connection to use; keep all permissions needed by existing workflows when reconnecting. Google’s actual grant controls what can run.</p>
    <fieldset><legend>Gmail permissions</legend>
      <label><input type="checkbox" checked disabled readOnly /> Read messages (restricted; required)</label>
      {gmailOptionalPermissions.map(({ id, label }) => <label key={id}><input type="checkbox" checked={selected.includes(id)} onChange={(event) => { const checked = event.target.checked; setSelected((previous) => checked ? [...previous, id] : previous.filter((item) => item !== id)); }} /> {label}</label>)}
    </fieldset>
    <p>Google verification is required for public apps using sensitive or restricted scopes; restricted scopes may also require a security assessment. Availability depends on Google’s review and your OAuth configuration. <a href="https://developers.google.com/workspace/gmail/api/auth/scopes" target="_blank" rel="noopener noreferrer">Google Gmail scope requirements</a></p>
    </Permissions>
    <button type="button" className="credential-form__oauth-link" onClick={navigate}>{credentialId ? "Reconnect Google" : "Connect Gmail"} <ArrowUpRight size={13} aria-hidden="true" /></button>
  </div>;
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
