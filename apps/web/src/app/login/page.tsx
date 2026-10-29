import { privateMetadata } from "../../features/public-site/site";
import { LoginForm } from "@/features/auth/login-form";

export const metadata = privateMetadata;

export default function LoginPage() {
  return <LoginForm />;
}
