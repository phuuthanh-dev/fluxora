import { FluxoraMark } from "./fluxora-mark";

/** One brand signature for public, authentication and workspace navigation. */
export function BrandLockup() {
  return <span className="brand-lockup"><FluxoraMark size={28} /><strong>Fluxora</strong></span>;
}
