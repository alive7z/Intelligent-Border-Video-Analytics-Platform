import React, { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { SidebarContent } from "./Sidebar";
import { Header } from "./Header";
import { useLanguage } from "../../hooks/useLanguage";
import { Outlet } from "react-router-dom";

/**
 * App shell: compact expandable navigation rail on desktop, overlay drawer on
 * mobile/tablet, top header, and a consistently padded content area.
 */
const SIDEBAR_STORAGE = "ibvap-sidebar-state";

function useEscape(open, onClose) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);
}

export function DashboardLayout() {
  const { lang, setLang } = useLanguage();
  const location = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_STORAGE) === "collapsed";
    } catch (e) {
      return false;
    }
  });

  const closeDrawer = () => setDrawerOpen(false);
  useEscape(drawerOpen, closeDrawer);

  const toggleCollapse = () => {
    setCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem(SIDEBAR_STORAGE, next ? "collapsed" : "expanded");
      } catch (e) {
        /* ignore */
      }
      return next;
    });
  };

  // Close the mobile drawer automatically whenever the route changes.
  useEffect(() => {
    closeDrawer();
  }, [location.pathname]);

  const SIDEBAR_W = "w-[248px]";
  const SIDEBAR_RAIL_W = "w-[72px]";

  // Header is fixed full-width at the top (h-[64px] in Header.jsx) —
  // sidebar and main content start exactly below it.
  const SIDEBAR_TOP = "top-[64px]";
  const SIDEBAR_H = "h-[calc(100vh-64px)]";
  const HEADER_OFFSET = "pt-[64px]";

  return (
    <div className="app-shell flex min-h-screen flex-col bg-slate-50 transition-colors dark:bg-[#09090B]">
      <Header
        onMenuClick={() => setDrawerOpen(true)}
        lang={lang}
        setLang={setLang}
      />

      <div className={`flex flex-1 flex-col transition-[padding] duration-250 ease-in-out ${HEADER_OFFSET} ${collapsed ? "lg:pl-[72px]" : "lg:pl-[248px]"}`}>
        {/* Desktop sidebar (full or collapsed rail) */}
        <aside
          className={`sidebar-surface fixed ${SIDEBAR_TOP} left-0 z-30 hidden overflow-visible border-r border-slate-200 shadow-card transition-[width] duration-250 ease-in-out lg:block ${SIDEBAR_H} ${
            collapsed ? SIDEBAR_RAIL_W : SIDEBAR_W
          }`}
        >
          <div className="h-full w-full">
            <SidebarContent collapsed={collapsed} onToggleCollapse={toggleCollapse} />
          </div>
        </aside>

        {/* Mobile / tablet drawer */}
        {drawerOpen && (
          <div className="fixed inset-0 z-[60] lg:hidden">
            <div
              className="absolute inset-0 animate-[backdropIn_0.2s_ease-out] bg-black/40"
              onClick={closeDrawer}
              aria-hidden="true"
            />
            <aside className="sidebar-surface absolute inset-y-0 left-0 w-[280px] animate-[drawerIn_0.25s_ease-out] shadow-pop">
              <SidebarContent onNavigate={closeDrawer} showClose onClose={closeDrawer} />
            </aside>
          </div>
        )}

        <div className="flex min-h-screen flex-1 flex-col">
          <main
            key={location.pathname}
            className="page-enter flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8 2xl:px-10"
          >
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}

export default DashboardLayout;
