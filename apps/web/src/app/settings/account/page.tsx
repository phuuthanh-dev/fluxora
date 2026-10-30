import { AccountSettings } from "../../../features/auth/account-settings";
import { privateMetadata } from "../../../features/public-site/site";
export const metadata = { ...privateMetadata, title: "Your account | Fluxora" };
export default function AccountPage() { return <AccountSettings />; }
