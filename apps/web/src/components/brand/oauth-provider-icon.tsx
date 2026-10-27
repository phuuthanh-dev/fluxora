import { Icon } from "@iconify/react/offline";
import githubIcon from "@iconify-icons/logos/github-icon";
import googleIcon from "@iconify-icons/logos/google-icon";

type OAuthProvider = "google" | "github";

type OAuthProviderIconProps = {
  provider: OAuthProvider;
  size?: number;
};

export function OAuthProviderIcon({ provider, size = 19 }: OAuthProviderIconProps) {
  return <Icon icon={provider === "google" ? googleIcon : githubIcon} width={size} height={size} aria-hidden="true" />;
}
