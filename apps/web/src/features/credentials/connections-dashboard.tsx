"use client";

import { ArrowLeft, KeyRound, LayoutDashboard, LogOut, PlugZap } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { apiRequest } from "../api/api-client";
import { ThemeToggle } from "../theme/theme-toggle";
import { Button, EmptyState, IconButton, PageHeader, Select, Skeleton, Status } from "../../components/ui";
import { CredentialManager } from "./credential-panel";

type WorkspaceSummary = { id: string; name: string; slug: string; role: "OWNER" | "EDITOR" | "VIEWER" };
type CurrentUser = { email: string; displayName: string | null };

export function ConnectionsDashboard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [workspaceId, setWorkspaceId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const [auth, workspaceResponse] = await Promise.all([
          apiRequest<{ user: CurrentUser }>("/auth/me"),
          apiRequest<{ workspaces: WorkspaceSummary[] }>("/workspaces"),
        ]);
        if (!active) return;
        setUser(auth.user);
        setWorkspaces(workspaceResponse.workspaces);
        const requestedWorkspace = searchParams.get("workspace");
        const initialWorkspace = workspaceResponse.workspaces.find((workspace) => workspace.id === requestedWorkspace) ?? workspaceResponse.workspaces[0];
        setWorkspaceId(initialWorkspace?.id ?? "");
      } catch (reason) {
        if (!active) return;
        const message = reason instanceof Error ? reason.message : "Unable to load connections.";
        if (message === "Sign in is required." || message === "Your session has expired.") router.replace("/");
        else setError(message);
      } finally {
        if (active) setIsLoading(false);
      }
    })();
    return () => { active = false; };
  }, [router, searchParams]);

  const activeWorkspace = useMemo(() => workspaces.find((workspace) => workspace.id === workspaceId), [workspaceId, workspaces]);

  const switchWorkspace = (nextWorkspaceId: string) => {
    setWorkspaceId(nextWorkspaceId);
    router.replace(`/dashboard/connections?workspace=${encodeURIComponent(nextWorkspaceId)}`);
  };

  const logout = async () => {
    await apiRequest("/auth/logout", { method: "POST" }).catch(() => undefined);
    router.replace("/");
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
      <header className="dashboard-header">
        <button className="dashboard-brand" type="button" onClick={() => router.push("/dashboard")}>
          <span><PlugZap size={17} /></span><strong>Workflow Automation</strong>
        </button>
        <div className="dashboard-header__workspace">
          <label htmlFor="connections-workspace">Workspace</label>
          <Select id="connections-workspace" value={workspaceId} onChange={(event) => switchWorkspace(event.target.value)} disabled={workspaces.length === 0}>
            {workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}
          </Select>
        </div>
        <div className="dashboard-header__user">
          <span>{user?.displayName ?? user?.email ?? "Owner"}</span>
          <Button variant="ghost" className="dashboard-header__link" onClick={() => router.push(workspaceId ? `/dashboard/executions?workspace=${encodeURIComponent(workspaceId)}` : "/dashboard/executions")}>
            <LayoutDashboard size={15} /> Executions
          </Button>
          <ThemeToggle />
          <IconButton label="Sign out" onClick={() => void logout()}><LogOut size={16} /></IconButton>
        </div>
      </header>
      <section className="connections-main">
        <PageHeader
          eyebrow={activeWorkspace?.name ?? "CONNECTIONS"}
          title="Connections"
          description="Create and maintain the encrypted accounts, keys, and webhooks that your workflows can use. Secret values are never shown after saving."
          actions={<Button variant="secondary" onClick={() => router.push("/dashboard")}><ArrowLeft size={15} /> Dashboard</Button>}
        />
        {error ? <Status tone="error" className="connections-error">{error}<Button variant="ghost" onClick={() => window.location.reload()}>Retry</Button></Status> : null}
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
