"use client";

import { History, LayoutDashboard, LogOut, PlugZap } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { apiRequest, apiUrl } from "../api/api-client";
import { ThemeToggle } from "../theme/theme-toggle";
import { Button, Menu, Select } from "../../components/ui";
import { BrandLockup } from "../../components/brand/brand-lockup";

export type AppShellWorkspace = { id: string; name: string; slug: string; role: "OWNER" | "EDITOR" | "VIEWER" };
type Identity = { provider: "GOOGLE" | "GITHUB" | "STEAM"; providerAccountId: string };
type ProviderStatus = { google: boolean; github: boolean; steam: boolean };
type User = { email: string; displayName: string | null; avatarColor: "lime" | "violet" | "sky" | "coral" };

type AppShellHeaderProps = {
  workspaces: AppShellWorkspace[];
  workspaceId: string;
  onWorkspaceChange: (workspaceId: string) => void;
  active: "dashboard" | "connections" | "executions" | "editor";
};

function providerLabel(provider: Identity["provider"]) {
  return provider === "GOOGLE" ? "Google" : provider === "GITHUB" ? "GitHub" : "Steam";
}

function avatarInitials(user: User | null) {
  const source = user?.displayName?.trim() || user?.email || "U";
  const words = source.split(/\s+/).filter(Boolean);
  return words.length > 1 ? `${words[0]?.[0] ?? ""}${words.at(-1)?.[0] ?? ""}`.toLocaleUpperCase() : source.slice(0, 2).toLocaleUpperCase();
}

export function AppShellHeader({ workspaces, workspaceId, onWorkspaceChange, active }: AppShellHeaderProps) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [identities, setIdentities] = useState<Identity[]>([]);
  const [providers, setProviders] = useState<ProviderStatus>({ google: false, github: false, steam: false });
  const [unlinking, setUnlinking] = useState<Identity["provider"] | null>(null);

  useEffect(() => {
    let activeRequest = true;
    void Promise.all([
      apiRequest<{ user: User }>("/auth/me"),
      apiRequest<{ identities: Identity[] }>("/auth/identities"),
      apiRequest<ProviderStatus>("/auth/providers"),
    ]).then(([auth, identityResponse, providerResponse]) => {
      if (!activeRequest) return;
      setUser(auth.user);
      setIdentities(identityResponse.identities);
      setProviders(providerResponse);
    }).catch(() => undefined);
    return () => { activeRequest = false; };
  }, []);

  const logout = async () => {
    await apiRequest("/auth/logout", { method: "POST" }).catch(() => undefined);
    router.replace("/login");
  };
  const unlink = async (provider: Identity["provider"]) => {
    setUnlinking(provider);
    try {
      const response = await apiRequest<{ identities: Identity[] }>(`/auth/identities/${provider.toLowerCase()}`, { method: "DELETE" });
      setIdentities(response.identities);
    } finally {
      setUnlinking(null);
    }
  };
  const navPath = (target: "dashboard" | "connections" | "executions") => target === "dashboard" ? `/dashboard?workspace=${encodeURIComponent(workspaceId)}` : `/dashboard/${target}?workspace=${encodeURIComponent(workspaceId)}`;

  return (
    <header className="app-shell-header">
      <button className="app-shell-brand" type="button" aria-label="Fluxora home" onClick={() => router.push(navPath("dashboard"))}><BrandLockup /></button>
      <div className="app-shell-navigation">
        <label className="app-shell-workspace" htmlFor="app-shell-workspace"><span>Workspace</span><Select id="app-shell-workspace" value={workspaceId} disabled={workspaces.length === 0} onChange={(event) => onWorkspaceChange(event.target.value)}>{workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}</Select></label>
        <nav aria-label="Workspace navigation">
          <Button variant="ghost" className={`app-shell-nav-link${active === "dashboard" ? " is-active" : ""}`} aria-current={active === "dashboard" ? "page" : undefined} onClick={() => router.push(navPath("dashboard"))}><LayoutDashboard size={15} /> Dashboard</Button>
          <Button variant="ghost" className={`app-shell-nav-link${active === "connections" ? " is-active" : ""}`} aria-current={active === "connections" ? "page" : undefined} onClick={() => router.push(navPath("connections"))}><PlugZap size={15} /> Connections</Button>
          <Button variant="ghost" className={`app-shell-nav-link${active === "executions" ? " is-active" : ""}`} aria-current={active === "executions" ? "page" : undefined} onClick={() => router.push(navPath("executions"))}><History size={15} /> Executions</Button>
        </nav>
      </div>
      <div className="app-shell-account">
        <ThemeToggle />
        <Menu label="Account" trigger={<span className={`app-shell-avatar app-shell-avatar--${user?.avatarColor ?? "lime"}`} aria-hidden="true">{avatarInitials(user)}</span>} className="app-shell-account-menu">
          <p className="app-shell-account-menu__user">{user?.displayName ?? user?.email ?? "Your account"}</p>
          {identities.length ? identities.map((identity) => <div key={identity.provider}><span>{providerLabel(identity.provider)}{identity.provider === "STEAM" ? " linked" : ""}</span><Button variant="ghost" disabled={unlinking === identity.provider} onClick={() => void unlink(identity.provider)}>{unlinking === identity.provider ? "Unlinking…" : "Unlink"}</Button></div>) : <p>No external identities linked.</p>}
          {!identities.some((identity) => identity.provider === "STEAM") && <Button variant="ghost" disabled={!providers.steam} onClick={() => window.location.assign(`${apiUrl}/auth/steam/connect`)}>{providers.steam ? "Link Steam" : "Steam setup"}</Button>}
          <hr className="app-shell-account-menu__divider" />
          <Button variant="ghost" className="app-shell-account-menu__sign-out" onClick={() => void logout()}><LogOut size={14} /> Sign out</Button>
        </Menu>
      </div>
    </header>
  );
}
