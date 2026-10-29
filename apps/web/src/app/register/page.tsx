import { privateMetadata } from "../../features/public-site/site";
import { LoginForm } from "@/features/auth/login-form";

export const metadata = { ...privateMetadata, title: "Create account | Fluxora" };

export default function RegisterPage() {
  return <LoginForm key="register" mode="register" />;
}
