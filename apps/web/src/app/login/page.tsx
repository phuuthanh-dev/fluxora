import { privateMetadata } from "../../features/public-site/site";
import { LoginForm } from "@/features/auth/login-form";

export const metadata = { ...privateMetadata, title: "Sign in | Fluxora" };

export default function LoginPage() {
  return <LoginForm key="login" mode="login" />;
}
