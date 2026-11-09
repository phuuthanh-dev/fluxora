"use client";

import Link from "next/link";
import { Activity, ArrowLeft, Building2, CircleHelp, LayoutDashboard, ScrollText, ShieldCheck, Users, Workflow, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { BrandLockup } from "../../components/brand/brand-lockup";
import { ThemeToggle } from "../theme/theme-toggle";

import { adminLabel, adminSections, type AdminSection } from "./admin-sections";
const icons: Record<AdminSection, LucideIcon> = { overview: LayoutDashboard, users: Users, workspaces: Building2, workflows: Workflow, executions: Activity, audit: ScrollText, support: CircleHelp };

export function AdminShell({ section, children }: { section: AdminSection; children: ReactNode }) {
  return <div className="admin-shell">
    <a href="#admin-content" className="admin-skip">Skip to administration content</a>
    <aside className="admin-sidebar">
      <Link href="/" className="admin-brand" aria-label="Fluxora home"><BrandLockup /></Link>
      <div className="admin-scope"><ShieldCheck size={16} aria-hidden="true" /><span>Platform admin<small>All workspaces</small></span></div>
      <nav aria-label="Platform administration">{adminSections.map((item) => {
        const Icon = icons[item];
        return <Link key={item} href={item === "overview" ? "/admin" : `/admin/${item}`} aria-current={item === section ? "page" : undefined}><Icon size={18} aria-hidden="true" />{adminLabel(item)}</Link>;
      })}</nav>
      <div className="admin-sidebar__footer"><Link href="/dashboard"><ArrowLeft size={16} aria-hidden="true" />Back to workspace</Link><ThemeToggle /></div>
    </aside>
    <main id="admin-content" className="admin-main" tabIndex={-1}>{children}</main>
  </div>;
}
