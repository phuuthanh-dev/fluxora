import Link from "next/link";
import { CircleHelp } from "lucide-react";
import { BrandLockup } from "../../components/brand/brand-lockup";
import { ThemeToggle } from "../theme/theme-toggle";

export function AuthNavigation() {
  return <header className="auth-navigation">
    <Link href="/" aria-label="Fluxora home"><BrandLockup /></Link>
    <div className="auth-navigation__actions">
      <Link className="auth-navigation__support" href="/support"><CircleHelp size={16} aria-hidden="true" />Need help?</Link>
      <div className="auth-navigation__theme"><ThemeToggle /></div>
    </div>
  </header>;
}
