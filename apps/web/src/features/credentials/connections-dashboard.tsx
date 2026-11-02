"use client";

import { ArrowLeft, KeyRound } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { apiRequest, apiUrl } from "../api/api-client";
import { Button, EmptyState, PageHeader, Skeleton, Status } from "../../components/ui";
import { CredentialManager } from "./credential-panel";
import { AppShellHeader } from "../app-shell/app-shell-header";

type WorkspaceSummary = { id: string; name: string; slug: string; role: "OWNER" | "EDITOR" | "VIEWER" };

export function ConnectionsDashboard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [workspaceId, setWorkspaceId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;
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
        if (message === "Sign in is required." || message === "Your session has expired.") router.replace("/login");
        else setError(message);
      } finally {
        if (active) setIsLoading(false);
      }
    })();
    return () => { active = false; };
  }, [router, searchParams]);

  const activeWorkspace = useMemo(() => workspaces.find((workspace) => workspace.id === workspaceId), [workspaceId, workspaces]);
  const oauthRecovery = searchParams.get("google_oauth");
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
    legacy_identity_unknown: "The original account cannot be verified. Add a new connection, select it in each affected workflow, and republish workflows where needed. The old connection is unchanged.",
    changed: "The connection changed during authorization. Try reconnecting again.",
    failed: "The connection service may be unavailable, or your workspace access may have changed. Try again or contact an administrator.",
  };
  const recoveryKind = searchParams.get("kind") ?? (oauthRecovery === "missing_refresh" ? "google" : oauthRecovery === "chat_missing_refresh" ? "chat" : oauthRecovery === "gmail_missing_refresh" ? "gmail" : oauthRecovery === "calendar_missing_refresh" ? "calendar" : null);
  const recoveryMessage = oauthRecovery === "legacy_identity_unknown" && recoveryKind === "gmail"
    ? "The original account cannot be verified. Add a new connection and select it in each affected workflow. For a Gmail trigger, deactivate before publishing the changed connection and review the message-gap confirmation. Reactivation creates a new checkpoint; messages received while inactive or before the new checkpoint may not be processed, so reconcile them manually."
    : oauthRecovery ? recoveryMessages[oauthRecovery] : undefined;
  const recoveryPath = recoveryKind === "chat" ? "google-chat" : recoveryKind === "gmail" ? "gmail" : recoveryKind === "calendar" ? "google-calendar" : recoveryKind === "google" ? "google" : undefined;
  const retryParams = new URLSearchParams();
  if (oauthRecovery !== "legacy_identity_unknown" && searchParams.get("credentialId")) retryParams.set("credentialId", searchParams.get("credentialId")!);
  if (recoveryKind === "gmail" && searchParams.get("capabilities")) retryParams.set("capabilities", searchParams.get("capabilities")!);
  const retryQuery = retryParams.toString();
  const recoveryWorkspace = searchParams.get("workspace");
  const showRecovery = Boolean(recoveryMessage && (!recoveryWorkspace || recoveryWorkspace === workspaceId));

  const switchWorkspace = (nextWorkspaceId: string) => {
    setWorkspaceId(nextWorkspaceId);
    router.replace(`/dashboard/connections?workspace=${encodeURIComponent(nextWorkspaceId)}`);
  };

  if (isLoading) {
    return (
      <main className="dashboard-loading connections-loading" aria-busy="true">
        <Skeleton className="connections-loading__mark" />
        <strong>Preparing connections</strong>
        <span>Loading workspace access and encrypted connection summaries…</span>
      </main>
    );
  }

  return (
    <main className="dashboard-page connections-page">
      <AppShellHeader workspaces={workspaces} workspaceId={workspaceId} onWorkspaceChange={switchWorkspace} active="connections" />
      <section className="connections-main">
        <PageHeader
          eyebrow={activeWorkspace?.name ?? "CONNECTIONS"}
          title="Connections"
          description="Manage app accounts and credentials shared by your workflows."
          actions={<Button variant="secondary" onClick={() => router.push("/dashboard")}><ArrowLeft size={15} /> Dashboard</Button>}
        />
        {error ? <Status tone="error" className="connections-error">{error}<Button variant="ghost" onClick={() => window.location.reload()}>Retry</Button></Status> : null}
        {!error && showRecovery && activeWorkspace ? (
          <Status tone="error" className="connections-oauth-error">
            <div><strong>Google connection needs another try</strong><p>{recoveryMessage} Any existing connection was not changed.</p></div>
            <div className="connections-oauth-error__actions">
              {recoveryPath ? <Button variant="secondary" onClick={() => window.location.assign(`${apiUrl}/workspaces/${encodeURIComponent(workspaceId)}/credentials/${recoveryPath}/connect${retryQuery ? `?${retryQuery}` : ""}`)}>{oauthRecovery === "legacy_identity_unknown" ? "Add new connection" : "Try Google again"}</Button> : null}
              <Button variant="ghost" onClick={() => router.replace(`/dashboard/connections?workspace=${encodeURIComponent(workspaceId)}`)}>Dismiss</Button>
            </div>
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
