import type { Metadata } from "next";
import type { ReactNode } from "react";
import localFont from "next/font/local";
import "./globals.css";

const gilroy = localFont({
  src: [
    { path: "./fonts/gilroy-medium.otf", weight: "500", style: "normal" },
    { path: "./fonts/gilroy-medium-italic.otf", weight: "500", style: "italic" },
    { path: "./fonts/gilroy-semibold.otf", weight: "600", style: "normal" },
    { path: "./fonts/gilroy-semibold-italic.otf", weight: "600", style: "italic" },
    { path: "./fonts/gilroy-bold.otf", weight: "700", style: "normal" },
    { path: "./fonts/gilroy-bold-italic.otf", weight: "700", style: "italic" },
  ],
  variable: "--font-fluxora-gilroy",
  display: "swap",
  fallback: ["Arial", "sans-serif"],
});

export const metadata: Metadata = {
  title: "Fluxora — Visual workflow automation",
  description: "Build dependable automations from visual workflows.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" className={gilroy.variable} suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
