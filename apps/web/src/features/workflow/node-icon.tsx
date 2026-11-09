import {
  CircleCheckBig,
  BookOpen,
  Clock3,
  Crosshair,
  Crown,
  GitBranch,
  Globe2,
  Gamepad2,
  HandFist,
  Mail,
  Play,
  Rss,
  Shield,
  Shuffle,
  Swords,
  Webhook,
} from "lucide-react";
import { useId } from "react";
import slackIcon from "@iconify-icons/logos/slack-icon";
import discordIcon from "@iconify-icons/logos/discord-icon";
import googleDriveIcon from "@iconify-icons/logos/google-drive-2020";
import googleGeminiIcon from "@iconify-icons/logos/google-gemini-icon";
import googleIcon from "@iconify-icons/logos/google-icon";
import gmailIcon from "@iconify-icons/logos/google-gmail-2020";
import calendarIcon from "@iconify-icons/logos/google-calendar-2020";
import telegramIcon from "@iconify-icons/logos/telegram";
import trelloIcon from "@iconify-icons/logos/trello";
import instagramIcon from "@iconify-icons/logos/instagram-icon";
import redditIcon from "@iconify-icons/logos/reddit-icon";
import supabaseIcon from "@iconify-icons/logos/supabase-icon";
import {
  SiFacebook,
  SiGithub,
  SiGooglechat,
  SiGooglesheets,
  SiMongodb,
  SiNotion,
  SiPostgresql,
  SiSteam,
  SiSentry,
  SiVercel,
  SiUptimekuma,
} from "react-icons/si";
import { BsOpenai } from "react-icons/bs";

export type NodeIconName =
  | "manual"
  | "schedule"
  | "webhook"
  | "if"
  | "switch"
  | "steam"
  | "game"
  | "riot-games"
  | "riot-lol"
  | "riot-tft"
  | "riot-valorant"
  | "riot-lor"
  | "riot-2xko"
  | "google"
  | "google-chat"
  | "google-calendar"
  | "gmail"
  | "slack"
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
  | "trello"
  | "sentry"
  | "vercel"
  | "supabase"
  | "uptime-kuma"
  | "reddit"
  | "postgres"
  | "github"
  | "facebook"
  | "instagram";

// Iconify's default SVG ID counter depends on render order, which differs
// between SSR and hydration. React's useId is stable and unique per instance.
function BrandIcon({ icon, size, instagramGradient = false }: { icon: { body: string; width?: number; height?: number }; size: number; instagramGradient?: boolean }) {
  const prefix = `brand${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  let body = icon.body;
  for (const match of icon.body.matchAll(/\sid="([^"]+)"/g)) {
    const id = match[1];
    if (!id) continue;
    const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    body = body.replace(new RegExp(`([#;\"])${escaped}([\")]|\\.[a-z])`, "g"), `$1${prefix}-${id}$2`);
  }
  if (instagramGradient) {
    const gradient = `${prefix}-instagram`;
    body = `<defs><linearGradient id="${gradient}" x1="0%" y1="100%" x2="100%" y2="0%"><stop offset="0%" stop-color="#feda75"/><stop offset="25%" stop-color="#fa7e1e"/><stop offset="50%" stop-color="#d62976"/><stop offset="75%" stop-color="#962fbf"/><stop offset="100%" stop-color="#4f5bd5"/></linearGradient></defs>${body.replace(/fill="#0a0a08"/g, `fill="url(#${gradient})"`)}`;
  }
  return <svg aria-hidden="true" width={size} height={size} viewBox={`0 0 ${icon.width ?? 16} ${icon.height ?? 16}`} dangerouslySetInnerHTML={{ __html: body }} />;
}

export function NodeIcon({ name, size = 18, className = "" }: { name: NodeIconName; size?: number; className?: string }) {
  const provider = name.startsWith("riot-") ? "game" : name;
  const props = { size, "aria-hidden": true as const, style: { color: `var(--provider-${provider})` } };
  const icon = (() => {
    switch (name) {
      case "manual": return <Play {...props} fill="currentColor" />;
      case "schedule": return <Clock3 {...props} />;
      case "webhook": return <Webhook {...props} />;
      case "if": return <GitBranch {...props} />;
      case "switch": return <Shuffle {...props} />;
      case "steam": return <SiSteam {...props} />;
      case "game": return <Gamepad2 {...props} />;
      // These generic pictograms distinguish games without reproducing Riot's restricted marks.
      case "riot-games": return <Shield {...props} />;
      case "riot-lol": return <Swords {...props} />;
      case "riot-tft": return <Crown {...props} />;
      case "riot-valorant": return <Crosshair {...props} />;
      case "riot-lor": return <BookOpen {...props} />;
      case "riot-2xko": return <HandFist {...props} />;
      case "google": return <BrandIcon icon={googleIcon} size={size} />;
      case "google-chat": return <SiGooglechat {...props} />;
      case "google-calendar": return <BrandIcon icon={calendarIcon} size={size} />;
      case "gmail": return <BrandIcon icon={gmailIcon} size={size} />;
      case "slack": return <BrandIcon icon={slackIcon} size={size} />;
      case "discord": return <BrandIcon icon={discordIcon} size={size} />;
      case "telegram": return <BrandIcon icon={telegramIcon} size={size} />;
      case "google-drive": return <BrandIcon icon={googleDriveIcon} size={size} />;
      case "google-sheets": return <SiGooglesheets {...props} />;
      case "http": return <Globe2 {...props} />;
      case "approval": return <CircleCheckBig {...props} />;
      case "email": return <Mail {...props} />;
      case "openai": return <BsOpenai {...props} />;
      case "gemini": return <BrandIcon icon={googleGeminiIcon} size={size} />;
      case "mongodb": return <SiMongodb {...props} />;
      case "notion": return <SiNotion {...props} />;
      case "rss": return <Rss {...props} />;
      case "trello": return <BrandIcon icon={trelloIcon} size={size} />;
      case "sentry": return <SiSentry {...props} />;
      case "vercel": return <SiVercel {...props} />;
      case "supabase": return <BrandIcon icon={supabaseIcon} size={size} />;
      case "reddit": return <BrandIcon icon={redditIcon} size={size} />;
      case "uptime-kuma": return <SiUptimekuma {...props} />;
      case "postgres": return <SiPostgresql {...props} />;
      case "github": return <SiGithub {...props} />;
      case "facebook": return <SiFacebook {...props} />;
      case "instagram": return <BrandIcon icon={instagramIcon} size={size} instagramGradient />;
    }
  })();

  return <span className={`inline-flex shrink-0 items-center justify-center ${className}`}>{icon}</span>;
}
