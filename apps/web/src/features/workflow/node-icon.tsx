import {
  CircleCheckBig,
  Clock3,
  GitBranch,
  Globe2,
  Mail,
  Play,
  Rss,
  Shuffle,
  Webhook,
} from "lucide-react";
import { Icon } from "@iconify/react/offline";
import discordIcon from "@iconify-icons/logos/discord-icon";
import googleDriveIcon from "@iconify-icons/logos/google-drive-2020";
import googleGeminiIcon from "@iconify-icons/logos/google-gemini-icon";
import googleIcon from "@iconify-icons/logos/google-icon";
import {
  SiFacebook,
  SiGithub,
  SiGmail,
  SiGooglecalendar,
  SiGooglechat,
  SiGooglesheets,
  SiInstagram,
  SiMongodb,
  SiNotion,
  SiPostgresql,
  SiSteam,
  SiTelegram,
} from "react-icons/si";
import { BsOpenai } from "react-icons/bs";

export type NodeIconName =
  | "manual"
  | "schedule"
  | "webhook"
  | "if"
  | "switch"
  | "steam"
  | "google"
  | "google-chat"
  | "google-calendar"
  | "gmail"
  | "discord"
  | "telegram"
  | "google-drive"
  | "google-sheets"
  | "http"
  | "approval"
  | "email"
  | "openai"
  | "gemini"
  | "mongodb"
  | "notion"
  | "rss"
  | "postgres"
  | "github"
  | "facebook"
  | "instagram";

export function NodeIcon({ name, size = 18, className = "" }: { name: NodeIconName; size?: number; className?: string }) {
  const props = { size, "aria-hidden": true as const, style: { color: `var(--provider-${name})` } };
  const multicolorProps = { width: size, height: size, "aria-hidden": true as const };
  const icon = (() => {
    switch (name) {
      case "manual": return <Play {...props} fill="currentColor" />;
      case "schedule": return <Clock3 {...props} />;
      case "webhook": return <Webhook {...props} />;
      case "if": return <GitBranch {...props} />;
      case "switch": return <Shuffle {...props} />;
      case "steam": return <SiSteam {...props} />;
      case "google": return <Icon icon={googleIcon} {...multicolorProps} />;
      case "google-chat": return <SiGooglechat {...props} />;
      case "google-calendar": return <SiGooglecalendar {...props} />;
      case "gmail": return <SiGmail {...props} />;
      case "discord": return <Icon icon={discordIcon} {...multicolorProps} />;
      case "telegram": return <SiTelegram {...props} />;
      case "google-drive": return <Icon icon={googleDriveIcon} {...multicolorProps} />;
      case "google-sheets": return <SiGooglesheets {...props} />;
      case "http": return <Globe2 {...props} />;
      case "approval": return <CircleCheckBig {...props} />;
      case "email": return <Mail {...props} />;
      case "openai": return <BsOpenai {...props} />;
      case "gemini": return <Icon icon={googleGeminiIcon} {...multicolorProps} />;
      case "mongodb": return <SiMongodb {...props} />;
      case "notion": return <SiNotion {...props} />;
      case "rss": return <Rss {...props} />;
      case "postgres": return <SiPostgresql {...props} />;
      case "github": return <SiGithub {...props} />;
      case "facebook": return <SiFacebook {...props} />;
      case "instagram": return <SiInstagram {...props} />;
    }
  })();

  return <span className={`inline-flex shrink-0 items-center justify-center ${className}`}>{icon}</span>;
}
