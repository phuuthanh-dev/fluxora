"use client";

import { ChevronLeft, ChevronRight, CircleHelp, History, LayoutDashboard, Menu as MenuIcon, PlugZap, Search, Settings, X } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { BrandLockup } from "../../components/brand/brand-lockup";
import { Button, Dialog, IconButton } from "../../components/ui";
import { useSidebarMotion } from "../../components/ui/ui-motion";
import { ThemeToggle } from "../theme/theme-toggle";

const preferenceKey = "fluxora-sidebar-collapsed";
const destinations = [
  { id: "dashboard", label: "Dashboard", description: "Workflows and activity", path: "/dashboard", icon: LayoutDashboard, group: "Workspace" },
  { id: "connections", label: "Connections", description: "App accounts and credentials", path: "/dashboard/connections", icon: PlugZap, group: "Workspace" },
  { id: "executions", label: "Executions", description: "Run history and diagnostics", path: "/dashboard/executions", icon: History, group: "Workspace" },
  { id: "account", label: "Settings", description: "Account profile, password and sessions", path: "/settings/account", icon: Settings, group: "Manage" },
] as const;

type Props = {
  active: typeof destinations[number]["id"] | "admin";
  workspaceId: string;
  workspacePicker: ReactNode;
  accountMenu: ReactNode;
  navigate: (path: string) => void;
};

/** Management navigation only. The editor keeps its own compact header/guard. */
export function WorkspaceSidebar({ active, workspaceId, workspacePicker, accountMenu, navigate }: Props) {
  const headerRef = useRef<HTMLElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const animateRef = useRef(false);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [focusSearch, setFocusSearch] = useState(false);

  useLayoutEffect(() => {
    try { setCollapsed(localStorage.getItem(preferenceKey) === "true"); } catch { /* Navigation works without browser storage. */ }
  }, []);
  useSidebarMotion(headerRef, collapsed, animateRef.current);

  useEffect(() => {
    if (!focusSearch || collapsed) return;
    searchRef.current?.focus();
    setFocusSearch(false);
  }, [focusSearch, collapsed]);

  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 901px)");
    const closeDrawer = () => { if (desktop.matches) setMobileOpen(false); };
    desktop.addEventListener("change", closeDrawer);
    return () => desktop.removeEventListener("change", closeDrawer);
  }, []);

  const toggle = (next = !collapsed) => {
    animateRef.current = true;
    setCollapsed(next);
    setQuery("");
    try { localStorage.setItem(preferenceKey, String(next)); } catch { /* Keep the preference for this session. */ }
  };
  const go = (path: string) => {
    setMobileOpen(false);
    setQuery("");
    navigate(path);
  };
  const matching = destinations.filter((item) => `${item.label} ${item.description}`.toLowerCase().includes(query.trim().toLowerCase()));

  const content = (mobile: boolean) => <>
    <div className="workspace-sidebar__brand">
      <button className="app-shell-brand" type="button" aria-label="Fluxora home" onClick={() => go(`/dashboard?workspace=${encodeURIComponent(workspaceId)}`)}><BrandLockup /></button>
      {mobile
        ? <IconButton label="Close navigation" onClick={() => setMobileOpen(false)}><X size={17} /></IconButton>
        : <IconButton className="workspace-sidebar__collapse" label={collapsed ? "Expand sidebar" : "Collapse sidebar"} aria-expanded={!collapsed} aria-controls="workspace-sidebar-navigation" onClick={() => toggle()}>{collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}</IconButton>}
    </div>
    <div className="workspace-sidebar__search">
      {collapsed && !mobile
        ? <IconButton label="Search navigation" title="Search navigation" onClick={() => { toggle(false); setFocusSearch(true); }}><Search size={18} /></IconButton>
        : <label><Search size={16} aria-hidden="true" /><input ref={searchRef} aria-label="Search navigation" placeholder="Find a page…" value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape" && query) { event.preventDefault(); event.stopPropagation(); setQuery(""); } }} />{query && <IconButton label="Clear navigation search" onClick={() => { setQuery(""); searchRef.current?.focus(); }}><X size={14} /></IconButton>}</label>}
    </div>
    <nav id={mobile ? "workspace-mobile-navigation" : "workspace-sidebar-navigation"} aria-label="Workspace navigation" className="workspace-sidebar__navigation">
      {["Workspace", "Manage"].map((group) => {
        const items = matching.filter((item) => item.group === group);
        if (!items.length) return null;
        return <div className="workspace-sidebar__group" key={group}>
          <p className="workspace-sidebar__group-label">{group}</p>
          {items.map((item) => <Button key={item.id} variant="ghost" className={`workspace-sidebar__link app-shell-nav-link${active === item.id ? " is-active" : ""}`} aria-label={item.label} aria-current={active === item.id ? "page" : undefined} onClick={() => go(`${item.path}?workspace=${encodeURIComponent(workspaceId)}`)}>
            <item.icon size={19} strokeWidth={1.7} aria-hidden="true" />
            <span className="workspace-sidebar__link-label">{item.label}</span>
            {active === item.id && <span className="workspace-sidebar__active-dot" aria-hidden="true" />}
          </Button>)}
        </div>;
      })}
      {matching.length === 0 && <p className="workspace-sidebar__empty" role="status">No pages found. Try “connections” or “history”.</p>}
    </nav>
    <div className="workspace-sidebar__footer">
      <Button variant="ghost" className="workspace-sidebar__link" aria-label="Help and support" onClick={() => go("/support")}><CircleHelp size={19} strokeWidth={1.7} aria-hidden="true" /><span className="workspace-sidebar__link-label">Help and support</span></Button>
      <ThemeToggle />
      <div className="workspace-sidebar__account">{accountMenu}</div>
    </div>
  </>;

  return <header ref={headerRef} className="app-shell-header app-shell-header--sidebar" data-collapsed={collapsed}>
    <div className="workspace-topbar">
      <IconButton className="workspace-topbar__menu" label="Open navigation" aria-expanded={mobileOpen} onClick={() => setMobileOpen(true)}><MenuIcon size={20} /></IconButton>
      <span className="workspace-topbar__title">{active === "admin" ? "Platform administration" : destinations.find((item) => item.id === active)?.label}</span>
      <div className="workspace-topbar__workspace">{workspacePicker}</div>
    </div>
    {!mobileOpen && <aside className="workspace-sidebar" aria-label="Workspace sidebar" data-collapsed={collapsed}>{content(false)}</aside>}
    {mobileOpen && <div className="workspace-drawer-backdrop" onClick={(event) => { if (event.target === event.currentTarget) setMobileOpen(false); }}>
      <Dialog label="Navigation" className="workspace-sidebar workspace-sidebar--drawer" onClose={() => setMobileOpen(false)} initialFocusSelector='button[aria-label="Close navigation"]'>
        <div className="workspace-sidebar__drawer-inner" onClick={(event) => event.stopPropagation()}>{content(true)}</div>
      </Dialog>
    </div>}
  </header>;
}
