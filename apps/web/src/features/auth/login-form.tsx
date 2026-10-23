"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { apiUrl } from "../api/api-client";

type AuthMode = "login" | "register";
type AuthResponse = { user?: { email: string }; message?: string | { message?: string } };

export function LoginForm() {
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [googleAvailable, setGoogleAvailable] = useState(false);

  useEffect(() => {
    const parameters = new URLSearchParams(window.location.search);
    if (parameters.get("authError") === "google_cancelled") setError("Google sign-in was cancelled. You can try again when ready.");
    void fetch(`${apiUrl}/auth/providers`, { credentials: "include" })
      .then(async (response): Promise<{ google?: boolean }> => response.ok ? await response.json() as { google?: boolean } : {})
      .then((providers) => setGoogleAvailable(providers.google === true))
      .catch(() => setGoogleAvailable(false));
  }, []);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const response = await fetch(`${apiUrl}/auth/${mode === "login" ? "login" : "register"}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mode === "login" ? { email, password } : { email, password, displayName }),
      });
      const body = await response.json().catch(() => ({})) as AuthResponse;
      if (!response.ok || !body.user) {
        const message = typeof body.message === "string" ? body.message : body.message?.message;
        throw new Error(message ?? "We could not complete your request. Please try again.");
      }
      router.push("/dashboard");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "We could not complete your request.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="auth-page">
      <section className="auth-showcase" aria-label="Product introduction">
        <span className="auth-brand-mark">✦</span>
        <p className="auth-eyebrow">WORKFLOW AUTOMATION</p>
        <h1>Build dependable work, visually.</h1>
        <p>Connect the tasks you repeat every day, keep every execution visible, and stay in control of your data.</p>
        <div className="auth-flow-preview" aria-hidden="true">
          <span>Schedule</span><i /> <span>Steam</span><i /> <span>Google Chat</span>
        </div>
      </section>
      <section className="auth-panel">
        <div className="auth-card">
          <p className="auth-eyebrow">WELCOME</p>
          <h2>{mode === "login" ? "Sign in to your workspace" : "Create your workspace"}</h2>
          <p className="auth-subtitle">{mode === "login" ? "Continue building your workflow." : "Your personal automation space starts here."}</p>
          <form onSubmit={submit}>
            {mode === "register" && <label className="auth-field"><span>Name</span><input autoComplete="name" onChange={(event) => setDisplayName(event.target.value)} value={displayName} /></label>}
            <label className="auth-field"><span>Email</span><input autoComplete="email" onChange={(event) => setEmail(event.target.value)} required type="email" value={email} /></label>
            <label className="auth-field"><span>Password</span><input autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={mode === "register" ? 12 : 1} onChange={(event) => setPassword(event.target.value)} required type="password" value={password} /></label>
            {mode === "register" && <p className="auth-help">Use at least 12 characters. Your password is stored as an Argon2id hash.</p>}
            {error && <p className="auth-error" role="alert">{error}</p>}
            <button className="auth-submit" disabled={isSubmitting} type="submit">{isSubmitting ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}</button>
          </form>
          <div className="auth-divider"><span>or continue with</span></div>
          <div className="auth-oauth-actions">
            <button disabled={!googleAvailable} onClick={() => window.location.assign(`${apiUrl}/auth/google/start`)} type="button">Google <small>{googleAvailable ? "Continue securely" : "Configure server"}</small></button>
            <button disabled type="button">GitHub <small>Coming soon</small></button>
          </div>
          <p className="auth-switch">{mode === "login" ? "New here?" : "Already have an account?"} <button onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(null); }} type="button">{mode === "login" ? "Create an account" : "Sign in"}</button></p>
        </div>
      </section>
    </main>
  );
}
