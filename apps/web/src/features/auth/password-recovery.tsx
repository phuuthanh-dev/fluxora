"use client";

import Link from "next/link";
import { FormEvent, useEffect, useRef, useState } from "react";
import { ArrowLeft, Check, KeyRound, LoaderCircle, Mail } from "lucide-react";
import { Button, Field } from "../../components/ui";
import { apiRequest, ApiClientError } from "../api/api-client";
import { AuthNavigation } from "./auth-navigation";
import { PasswordField } from "./password-field";

export function PasswordRecovery({ reset = false }: { reset?: boolean }) {
  const [available, setAvailable] = useState<boolean | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const captured = useRef(false);
  const locked = useRef(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const statusRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!reset) return;
    function capture() {
      if (locked.current || (!window.location.hash && captured.current)) return;
      captured.current = true;
      const value = new URLSearchParams(window.location.hash.slice(1)).get("token") ?? "";
      setToken(/^[A-Za-z0-9_-]{43}$/.test(value) ? value : "");
      setDone(false); setInvalid(false); setError(null); setPassword(""); setConfirm("");
      window.history.replaceState(window.history.state, "", window.location.pathname);
    }
    capture();
    window.addEventListener("hashchange", capture);
    return () => window.removeEventListener("hashchange", capture);
  }, [reset, pending]);
  useEffect(() => {
    if (reset) return;
    const controller = new AbortController();
    void apiRequest<{ available: boolean }>("/auth/password/recovery", { signal: controller.signal }).then(result => setAvailable(result.available)).catch(() => { if (!controller.signal.aborted) setAvailable(false); });
    return () => controller.abort();
  }, [reset]);
  useEffect(() => { if (done || invalid) statusRef.current?.focus(); }, [done, invalid]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (locked.current) return;
    setError(null);
    if (reset && password !== confirm) { setError("The passwords do not match."); return; }
    locked.current = true;
    setPending(true);
    try {
      await apiRequest(reset ? "/auth/password/reset" : "/auth/password/forgot", { method: "POST", body: JSON.stringify(reset ? { token, password } : { email }) });
      setPassword(""); setConfirm(""); setToken(""); setDone(true);
    } catch (reason) {
      if (reason instanceof ApiClientError && reason.code === "RESET_LINK_INVALID") { setInvalid(true); setToken(""); }
      else setError(reason instanceof Error ? reason.message : "Please try again.");
    } finally { locked.current = false; setPending(false); }
  }

  const noToken = reset && token !== null && !token && !done;
  const title = done ? (reset ? "Your password is updated" : "Check your inbox") : (noToken || invalid) ? "Request a fresh link" : reset ? "Choose a new password" : "Forgot your password?";
  return <main className="auth-page auth-page--recovery">
    <AuthNavigation />
    <section className="auth-panel" aria-labelledby="recovery-title">
      <div className="auth-card recovery-card">
        <span className="recovery-symbol" aria-hidden="true">{done ? <Check size={25} /> : reset ? <KeyRound size={25} /> : <Mail size={25} />}</span>
        <p className="auth-eyebrow">ACCOUNT ACCESS</p>
        <h1 id="recovery-title">{title}</h1>
        {done ? <div ref={statusRef} tabIndex={-1} className="recovery-status" role="status">
          <p>{reset ? "Your existing sessions have been signed out. Sign in with your new password to continue." : "If an account matches that email, a reset link will arrive shortly. Check your spam folder too. The link is valid for 30 minutes."}</p>
          {!reset && <p>No email yet? Wait a minute, then <button className="account-text-button" onClick={() => setDone(false)}>try again</button> or <Link href="/support">contact support</Link>.</p>}
        </div> : noToken || invalid ? <div ref={statusRef} tabIndex={-1} className="recovery-status" role="status"><p>This reset link is missing, expired, or already used. Request another link to continue.</p><Link href="/forgot-password">Request a new reset link</Link></div> : <>
          <p className="auth-subtitle">{reset ? "Use 12–128 characters. Changing your password signs out all existing sessions." : "Enter your account email and we’ll send a link to reset your password."}</p>
          {!reset && available === null ? <p role="status"><LoaderCircle className="ui-spinner" size={16} /> Checking email availability…</p> : !reset && !available ? <p className="auth-error" role="alert">Password recovery is currently unavailable. <Link href="/support">Contact support</Link> or use your linked Google or GitHub sign-in.</p> : reset && token === null ? <p role="status">Checking reset link…</p> : <form onSubmit={submit} aria-busy={pending}>
            {reset ? <><PasswordField label="New password" value={password} onChange={setPassword} disabled={pending} /><PasswordField label="Confirm new password" value={confirm} onChange={setConfirm} disabled={pending} /></> : <Field className="auth-field" label="Email"><input type="email" autoComplete="email" maxLength={320} value={email} onChange={event => setEmail(event.target.value)} disabled={pending} required placeholder="you@example.com" /></Field>}
            {error && <p className="auth-error" role="alert">{error}</p>}
            <Button type="submit" variant="primary" className="auth-submit" disabled={pending}>{pending && <LoaderCircle className="ui-spinner" size={16} />}{pending ? "Please wait…" : reset ? "Reset password" : "Send reset link"}</Button>
          </form>}
        </>}
        <Link className="recovery-back" href="/login"><ArrowLeft size={15} aria-hidden="true" />Back to sign in</Link>
      </div>
    </section>
  </main>;
}
