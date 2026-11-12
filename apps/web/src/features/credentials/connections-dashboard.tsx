"use client";

import { KeyRound } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiRequest, apiUrl, isUnauthenticated } from "../api/api-client";
import { Button, EmptyState, PageHeader, Status } from "../../components/ui";
import { CredentialManager } from "./credential-panel";
import { AppShellHeader } from "../app-shell/app-shell-header";
import { loginHref } from "../auth/auth-redirect";
import { SessionLoading } from "../auth/session-loading";

type WorkspaceSummary = { id: string; name: string; slug: string; role: "OWNER" | "EDITOR" | "VIEWER" };

export function ConnectionsDashboard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [workspaceId, setWorkspaceId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [confirmReconnect, setConfirmReconnect] = useState(false);
  const [reconnectBusy, setReconnectBusy] = useState(false);
  const [reconnectError, setReconnectError] = useState<string | null>(null);
  const [reconnectUsage, setReconnectUsage] = useState<{ workflows: Array<{ id: string; name: string }>; executions: Array<{ id: string }> } | null>(null);

  useEffect(() => {
    let active = true;
    let redirecting = false;
    void (async () => {
      try {
        const workspaceResponse = await apiRequest<{ workspaces: WorkspaceSummary[] }>("/workspaces");
        if (!active) return;
        setWorkspaces(workspaceResponse.workspaces);
        const requestedWorkspace = searchParams.get("workspace");
        const initialWorkspace = workspaceResponse.workspaces.find((workspace) => workspace.id === requestedWorkspace) ?? workspaceResponse.workspaces[0];
        setWorkspaceId(initialWorkspace?.id ?? "");
      } catch (reason) {
        if (!active) return;
        const message = reason instanceof Error ? reason.message : "Unable to load connections.";
        if (isUnauthenticated(reason)) { redirecting = true; router.replace(loginHref(window.location)); }
        else setError(message);
      } finally {
        if (active && !redirecting) setIsLoading(false);
      }
    })();
    return () => { active = false; };
  }, [router, searchParams]);

  const activeWorkspace = useMemo(() => workspaces.find((workspace) => workspace.id === workspaceId), [workspaceId, workspaces]);
  const oauthRecovery = searchParams.get("google_oauth");
  const slackRecovery = searchParams.get("slack_oauth");
  const recoveryMessages: Record<string, string> = {
    missing_refresh: "Google did not return an offline refresh token. Try again and grant offline access.",
    chat_missing_refresh: "Google did not return an offline refresh token. Try again and grant offline access.",
    gmail_missing_refresh: "Google did not return an offline refresh token. Try again and grant offline access.",
    calendar_missing_refresh: "Google did not return an offline refresh token. Try again and grant offline access.",
    denied: "Google authorization was cancelled or denied. Try again when you are ready.",
    invalid_state: "This authorization expired, was already used, or came from another browser session. Start a new connection from this page.",
    redis_unavailable: "The authorization state service (Redis) is unavailable. Ask your administrator to restore the shared Redis service, then start the connection again.",
    token_failed: "Google could not complete the token exchange. Start the connection again.",
    scope_missing: "Google did not grant all required permissions. Try again and grant the requested permissions.",
    identity_failed: "The Google account identity could not be verified. Try again and allow account email access.",
    account_mismatch: "Choose the same Google account originally used for this connection.",
    legacy_identity_unknown: "We cannot verify which Google account was originally used. You can reconnect this connection after reviewing its usage.",
    changed: "The connection changed during authorization. Try reconnecting again.",
    failed: "The connection service may be unavailable, or your workspace access may have changed. Try again or contact an administrator.",
  };
  const recoveryKind = searchParams.get("kind") ?? (oauthRecovery === "missing_refresh" ? "google" : oauthRecovery === "chat_missing_refresh" ? "chat" : oauthRecovery === "gmail_missing_refresh" ? "gmail" : oauthRecovery === "calendar_missing_refresh" ? "calendar" : null);
  const recoveryMessage = oauthRecovery ? recoveryMessages[oauthRecovery] : undefined;
  const recoveryPath = recoveryKind === "chat" ? "google-chat" : recoveryKind === "gmail" ? "gmail" : recoveryKind === "calendar" ? "google-calendar" : recoveryKind === "google" ? "google" : undefined;
  const retryParams = new URLSearchParams();
  if (oauthRecovery !== "legacy_identity_unknown" && searchParams.get("credentialId")) retryParams.set("credentialId", searchParams.get("credentialId")!);
  if (recoveryKind === "gmail" && searchParams.get("capabilities")) retryParams.set("capabilities", searchParams.get("capabilities")!);
  if (recoveryKind === "chat" && searchParams.get("manage")) retryParams.set("manage", searchParams.get("manage")!);
  const retryQuery = retryParams.toString();
  const recoveryWorkspace = searchParams.get("workspace");
  const recoveryCredentialId = searchParams.get("credentialId");
  const showRecovery = Boolean(recoveryMessage && (!recoveryWorkspace || recoveryWorkspace === workspaceId));

  const reviewReconnect = useCallback(async () => {
    const credentialId = recoveryCredentialId;
    if (!credentialId) return;
    setConfirmReconnect(true); setReconnectBusy(true); setReconnectError(null); setReconnectUsage(null);
    try {
      const result = await apiRequest<{ references: { workflows: Array<{ id: string; name: string }>; executions: Array<{ id: string }> } }>(`/workspaces/${encodeURIComponent(workspaceId)}/credentials/${encodeURIComponent(credentialId)}/references`);
      setReconnectUsage(result.references);
    } catch (reason) { setReconnectError(reason instanceof Error ? reason.message : "Could not check connection usage."); }
    finally { setReconnectBusy(false); }
  }, [recoveryCredentialId, workspaceId]);

  useEffect(() => {
    if (oauthRecovery !== "legacy_identity_unknown" || !workspaceId || !recoveryCredentialId || (recoveryWorkspace && recoveryWorkspace !== workspaceId)) return;
    window.scrollTo({ top: 0, behavior: "auto" });
    void reviewReconnect();
  }, [oauthRecovery, recoveryCredentialId, recoveryWorkspace, reviewReconnect, workspaceId]);

  const continueReconnect = async () => {
    const credentialId = searchParams.get("credentialId");
    if (!credentialId || !recoveryKind || !reconnectUsage) return;
    setReconnectBusy(true); setReconnectError(null);
    try {
      const result = await apiRequest<{ url: string }>(`/workspaces/${encodeURIComponent(workspaceId)}/credentials/${encodeURIComponent(credentialId)}/google-reconnect-confirmed`, { method: "POST", body: JSON.stringify({ confirmed: true, kind: recoveryKind, ...(recoveryKind === "gmail" && searchParams.get("capabilities") ? { gmailCapabilities: searchParams.get("capabilities")!.split(",") } : {}), ...(recoveryKind === "chat" ? { chatManage: searchParams.get("manage") === "1" } : {}) }) });
      window.location.assign(result.url);
    } catch (reason) { setReconnectError(reason instanceof Error ? reason.message : "Could not start Google authorization."); setReconnectBusy(false); }
  };

  const switchWorkspace = (nextWorkspaceId: string) => {
    setWorkspaceId(nextWorkspaceId);
    router.replace(`/dashboard/connections?workspace=${encodeURIComponent(nextWorkspaceId)}`);
  };

  if (isLoading) {
    return <SessionLoading />;
  }

  return (
    <main className="dashboard-page connections-page">
      <AppShellHeader workspaces={workspaces} workspaceId={workspaceId} onWorkspaceChange={switchWorkspace} active="connections" />
      <section className="connections-main">
        <PageHeader
          eyebrow={activeWorkspace?.name ?? "CONNECTIONS"}
          title="Connections"
          description="Your app accounts, securely connected to this workspace."
        />
        {error ? <Status tone="error" className="connections-error">{error}<Button variant="ghost" onClick={() => window.location.reload()}>Retry</Button></Status> : null}
        {!error && slackRecovery && <Status tone="error" className="connections-oauth-error"><div><strong>Slack connection needs another try</strong><p>{slackRecovery === "denied" ? "Slack authorization was cancelled or denied." : slackRecovery === "unavailable" ? "Slack OAuth is not available. Check the app configuration and try again." : slackRecovery === "rotation_unsupported" ? "This Slack app uses rotating tokens, which are not supported yet. Connect using a compatible app or wait for token rotation support." : "Slack could not complete the connection. For an existing connection, choose the same Slack workspace."}</p></div><Button variant="ghost" onClick={() => router.replace(`/dashboard/connections?workspace=${encodeURIComponent(workspaceId)}`)}>Dismiss</Button></Status>}
        {!error && searchParams.get("connected") === "slack" && <Status tone="success">Slack workspace connected.</Status>}
        {!error && searchParams.get("connected") === "jira" && <Status tone="success">Jira site connected.</Status>}
        {!error && searchParams.get("connected") === "airtable" && <Status tone="success">Airtable account connected.</Status>}
        {!error && searchParams.get("airtable_oauth") && <Status tone="error">{searchParams.get("airtable_oauth") === "unavailable" ? "Airtable OAuth is not configured on this server." : searchParams.get("airtable_oauth") === "denied" ? "Airtable authorization was cancelled or denied." : "Airtable connection could not be completed. Check the account and try again."}</Status>}
        {!error && searchParams.get("jira_oauth") && <Status tone="error">{searchParams.get("jira_oauth") === "unavailable" ? "Jira OAuth is not configured on this server." : searchParams.get("jira_oauth") === "denied" ? "Jira authorization was cancelled or denied." : "Jira connection could not be completed. Check the selected site and try again."}</Status>}
        {!error && searchParams.get("connected") === "notion" && <Status tone="success">Notion workspace connected.</Status>}
        {!error && searchParams.get("notion_oauth") && <Status tone="error" className="connections-oauth-error"><div><strong>Notion connection needs another try</strong><p>{searchParams.get("notion_oauth") === "denied" ? "Notion authorization was cancelled or denied." : searchParams.get("notion_oauth") === "unavailable" ? "Notion OAuth is not configured on this server. You can use an integration token for now." : "Notion could not complete the connection. Reconnect the same installation, or add a new connection for another workspace."}</p></div><Button variant="ghost" onClick={() => router.replace(`/dashboard/connections?workspace=${encodeURIComponent(workspaceId)}`)}>Dismiss</Button></Status>}
        {!error && showRecovery && activeWorkspace ? (
          <Status tone="error" className="connections-oauth-error">
            <div><strong>Google connection needs another try</strong><p>{recoveryMessage} Any existing connection was not changed.</p></div>
            <div className="connections-oauth-error__actions">
              {oauthRecovery === "legacy_identity_unknown" ? (!confirmReconnect && recoveryPath && recoveryCredentialId ? <Button variant="secondary" onClick={() => void reviewReconnect()} disabled={reconnectBusy}>Review reconnect</Button> : null) : recoveryPath ? <Button variant="secondary" onClick={() => window.location.assign(`${apiUrl}/workspaces/${encodeURIComponent(workspaceId)}/credentials/${recoveryPath}/connect${retryQuery ? `?${retryQuery}` : ""}`)}>Try Google again</Button> : null}
              <Button variant="ghost" onClick={() => router.replace(`/dashboard/connections?workspace=${encodeURIComponent(workspaceId)}`)}>Dismiss</Button>
            </div>
            {confirmReconnect ? <div className="connections-reconnect-review">
              <strong>Reconnect this connection?</strong>
              <p>The Google account you choose will be used by workflows connected to it. Choose the original account if possible.</p>
              {reconnectBusy && !reconnectUsage ? <p>Checking usage…</p> : null}
              {reconnectUsage ? <p>{reconnectUsage.workflows.length ? `Workflows using this connection: ${reconnectUsage.workflows.map((workflow) => workflow.name).join(", ")}.` : "No current workflows use this connection."} {reconnectUsage.executions.length ? `${reconnectUsage.executions.length} execution(s) are still active.` : ""}</p> : null}
              {recoveryKind === "gmail" ? <p>If you choose a different mailbox, Gmail triggers stop until reviewed and reactivated. Messages during the gap may need manual reconciliation.</p> : null}
              {reconnectError ? <p role="alert">{reconnectError}</p> : null}
              <div className="connections-oauth-error__actions"><Button variant="primary" disabled={!reconnectUsage || reconnectBusy} onClick={() => void continueReconnect()}>{reconnectBusy && reconnectUsage ? "Opening Google…" : "Continue with Google"}</Button><Button variant="ghost" disabled={reconnectBusy} onClick={() => setConfirmReconnect(false)}>Cancel</Button></div>
            </div> : null}
          </Status>
        ) : null}
        {!error && !workspaceId ? (
          <EmptyState
            icon={<KeyRound size={24} />}
            title="Create a workspace first"
            description="Connections belong to a workspace so they can never be selected across workspace boundaries."
            action={<Button variant="primary" onClick={() => router.push("/dashboard")}>Go to dashboard</Button>}
          />
        ) : null}
        {workspaceId ? <CredentialManager workspaceId={workspaceId} presentation="page" /> : null}
      </section>
    </main>
  );
}
