import { publicMetadata } from "../features/public-site/site";
import { LandingPage } from "@/features/marketing/landing-page";

export const metadata = publicMetadata("Visual workflow automation", "Connect your apps, automate recurring work, and inspect every execution with Fluxora.", "/");

export default function HomePage() {
  return <LandingPage />;
}
