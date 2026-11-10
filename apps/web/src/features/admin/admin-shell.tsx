"use client";

import Link from "next/link";
import { Activity, ArrowLeft, Building2, ChevronLeft, ChevronRight, CircleHelp, LayoutDashboard, Menu as MenuIcon, ScrollText, ShieldCheck, Users, Workflow, X, type LucideIcon } from "lucide-react";
import { useEffect, useLayoutEffect, useState, type ReactNode } from "react";
import { BrandLockup } from "../../components/brand/brand-lockup";
import { Dialog, IconButton } from "../../components/ui";
import { ThemeToggle } from "../theme/theme-toggle";
import { adminLabel, type AdminSection } from "./admin-sections";

const preferenceKey = "fluxora-admin-sidebar-collapsed";
const icons: Record<AdminSection, LucideIcon> = { overview: LayoutDashboard, users: Users, workspaces: Building2, workflows: Workflow, executions: Activity, audit: ScrollText, support: CircleHelp };
const navigationGroups: { label: string; sections: AdminSection[] }[] = [
  { label: "Platform", sections: ["overview", "users", "workspaces"] },
  { label: "Operations", sections: ["workflows", "executions", "audit"] },
  { label: "Resources", sections: ["support"] },
];

export function AdminShell({ section, children }: { section: AdminSection; children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useLayoutEffect(() => {
    try { setCollapsed(localStorage.getItem(preferenceKey) === "true"); } catch { /* Navigation also works without storage. */ }
  }, []);
  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 901px)");
    const closeDrawer = () => { if (desktop.matches) setMobileOpen(false); };
    desktop.addEventListener("change", closeDrawer);
    return () => desktop.removeEventListener("change", closeDrawer);
  }, []);

  const toggleSidebar = () => {
    const next = !collapsed;
    setCollapsed(next);
    try { localStorage.setItem(preferenceKey, String(next)); } catch { /* Keep the choice for this session. */ }
  };
  const content = (mobile: boolean) => {
    const compact = collapsed && !mobile;
    return <>
      <div className="admin-sidebar__brand-row">
        <Link href="/" className="admin-brand" aria-label="Fluxora home"><BrandLockup /></Link>
        {mobile
          ? <IconButton label="Close administration navigation" onClick={() => setMobileOpen(false)}><X size={18} /></IconButton>
          : <IconButton className="admin-sidebar__collapse" label={collapsed ? "Expand administration sidebar" : "Collapse administration sidebar"} title={collapsed ? "Expand sidebar" : "Collapse sidebar"} aria-expanded={!collapsed} aria-controls="admin-navigation" onClick={toggleSidebar}>{collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}</IconButton>}
      </div>
      <div className="admin-scope" title={compact ? "Platform admin · All workspaces" : undefined}>
        <ShieldCheck size={17} aria-hidden="true" /><span>Platform admin<small>All workspaces</small></span>
      </div>
      <nav id={mobile ? "admin-mobile-navigation" : "admin-navigation"} aria-label="Platform administration">
        {navigationGroups.map((group) => <div className="admin-nav-group" key={group.label}>
          {group.label !== "Resources" && <p className="admin-nav-group__label">{group.label}</p>}
          {group.sections.map((item) => {
            const Icon = icons[item];
            return <Link key={item} href={item === "overview" ? "/admin" : `/admin/${item}`} aria-label={adminLabel(item)} title={compact ? adminLabel(item) : undefined} aria-current={item === section ? "page" : undefined} onClick={() => setMobileOpen(false)}><Icon size={19} strokeWidth={1.7} aria-hidden="true" /><span className="admin-nav-label">{adminLabel(item)}</span></Link>;
          })}
        </div>)}
      </nav>
      <div className="admin-sidebar__footer">
        <Link href="/dashboard" aria-label="Back to workspace" title={compact ? "Back to workspace" : undefined}><ArrowLeft size={18} aria-hidden="true" /><span className="admin-nav-label">Back to workspace</span></Link>
        <div className="admin-sidebar__appearance"><span className="admin-nav-label">Appearance</span><ThemeToggle /></div>
      </div>
    </>;
  };

  return <div className="admin-shell" data-collapsed={collapsed}>
    <a href="#admin-content" className="admin-skip">Skip to administration content</a>
    <header className="admin-topbar">
      <IconButton label="Open administration navigation" aria-expanded={mobileOpen} onClick={() => setMobileOpen(true)}><MenuIcon size={20} /></IconButton>
      <span>Platform admin <strong>{adminLabel(section)}</strong></span>
    </header>
    {!mobileOpen && <aside className="admin-sidebar" aria-label="Administration sidebar">{content(false)}</aside>}
    {mobileOpen && <div className="admin-drawer-backdrop" onClick={(event) => { if (event.target === event.currentTarget) setMobileOpen(false); }}>
      <Dialog label="Administration navigation" className="admin-sidebar admin-sidebar--drawer" onClose={() => setMobileOpen(false)} initialFocusSelector='button[aria-label="Close administration navigation"]'>{content(true)}</Dialog>
    </div>}
    <main id="admin-content" className="admin-main" tabIndex={-1}>{children}</main>
  </div>;
}
