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
  const googleRefreshMissing = (oauthRecovery === "missing_refresh" || oauthRecovery === "chat_missing_refresh" || oauthRecovery === "gmail_missing_refresh") && searchParams.get("workspace") === workspaceId;

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
        {!error && googleRefreshMissing && activeWorkspace ? (
          <Status tone="error" className="connections-oauth-error">
            <div>
              <strong>{oauthRecovery === "chat_missing_refresh" ? "Google Chat" : oauthRecovery === "gmail_missing_refresh" ? "Gmail" : "Google"} connection needs another try</strong>
              <p>Google did not return a refresh token. Any existing connection was not changed. Try connecting again to allow workflows to run when you are away.</p>
            </div>
            <div className="connections-oauth-error__actions">
              <Button variant="secondary" onClick={() => window.location.assign(`${apiUrl}/workspaces/${encodeURIComponent(workspaceId)}/credentials/${oauthRecovery === "chat_missing_refresh" ? "google-chat" : oauthRecovery === "gmail_missing_refresh" ? "gmail" : "google"}/connect`)}>Try Google again</Button>
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
