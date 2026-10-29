import type { Metadata } from "next";

/** Public deployment identity. Never use a request Host header for canonical URLs. */
export const publicSite = {
  origin: "https://fluxora.io.vn",
  email: "phuuthanh2003@gmail.com",
  repository: "https://github.com/phuuthanh-dev/workflow-automation",
  updated: "2026-10-29",
} as const;

export const publicLinks = [
  { href: "/support", label: "Support" },
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
] as const;

export function publicMetadata(title: string, description: string, path: string): Metadata {
  return {
    title: `${title} — Fluxora`, description,
    alternates: { canonical: path },
    openGraph: { title: `${title} — Fluxora`, description, url: path, siteName: "Fluxora", type: "website", images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "Fluxora — Good work. On autopilot." }] },
    twitter: { card: "summary_large_image", title: `${title} — Fluxora`, description, images: ["/opengraph-image"] },
  };
}

export const privateMetadata: Metadata = { robots: { index: false, follow: false } };
