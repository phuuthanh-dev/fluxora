"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { FormEvent, useEffect, useRef, useState } from "react";
import { ArrowRight, Check, Clock3, Eye, EyeOff, LoaderCircle } from "lucide-react";
import { apiUrl } from "../api/api-client";
import { ThemeToggle } from "../theme/theme-toggle";
import { Button, Field, IconButton } from "../../components/ui";
import { useSurfaceMotion } from "../../components/ui/ui-motion";
import { BrandLockup } from "../../components/brand/brand-lockup";
import { OAuthProviderIcon } from "../../components/brand/oauth-provider-icon";
import { NodeIcon } from "../workflow/node-icon";

type AuthMode = "login" | "register";
type AuthResponse = { user?: { email: string }; message?: string | { message?: string } };

export function LoginForm({ mode = "login" }: { mode?: AuthMode }) {
  const router = useRouter();
  const cardRef = useRef<HTMLDivElement>(null);
  const submittingRef = useRef(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [providers, setProviders] = useState<{ google: boolean; github: boolean } | null>(null);
  const isRegister = mode === "register";
  useSurfaceMotion(cardRef);

  useEffect(() => {
    const controller = new AbortController();
    const authError = new URLSearchParams(window.location.search).get("authError");
    if (authError === "google_cancelled" || authError === "github_cancelled") setError(`${authError.startsWith("google") ? "Google" : "GitHub"} sign-in was cancelled. You can try again when ready.`);
    if (authError === "google_failed" || authError === "github_failed") setError(`${authError.startsWith("google") ? "Google" : "GitHub"} sign-in could not be completed. Please try again.`);
    void fetch(`${apiUrl}/auth/providers`, { credentials: "include", signal: controller.signal })
      .then(async (response): Promise<{ google?: boolean; github?: boolean }> => response.ok ? await response.json() as { google?: boolean; github?: boolean } : {})
      .then((result) => { if (!controller.signal.aborted) setProviders({ google: result.google === true, github: result.github === true }); })
      .catch(() => { if (!controller.signal.aborted) setProviders({ google: false, github: false }); });
    return () => controller.abort();
  }, []);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submittingRef.current) return;
    submittingRef.current = true;
    setError(null);
    setIsSubmitting(true);
    try {
      const response = await fetch(`${apiUrl}/auth/${mode}`, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isRegister ? { email, password, displayName } : { email, password }),
      });
      const body = await response.json().catch(() => ({})) as AuthResponse;
      if (!response.ok || !body.user) {
        const message = typeof body.message === "string" ? body.message : body.message?.message;
        throw new Error(message ?? "We could not complete your request. Please try again.");
      }
      router.push("/dashboard");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "We could not complete your request.");
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  return (
    <main className="auth-page">
      <header className="auth-navigation">
        <Link href="/" aria-label="Fluxora home"><BrandLockup /></Link>
        <div className="auth-navigation__actions"><Link href="/support">Need help?</Link><ThemeToggle /></div>
      </header>
      <section className="auth-showcase" aria-label="Product introduction">
        <div className="auth-showcase__copy">
          <p className="auth-eyebrow">LESS REPETITION. MORE POSSIBILITY.</p>
          <h2>Your everyday work.<br /><em>A little more automatic.</em></h2>
          <p>Connect your apps, build a flow, and follow every step. Keep the routine moving while you focus on what comes next.</p>
        </div>
        <div className="auth-flow-preview" aria-label="Example workflow: a daily Steam report sent to Google Chat">
          <div className="auth-flow-preview__header"><span>DAILY ACCOUNT REPORT</span><span>Example workflow</span></div>
          <ol>
            <li><span className="auth-flow-preview__icon"><Clock3 size={20} /></span><div><strong>Start on a schedule</strong><span>Every morning, ready when you are</span></div><span className="auth-flow-preview__step">01</span></li>
            <li><span className="auth-flow-preview__icon"><NodeIcon name="steam" size={24} /></span><div><strong>Get your Steam snapshot</strong><span>Bring your account activity together</span></div><span className="auth-flow-preview__step">02</span></li>
            <li><span className="auth-flow-preview__icon"><NodeIcon name="google-chat" size={24} /></span><div><strong>Send it to Google Chat</strong><span>Your update, in the right place</span></div><span className="auth-flow-preview__step">03</span></li>
          </ol>
          <p><Check size={15} aria-hidden="true" /> Built visually. Executed on your server.</p>
        </div>
        <p className="auth-showcase__note">Your workflows. Your connections. Your workspace.</p>
      </section>
      <section className="auth-panel" aria-labelledby="auth-title">
        <div ref={cardRef} className="auth-card">
          <p className="auth-eyebrow">{isRegister ? "GET STARTED" : "WELCOME BACK"}</p>
          <h1 id="auth-title">{isRegister ? "Create your workspace" : "Sign in to your workspace"}</h1>
          <p className="auth-subtitle">{isRegister ? "Start with an account. Build your first workflow at your own pace." : "Pick up where you left off. Your workflows are waiting."}</p>
          <form onSubmit={submit} aria-busy={isSubmitting}>
            {isRegister && <Field label="Name" className="auth-field"><input name="displayName" autoComplete="name" value={displayName} onChange={event => setDisplayName(event.target.value)} disabled={isSubmitting} placeholder="Your name" /></Field>}
            <Field label="Email" className="auth-field"><input name="email" autoComplete="email" type="email" required value={email} onChange={event => setEmail(event.target.value)} disabled={isSubmitting} placeholder="you@example.com" /></Field>
            <div className="auth-field">
              <label className="auth-field__label" htmlFor="auth-password">Password</label>
              <div className="auth-password">
                <input id="auth-password" name="password" type={showPassword ? "text" : "password"} autoComplete={isRegister ? "new-password" : "current-password"} minLength={isRegister ? 12 : 1} required value={password} onChange={event => setPassword(event.target.value)} disabled={isSubmitting} aria-describedby={isRegister ? "auth-password-help" : undefined} />
                <IconButton label={showPassword ? "Hide password" : "Show password"} aria-controls="auth-password" onClick={() => setShowPassword(!showPassword)} disabled={isSubmitting}>{showPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}</IconButton>
              </div>
            </div>
            {isRegister && <p id="auth-password-help" className="auth-help">Use at least 12 characters for your password.</p>}
            {error && <p className="auth-error" role="alert">{error}</p>}
            <Button variant="primary" className="auth-submit" type="submit" disabled={isSubmitting}>
              {isSubmitting ? <><LoaderCircle className="ui-spinner" size={17} aria-hidden="true" />{isRegister ? "Creating account…" : "Signing in…"}</> : <>{isRegister ? "Create account" : "Sign in"}<ArrowRight size={17} aria-hidden="true" /></>}
            </Button>
            <span className="sr-only" role="status">{isSubmitting ? (isRegister ? "Creating your account." : "Signing you in.") : ""}</span>
          </form>
          <div className="auth-divider">or continue with</div>
          <div className="auth-oauth-actions">
            {(["google", "github"] as const).map(provider => {
              const label = provider === "google" ? "Google" : "GitHub";
              return <Button key={provider} className="auth-oauth-button" disabled={isSubmitting || !providers?.[provider]} onClick={() => window.location.assign(`${apiUrl}/auth/${provider}/start`)}>
                <span className="auth-oauth-button__brand"><span className={`auth-oauth-button__icon auth-oauth-button__icon--${provider}`}><OAuthProviderIcon provider={provider} /></span>{label}</span>
                {!providers?.[provider] && <small>{providers ? "Unavailable" : "Checking…"}</small>}
              </Button>;
            })}
          </div>
          <p className="auth-switch">{isRegister ? "Already have an account?" : "New to Fluxora?"} <button type="button" disabled={isSubmitting} onClick={() => router.push(isRegister ? "/login" : "/register")}>{isRegister ? "Sign in" : "Create an account"}</button></p>
          <p className="auth-legal">By continuing, you agree to our <Link href="/terms">Terms</Link> and acknowledge our <Link href="/privacy">Privacy policy</Link>.</p>
        </div>
      </section>
    </main>
  );
}
