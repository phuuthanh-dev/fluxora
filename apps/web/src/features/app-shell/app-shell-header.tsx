"use client";

import { History, LayoutDashboard, LogOut, PlugZap, Settings } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { apiRequest, apiUrl } from "../api/api-client";
import { ThemeToggle } from "../theme/theme-toggle";
import { Button, Menu, Select } from "../../components/ui";
import { BrandLockup } from "../../components/brand/brand-lockup";
import { NodeIcon } from "../workflow/node-icon";
import { WorkspaceSidebar } from "./workspace-sidebar";
import { loginHref } from "../auth/auth-redirect";

export type AppShellWorkspace = { id: string; name: string; slug: string; role: "OWNER" | "EDITOR" | "VIEWER" };
type Identity = { provider: "GOOGLE" | "GITHUB" | "STEAM"; providerAccountId: string };
type ProviderStatus = { google: boolean; github: boolean; steam: boolean };
type User = { email: string; displayName: string | null; avatarColor: "lime" | "violet" | "sky" | "coral" };

type AppShellHeaderProps = {
  workspaces: AppShellWorkspace[];
  workspaceId: string;
  onWorkspaceChange: (workspaceId: string) => void;
  active: "dashboard" | "connections" | "executions" | "editor" | "account" | "admin";
  onBeforeNavigate?: () => boolean;
};

function providerLabel(provider: Identity["provider"]) {
  return provider === "GOOGLE" ? "Google" : provider === "GITHUB" ? "GitHub" : "Steam";
}

function avatarInitials(user: User | null) {
  const source = user?.displayName?.trim() || user?.email || "U";
  const words = source.split(/\s+/).filter(Boolean);
  return words.length > 1 ? `${words[0]?.[0] ?? ""}${words.at(-1)?.[0] ?? ""}`.toLocaleUpperCase() : source.slice(0, 2).toLocaleUpperCase();
}

export function AppShellHeader({ workspaces, workspaceId, onWorkspaceChange, active, onBeforeNavigate }: AppShellHeaderProps) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [identities, setIdentities] = useState<Identity[]>([]);
  const [providers, setProviders] = useState<ProviderStatus>({ google: false, github: false, steam: false });
  const [unlinking, setUnlinking] = useState<Identity["provider"] | null>(null);
  const [identityError, setIdentityError] = useState<string | null>(null);
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const expired = () => { if (onBeforeNavigate?.() !== false) router.replace(loginHref(window.location)); };
    window.addEventListener("fluxora:unauthenticated", expired);
    return () => window.removeEventListener("fluxora:unauthenticated", expired);
  }, [router, onBeforeNavigate]);

  useEffect(() => {
    let activeRequest = true;
    void Promise.all([
      apiRequest<{ user: User }>("/auth/me"),
      apiRequest<{ identities: Identity[] }>("/auth/identities", undefined, { silentUnauthorized: true }),
      apiRequest<ProviderStatus>("/auth/providers"),
    ]).then(([auth, identityResponse, providerResponse]) => {
      if (!activeRequest) return;
      setUser(auth.user);
      setIdentities(identityResponse.identities);
      setProviders(providerResponse);
    }).catch(() => undefined);
    return () => { activeRequest = false; };
  }, []);

  useEffect(() => {
    let active = true;
    void apiRequest("/admin/access", undefined, { silentUnauthorized: true }).then(() => { if (active) setIsAdmin(true); }).catch(() => undefined);
    return () => { active = false; };
  }, []);

  const logout = async () => {
    if (onBeforeNavigate?.() === false) return;
    setLogoutError(null);
    setLoggingOut(true);
    try {
      await apiRequest("/auth/logout", { method: "POST" });
      router.replace("/login");
    } catch {
      setLogoutError("Could not sign out. Check your connection and try again.");
      setLoggingOut(false);
    }
  };
  const unlink = async (provider: Identity["provider"]) => {
    setUnlinking(provider);
    setIdentityError(null);
    try {
      const response = await apiRequest<{ identities: Identity[] }>(`/auth/identities/${provider.toLowerCase()}`, { method: "DELETE" });
      setIdentities(response.identities);
    } catch (reason) {
      setIdentityError(reason instanceof Error ? reason.message : "Could not unlink this account.");
    } finally {
      setUnlinking(null);
    }
  };
  const navPath = (target: "dashboard" | "connections" | "executions") => target === "dashboard" ? `/dashboard?workspace=${encodeURIComponent(workspaceId)}` : `/dashboard/${target}?workspace=${encodeURIComponent(workspaceId)}`;
  const navigate = (path: string) => { if (onBeforeNavigate?.() !== false) router.push(path); };

  const workspacePicker = <label className="app-shell-workspace" htmlFor="app-shell-workspace"><span>Workspace</span><Select id="app-shell-workspace" value={workspaceId} disabled={workspaces.length === 0} onChange={(event) => { if (onBeforeNavigate?.() !== false) onWorkspaceChange(event.target.value); }}>{workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}</Select></label>;
  const accountMenu = <Menu label="Account" trigger={<><span className={`app-shell-avatar app-shell-avatar--${user?.avatarColor ?? "lime"}`} aria-hidden="true">{avatarInitials(user)}</span><span className="sidebar-account-copy"><strong>{user?.displayName ?? "Your account"}</strong><span>Account & preferences</span></span></>} className="app-shell-account-menu">
          <div className="app-shell-account-menu__user"><strong>{user?.displayName ?? "Your account"}</strong>{user?.email && <span>{user.email}</span>}</div>
          <Button variant="ghost" className="app-shell-account-menu__link" onClick={() => navigate(`/settings/account?workspace=${encodeURIComponent(workspaceId)}`)}><Settings size={15} /> Account settings</Button>
          {isAdmin && <Button variant="ghost" className="app-shell-account-menu__link" onClick={() => navigate("/admin")}>Platform administration</Button>}
          <div className="app-shell-account-menu__identities">
            <p className="app-shell-account-menu__section">Sign-in methods</p>
            {identityError && <p role="alert">{identityError}</p>}
            {identities.length ? identities.map((identity) => (
              <div className="app-shell-account-menu__identity" key={identity.provider}>
                <span className="app-shell-account-menu__provider">
                  <span className="app-shell-account-menu__provider-icon" aria-hidden="true"><NodeIcon name={identity.provider.toLowerCase() as "google" | "github" | "steam"} size={17} /></span>
                  <span><strong>{providerLabel(identity.provider)}</strong><small>Linked</small></span>
                </span>
                <Button variant="ghost" data-menu-keep-open aria-label={`Unlink ${providerLabel(identity.provider)}`} disabled={unlinking === identity.provider} onClick={(event) => { event.currentTarget.closest("details")?.querySelector("summary")?.focus(); void unlink(identity.provider); }}>{unlinking === identity.provider ? "Unlinking…" : "Unlink"}</Button>
              </div>
            )) : <p>No external identities linked.</p>}
            {!identities.some((identity) => identity.provider === "STEAM") && <div className="app-shell-account-menu__identity">
              <span className="app-shell-account-menu__provider"><span className="app-shell-account-menu__provider-icon" aria-hidden="true"><NodeIcon name="steam" size={17} /></span><span><strong>Steam</strong><small>Not linked</small></span></span>
              <Button variant="ghost" disabled={!providers.steam} onClick={() => { if (onBeforeNavigate?.() !== false) window.location.assign(`${apiUrl}/auth/steam/connect`); }}>{providers.steam ? "Link Steam" : "Steam setup"}</Button>
            </div>}
          </div>
          <hr className="app-shell-account-menu__divider" />
          {logoutError && <p role="alert">{logoutError}</p>}
          <Button variant="ghost" data-menu-keep-open className="app-shell-account-menu__sign-out" disabled={loggingOut} onClick={(event) => { event.currentTarget.closest("details")?.querySelector("summary")?.focus(); void logout(); }}><LogOut size={14} /> {loggingOut ? "Signing out…" : "Sign out"}</Button>
        </Menu>;

  if (active !== "editor") return <WorkspaceSidebar active={active} workspaceId={workspaceId} workspacePicker={workspacePicker} accountMenu={accountMenu} navigate={navigate} />;

  return (
    <header className="app-shell-header">
      <button className="app-shell-brand" type="button" aria-label="Fluxora home" onClick={() => navigate(navPath("dashboard"))}><BrandLockup /></button>
      <div className="app-shell-navigation">
        {workspacePicker}
        <nav aria-label="Workspace navigation">
          <Button variant="ghost" className="app-shell-nav-link" onClick={() => navigate(navPath("dashboard"))}><LayoutDashboard size={15} /> Dashboard</Button>
          <Button variant="ghost" className="app-shell-nav-link" onClick={() => navigate(navPath("connections"))}><PlugZap size={15} /> Connections</Button>
          <Button variant="ghost" className="app-shell-nav-link" onClick={() => navigate(navPath("executions"))}><History size={15} /> Executions</Button>
        </nav>
      </div>
      <div className="app-shell-account">
        <ThemeToggle />
        {accountMenu}
      </div>
    </header>
  );
}
