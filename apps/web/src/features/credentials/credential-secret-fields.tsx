"use client";

import { useEffect, useId, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Button, Field, IconButton, Select } from "../../components/ui";
import type { CredentialProvider } from "./credential-types";

type SecretField = { key: string; label: string; secret?: boolean; hint?: string };

function SecretInput({ label, value, hint, onChange }: { label: string; value: string; hint?: string; onChange: (value: string) => void }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => { if (!value) setVisible(false); }, [value]);
  const inputId = useId();
  const hintId = hint ? `${inputId}-hint` : undefined;
  return <div className="ui-field">
    <label className="ui-field__label" htmlFor={inputId}>{label}</label>
    <div className="credential-secret-input">
      <input id={inputId} aria-label={label} aria-describedby={hintId} type={visible ? "text" : "password"} autoComplete="new-password" spellCheck={false} value={value} onChange={(event) => onChange(event.target.value)} />
      <IconButton label={`${visible ? "Hide" : "Show"} ${label}`} aria-pressed={visible} onClick={() => setVisible((current) => !current)} className="credential-secret-input__toggle">
        {visible ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
      </IconButton>
    </div>
    {hint && <p id={hintId} className="ui-field__hint">{hint}</p>}
  </div>;
}
const fields: Partial<Record<CredentialProvider, SecretField[]>> = {
  GOOGLE: [{ key: "accessToken", label: "Access token", secret: true }],
  GOOGLE_CHAT_OAUTH: [{ key: "accessToken", label: "Access token", secret: true }],
  GMAIL: [{ key: "accessToken", label: "Gmail access token", secret: true, hint: "Manual access tokens are short-lived. OAuth is recommended." }],
  GOOGLE_CALENDAR: [{ key: "accessToken", label: "Google Calendar access token", secret: true, hint: "Manual access tokens are short-lived. OAuth is recommended." }],
  STEAM: [{ key: "apiKey", label: "Steam Web API key", secret: true }, { key: "steamId", label: "Steam ID", hint: "Your 17-digit Steam ID. Keep it as text to preserve every digit." }],
  GOOGLE_CHAT_WEBHOOK: [{ key: "webhookUrl", label: "Webhook URL", secret: true }],
  DISCORD_WEBHOOK: [{ key: "webhookUrl", label: "Webhook URL", secret: true }],
  TELEGRAM_BOT: [{ key: "botToken", label: "Bot token", secret: true }],
  GITHUB: [{ key: "token", label: "GitHub token", secret: true }],
  NOTION: [{ key: "token", label: "Notion integration token", secret: true, hint: "Share the pages you want to access with this integration in Notion." }],
  TRELLO: [{ key: "apiKey", label: "Trello API key", secret: true }, { key: "token", label: "Trello token", secret: true, hint: "Grant your token access to the boards you want to use." }],
  SENTRY: [{ key: "token", label: "Sentry authentication token", secret: true, hint: "A token with organization and issue read permissions." }],
  VERCEL: [{ key: "token", label: "Vercel access token", secret: true, hint: "The token must have access to the projects you want to inspect." }],
  REDDIT: [{ key: "clientId", label: "App client ID" }, { key: "clientSecret", label: "App client secret", secret: true }, { key: "username", label: "Reddit username", hint: "Used to identify the application in its User-Agent." }],
  SUPABASE: [{ key: "projectRef", label: "Supabase project reference", hint: "The project reference in your Supabase project URL, without https:// or .supabase.co." }, { key: "apiKey", label: "Supabase API key", secret: true, hint: "Secret keys bypass Row Level Security. Use a publishable key when its access is sufficient." }],
  POSTGRES: [{ key: "host", label: "PostgreSQL host", hint: "Public hostname with a trusted TLS certificate." }, { key: "database", label: "Database name" }, { key: "username", label: "Database user" }, { key: "password", label: "Database password", secret: true }],
  GEMINI: [{ key: "apiKey", label: "Gemini API key", secret: true }],
  OPENAI: [{ key: "apiKey", label: "OpenAI API key", secret: true }],
  MONGODB: [{ key: "host", label: "MongoDB host", hint: "Public server hostname or SRV cluster hostname, without mongodb:// or mongodb+srv://." }, { key: "username", label: "Database user" }, { key: "password", label: "Database password", secret: true }, { key: "authDatabase", label: "Authentication database" }],
  SMTP: [{ key: "host", label: "SMTP host" }, { key: "username", label: "Username" }, { key: "password", label: "Password", secret: true }, { key: "from", label: "Sender address", hint: "An address or sender identity accepted by your SMTP provider." }],
};

/** Edits only a new draft payload. Existing server-side secrets are never fetched. */
export function CredentialSecretFields({ provider, value, onChange, replacement = false }: {
  provider: CredentialProvider; value: string; onChange: (value: string) => void; replacement?: boolean;
}) {
  const [advanced, setAdvanced] = useState(false);
  let payload: Record<string, unknown> | null = null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) payload = parsed as Record<string, unknown>;
  } catch { /* Keep invalid JSON intact until the owner corrects it. */ }
  const jsonOnly = !fields[provider];
  const showJson = advanced || jsonOnly;
  const update = (key: string, next: string | number) => {
    if (payload) onChange(JSON.stringify({ ...payload, [key]: next }, null, 2));
  };

  return <div className="credential-secret-fields">
    <div className="credential-secret-fields__heading">
      <strong>{replacement ? "Replacement credentials" : "Authentication"}</strong>
      {!jsonOnly && <Button variant="ghost" type="button" aria-pressed={advanced} disabled={advanced && !payload} onClick={() => setAdvanced(!advanced)}>{advanced ? "Use fields" : "Edit JSON"}</Button>}
    </div>
    {showJson ? <>
      <p className="credential-secret-fields__help">Advanced input shows the new values you enter here. Saved secrets are never loaded.</p>
      <Field label={replacement ? "Replacement secret JSON" : "Secret JSON"}>
        <textarea aria-label={replacement ? "Replacement secret JSON" : "Secret JSON"} value={value} onChange={(event) => onChange(event.target.value)} rows={6} spellCheck={false} autoComplete="off" />
      </Field>
      {!payload && <p className="credential-secret-fields__help">Correct the JSON object before switching back to fields.</p>}
    </> : <div className="credential-secret-fields__grid">
      {provider === "MONGODB" && <Field label="Configuration type"><Select aria-label="Configuration type" value={payload?.configurationType === "connectionString" ? "connectionString" : "values"} onChange={(event) => update("configurationType", event.target.value)}><option value="values">Separate fields</option><option value="connectionString">Connection string</option></Select></Field>}
      {provider === "MONGODB" && payload?.configurationType !== "connectionString" && <Field label="Connection type" hint="Auto-detect supports existing connections. Atlas/SRV obtains host and port from DNS."><Select aria-label="Connection type" value={typeof payload?.connectionMode === "string" ? payload.connectionMode : "auto"} onChange={(event) => update("connectionMode", event.target.value)}><option value="auto">Auto-detect</option><option value="srv">Atlas / SRV cluster</option><option value="direct">Single server</option></Select></Field>}
      {provider === "MONGODB" && payload?.configurationType === "connectionString" && <SecretInput label="Connection string" hint="Use a single public host with TLS. Supported options: authSource, retryWrites, w, appName and tls. Automatic write retries remain disabled." value={typeof payload?.connectionString === "string" ? payload.connectionString : ""} onChange={(next) => update("connectionString", next)} />}
      {(provider !== "MONGODB" || payload?.configurationType !== "connectionString") && fields[provider]?.map((field) => field.secret
        ? <SecretInput key={`${provider}-${field.key}`} label={field.label} hint={field.hint} value={typeof payload?.[field.key] === "string" ? payload[field.key] as string : ""} onChange={(next) => update(field.key, next)} />
        : <Field key={field.key} label={field.label} hint={field.hint}><input aria-label={field.label} type="text" autoComplete="off" spellCheck={false} value={typeof payload?.[field.key] === "string" ? payload[field.key] as string : ""} onChange={(event) => update(field.key, event.target.value)} /></Field>)}
      {provider === "SMTP" && <Field label="Transport">
        <Select value={String(payload?.port ?? 587)} onChange={(event) => update("port", Number(event.target.value))}>
          <option value="587">STARTTLS · port 587</option><option value="465">TLS · port 465</option>
          {payload?.port !== 587 && payload?.port !== 465 && <option value={String(payload?.port)}>Current value · {String(payload?.port)}</option>}
        </Select>
      </Field>}
      {provider === "MONGODB" && payload?.configurationType !== "connectionString" && payload?.connectionMode !== "srv" && <Field label="Port" hint="Used for direct hosts; SRV clusters supply their own ports."><input aria-label="Port" type="number" min={1} max={65535} value={typeof payload?.port === "number" ? payload.port : 27017} onChange={(event) => update("port", Number(event.target.value))} /></Field>}
      {provider === "POSTGRES" && <Field label="Port"><input aria-label="Port" type="number" min={1} max={65535} value={typeof payload?.port === "number" ? payload.port : 5432} onChange={(event) => update("port", Number(event.target.value))} /></Field>}
      {provider === "SENTRY" && <Field label="Sentry region" hint="Choose the region shown in your Sentry organization settings."><Select aria-label="Sentry region" value={typeof payload?.region === "string" ? payload.region : "global"} onChange={(event) => update("region", event.target.value)}><option value="global">Global</option><option value="us">US</option><option value="de">Germany</option></Select></Field>}
    </div>}
  </div>;
}
