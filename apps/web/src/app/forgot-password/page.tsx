import { PasswordRecovery } from "../../features/auth/password-recovery";
import { privateMetadata } from "../../features/public-site/site";
export const metadata = { ...privateMetadata, title: "Forgot password | Fluxora", referrer: "no-referrer" as const };
export default function ForgotPasswordPage() { return <PasswordRecovery />; }
