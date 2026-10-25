import {
  CircleCheckBig,
  Clock3,
  GitBranch,
  Globe2,
  Mail,
  Play,
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
  SiGooglechat,
  SiGooglesheets,
  SiInstagram,
  SiMongodb,
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
  | "github"
  | "facebook"
  | "instagram";

const brandColors: Record<NodeIconName, string> = {
  manual: "#b8ed00",
  schedule: "#8cab12",
  webhook: "#0284c7",
  if: "#d97706",
  switch: "#ea580c",
  steam: "#1b2838",
  google: "#4285f4",
  "google-chat": "#00ac47",
  discord: "#5865f2",
  telegram: "#26a5e4",
  "google-drive": "#4285f4",
  "google-sheets": "#34a853",
  http: "#0f766e",
  approval: "#16a34a",
  email: "#ea4335",
  openai: "#412991",
  gemini: "#8e75b2",
  mongodb: "#47a248",
  github: "#181717",
  facebook: "#0866ff",
  instagram: "#e4405f",
};

export function NodeIcon({ name, size = 18, className = "" }: { name: NodeIconName; size?: number; className?: string }) {
  const props = { size, "aria-hidden": true as const, style: { color: brandColors[name] } };
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
      case "github": return <SiGithub {...props} />;
      case "facebook": return <SiFacebook {...props} />;
      case "instagram": return <SiInstagram {...props} />;
    }
  })();

  return <span className={`inline-flex shrink-0 items-center justify-center ${className}`}>{icon}</span>;
}
