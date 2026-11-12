import { BrandLockup } from "../../components/brand/brand-lockup";

/** Neutral transition while the server verifies access; it grants no access itself. */
export function SessionLoading({ label = "Checking your session…" }: { label?: string }) {
  return <main className="auth-session-loading" aria-busy="true"><BrandLockup /><span role="status">{label}</span></main>;
}
