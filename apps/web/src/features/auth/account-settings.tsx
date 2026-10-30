"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useRef, useState } from "react";
import { Check, KeyRound, LoaderCircle, Monitor, ShieldCheck, UserRound } from "lucide-react";
import { Button, Field, PageHeader } from "../../components/ui";
import { ApiClientError, apiRequest } from "../api/api-client";
import { AppShellHeader, type AppShellWorkspace } from "../app-shell/app-shell-header";
import { PasswordField } from "./password-field";

type Account = { id: string; email: string; displayName: string | null; hasPassword: boolean };
type Session = { id: string; current: boolean; createdAt: string; expiresAt: string };
type Identity = { provider: "GOOGLE" | "GITHUB" | "STEAM" };
const identityName = { GOOGLE: "Google", GITHUB: "GitHub", STEAM: "Steam" };

export function AccountSettings() {
  const router = useRouter();
  const [user, setUser] = useState<Account | null>(null);
  const [name, setName] = useState("");
  const [workspaces, setWorkspaces] = useState<AppShellWorkspace[]>([]);
  const [workspace, setWorkspace] = useState("");
  const [sessions, setSessions] = useState<Session[]>([]);
  const [identities, setIdentities] = useState<Identity[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const locked = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [attempt, setAttempt] = useState(0);
  const errorRef = useRef<HTMLParagraphElement>(null);

  function fail(reason: unknown) {
    if (reason instanceof ApiClientError && ["UNAUTHENTICATED", "PASSWORD_CHANGED"].includes(reason.code ?? "")) router.replace("/login");
    else setError(reason instanceof Error ? reason.message : "Please try again.");
  }
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(null);
    void Promise.all([
      apiRequest<{ user: Account }>("/auth/account", { signal: controller.signal }),
      apiRequest<{ workspaces: AppShellWorkspace[] }>("/workspaces", { signal: controller.signal }),
      apiRequest<{ sessions: Session[] }>("/auth/account/sessions", { signal: controller.signal }),
      apiRequest<{ identities: Identity[] }>("/auth/identities", { signal: controller.signal }),
    ]).then(([account, spaces, active, linked]) => {
      if (controller.signal.aborted) return;
      setUser(account.user); setName(account.user.displayName ?? ""); setWorkspaces(spaces.workspaces);
      const requested = new URLSearchParams(window.location.search).get("workspace");
      setWorkspace(spaces.workspaces.find(item => item.id === requested)?.id ?? spaces.workspaces[0]?.id ?? "");
      setSessions(active.sessions); setIdentities(linked.identities);
    }).catch(reason => { if (!controller.signal.aborted) fail(reason); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
    // Only explicit retry reloads this account snapshot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);
  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);

  async function perform(key: string, action: () => Promise<void>) {
    if (locked.current) return;
    locked.current = true; setBusy(key); setError(null); setNotice(null);
    try { await action(); } catch (reason) { fail(reason); } finally { locked.current = false; setBusy(null); }
  }
  function saveName(event: FormEvent) {
    event.preventDefault();
    void perform("profile", async () => {
      const result = await apiRequest<{ user: Account }>("/auth/account", { method: "PATCH", body: JSON.stringify({ displayName: name.trim() }) });
      setUser(result.user); setName(result.user.displayName ?? ""); setNotice("Your profile has been updated.");
    });
  }
  function changePassword(event: FormEvent) {
    event.preventDefault();
    if (password !== confirm) { setError("The passwords do not match."); return; }
    void perform("password", async () => {
      await apiRequest("/auth/account/password", { method: "POST", body: JSON.stringify({ currentPassword, password }) });
      setCurrentPassword(""); setPassword(""); setConfirm("");
      router.replace("/login?passwordChanged=1");
    });
  }
  function revoke(id?: string) {
    void perform(id ?? "sessions", async () => {
      const result = await apiRequest<{ current: boolean }>(id ? `/auth/account/sessions/${encodeURIComponent(id)}` : "/auth/account/sessions/revoke-others", { method: id ? "DELETE" : "POST" });
      if (result.current) { router.replace("/login"); return; }
      const active = await apiRequest<{ sessions: Session[] }>("/auth/account/sessions");
      setSessions(active.sessions); setNotice(id ? "Session signed out." : "Other sessions signed out. This session is still active.");
    });
  }
  return <main className="dashboard-page account-page">
    <AppShellHeader key={user?.displayName} workspaces={workspaces} workspaceId={workspace} onWorkspaceChange={setWorkspace} active="account" />
    <div className="account-content">
      <PageHeader eyebrow="SETTINGS" title="Your account" description="Manage your profile, password, and signed-in sessions." />
      {error && <p ref={errorRef} tabIndex={-1} className="auth-error" role="alert">{error}</p>}
      {notice && <p className="account-notice" role="status"><Check size={16} />{notice}</p>}
      {loading ? <p className="account-loading" role="status"><LoaderCircle className="ui-spinner" size={20} />Loading account…</p> : !user ? <Button onClick={() => setAttempt(value => value + 1)}>Try again</Button> : <div className="account-grid" aria-busy={Boolean(busy)}>
        <section className="account-section" aria-labelledby="profile-heading">
          <div className="account-section__heading"><UserRound size={19} /><div><h2 id="profile-heading">Profile</h2><p>How you appear in your workspace.</p></div></div>
          <form onSubmit={saveName}>
            <Field label="Display name" className="auth-field"><input autoComplete="name" required maxLength={80} value={name} onChange={event => setName(event.target.value)} disabled={Boolean(busy)} /></Field>
            <Field label="Email address" className="auth-field" hint="Your account email cannot be changed here."><input type="email" value={user.email} readOnly /></Field>
            <Button type="submit" variant="primary" disabled={Boolean(busy) || !name.trim() || name.trim() === user.displayName}>{busy === "profile" ? "Saving…" : "Save profile"}</Button>
          </form>
        </section>
        <section className="account-section" aria-labelledby="password-heading">
          <div className="account-section__heading"><KeyRound size={19} /><div><h2 id="password-heading">Password</h2><p>Updating your password signs out all sessions, including this one.</p></div></div>
          {user.hasPassword ? <form onSubmit={changePassword}>
            <PasswordField label="Current password" current value={currentPassword} onChange={setCurrentPassword} disabled={Boolean(busy)} />
            <PasswordField label="New password" value={password} onChange={setPassword} disabled={Boolean(busy)} />
            <PasswordField label="Confirm new password" value={confirm} onChange={setConfirm} disabled={Boolean(busy)} />
            <p className="auth-help">Use 12–128 characters.</p>
            <Button type="submit" disabled={Boolean(busy)}>{busy === "password" ? "Updating…" : "Update password & sign out"}</Button>
          </form> : <div className="account-callout"><p>You currently use a linked provider to sign in. To add a password, verify access to your account email through password recovery.</p><Link href="/forgot-password">Set a password by email</Link></div>}
        </section>
        <section className="account-section account-section--wide" aria-labelledby="sessions-heading">
          <div className="account-section__heading"><Monitor size={19} /><div><h2 id="sessions-heading">Active sessions <span className="account-count">{sessions.length}</span></h2><p>Sign out a session you no longer need. Times are shown in your local timezone.</p></div>
            <Button disabled={Boolean(busy) || !sessions.some(item => !item.current)} onClick={() => revoke()}>{busy === "sessions" ? "Signing out…" : "Sign out other sessions"}</Button>
          </div>
          <ul className="account-session-list">{sessions.map((session, index) => <li key={session.id}>
            <Monitor size={18} aria-hidden="true" /><div><strong>{session.current ? "This session" : `Session ${index + 1}`}</strong><p>Signed in {new Date(session.createdAt).toLocaleString()}<span>Expires {new Date(session.expiresAt).toLocaleString()}</span></p></div>
            {session.current ? <span className="account-badge">Current</span> : <Button variant="ghost" disabled={Boolean(busy)} aria-label={`Sign out session ${index + 1}`} onClick={() => revoke(session.id)}>{busy === session.id ? "Signing out…" : "Sign out"}</Button>}
          </li>)}</ul>
          {!sessions.length && <p>No active sessions found. <Link href="/login">Sign in again</Link>.</p>}
        </section>
        <section className="account-section account-section--wide" aria-labelledby="identities-heading">
          <div className="account-section__heading"><ShieldCheck size={19} /><div><h2 id="identities-heading">Linked accounts</h2><p>These belong to your profile. App credentials for workflows are managed in Connections.</p></div></div>
          <div className="account-linked">{identities.length ? identities.map(identity => <span className="account-badge" key={identity.provider}><Check size={14} />{identityName[identity.provider]} {identity.provider === "STEAM" ? "linked" : "sign-in"}</span>) : <p>No external accounts linked.</p>}</div>
          <p className="account-section__note">Use the avatar menu to manage existing links.</p>
        </section>
      </div>}
    </div>
  </main>;
}
