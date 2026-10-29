import Link from "next/link";
import { PublicShell } from "../features/public-site/public-shell";
export default function NotFound() {
  return <PublicShell eyebrow="404 / A missing connection" title="This path doesn’t lead anywhere." description="The page may have moved, or the link may be incomplete."><div className="public-contact"><Link href="/">Return to the homepage</Link> or <Link href="/dashboard">open your workspace</Link>.</div></PublicShell>;
}
