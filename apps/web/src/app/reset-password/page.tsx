import { PasswordRecovery } from "../../features/auth/password-recovery";
import { privateMetadata } from "../../features/public-site/site";
export const metadata = { ...privateMetadata, title: "Reset password | Fluxora", referrer: "no-referrer" as const };
export default function ResetPasswordPage() { return <PasswordRecovery reset />; }
