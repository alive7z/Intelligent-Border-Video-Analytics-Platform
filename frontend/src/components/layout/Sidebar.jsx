import React, { useEffect, useRef, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import {
  LayoutDashboardIcon,
  VideoIcon,
  BellIcon,
  FileTextIcon,
  BrainIcon,
  MapPinIcon,
  BarChartIcon,
  SettingsIcon,
  ShieldIcon,
  XIcon,
  HeartPulseIcon,
  ExternalLinkIcon,
  MenuIcon,
  ChevronLeftIcon,
} from "../common/Icons";
import Tooltip from "../common/Tooltip";
import { mockSystemHealth, mockCameras, mockAlerts } from "../../data/mockData";

const activeAlertCount = mockAlerts.filter((a) =>
  ["new", "active"].includes((a.status || "").toLowerCase())
).length;

const navItems = [
  { to: "/dashboard", label: "Overview", icon: LayoutDashboardIcon },
  { to: "/surveillance", label: "Live Surveillance", icon: VideoIcon, badge: "LIVE" },
  { to: "/alerts", label: "Alerts", icon: BellIcon, badge: String(activeAlertCount) },
  { to: "/events", label: "Events", icon: FileTextIcon },
  { to: "/intelligence", label: "Intelligence", icon: BrainIcon },
  { to: "/map", label: "Border Map", icon: MapPinIcon },
  { to: "/analytics", label: "Analytics", icon: BarChartIcon },
  { to: "/admin", label: "Admin", icon: SettingsIcon },
];

const toneDot = {
  Healthy: "bg-success",
  Online: "bg-success",
  Connected: "bg-success",
  Warning: "bg-warning",
  Offline: "bg-danger",
  Unknown: "bg-slate-400",
};

function NavItem({ item, collapsed }) {
  const Icon = item.icon;
  const link = (
    <NavLink
      to={item.to}
      aria-label={collapsed ? item.label : undefined}
      className={({ isActive }) =>
        `btn-focus group relative flex h-11 items-center transition-colors duration-150 ${
          collapsed ? "mx-auto w-10 justify-center rounded-lg" : "w-full gap-3 rounded-lg px-3"
        } ${
          isActive
            ? `bg-[#23447D] text-white shadow-sm dark:bg-[#173A70] ${
                collapsed ? "" : "ring-1 ring-saffron/30"
              }`
            : "text-slate-600 hover:bg-slate-100 hover:text-navy-800 dark:text-slate-400 dark:hover:bg-[#111C2C] dark:hover:text-white"
        }`
      }
    >
      {({ isActive }) => (
        <>
          {!collapsed && isActive && (
            <span
              aria-hidden="true"
              className="absolute left-0 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-r-full bg-saffron"
            />
          )}
          <span className="shrink-0 transition-transform duration-150">
            <Icon size={18} />
          </span>
          <span
            aria-hidden={collapsed}
            className={`overflow-hidden whitespace-nowrap text-left text-[15px] font-medium transition-[max-width,opacity] duration-[180ms] ease-in-out ${
              collapsed
                ? "max-w-0 opacity-0"
                : "max-w-[300px] flex-1 opacity-100 delay-100"
            }`}
          >
            {item.label}
          </span>
          {!collapsed &&
            item.badge &&
            (item.badge === "LIVE" ? (
              <span className="inline-flex shrink-0 items-center rounded-full border border-red-300 bg-red-50 px-1.5 py-0.5 text-[10px] font-bold uppercase text-red-600 dark:border-red-500/60 dark:bg-red-500/20 dark:text-red-300">
                {item.badge}
              </span>
            ) : (
              <span className="inline-flex min-w-[20px] shrink-0 items-center justify-center rounded-full bg-orange-100 px-1.5 py-0.5 text-[11px] font-bold text-orange-700 dark:bg-orange-500/20 dark:text-orange-300">
                {item.badge}
              </span>
            ))}
          {collapsed && item.badge === "LIVE" && (
            <span className="absolute right-1.5 top-1.5 flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
            </span>
          )}
          {collapsed && item.badge && item.badge !== "LIVE" && (
            <span className="absolute right-0.5 top-0.5 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-orange-500 px-1 text-[10px] font-bold leading-none text-white shadow-sm">
              {item.badge}
            </span>
          )}
        </>
      )}
    </NavLink>
  );

  if (!collapsed) return link;
  return (
    <Tooltip className="flex w-full justify-center" label={item.label} side="right">
      {link}
    </Tooltip>
  );
}

function SystemStatusCard({ onNavigate, collapsed }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return;
    const close = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const onlineCams = mockCameras.filter((c) => c.status === "online").length;
  const totalCams = mockCameras.length;
  const healthRows = mockSystemHealth.filter((s) => s.name !== "Camera Streams");

  const button = collapsed ? (
    <button
      type="button"
      onClick={() => setOpen((o) => !o)}
      aria-expanded={open}
      aria-haspopup="dialog"
      aria-label="System health"
      className="btn-focus mx-auto flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 transition-colors hover:bg-slate-100 dark:border-[#243247] dark:hover:bg-[#111C2C]"
    >
      <span className="relative flex h-3 w-3">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60 dark:opacity-50" />
        <span className="relative inline-flex h-3 w-3 rounded-full bg-success" />
      </span>
      <span className="sr-only">All Systems Operational</span>
    </button>
  ) : (
    <button
      type="button"
      onClick={() => setOpen((o) => !o)}
      aria-expanded={open}
      aria-haspopup="dialog"
      className="btn-focus card-hover w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-left dark:border-[#243247] dark:bg-[#111C2C]"
    >
      <div className="mb-1 flex items-center gap-2">
        <span className="relative flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60 dark:opacity-50" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-success" />
        </span>
        <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
          All Systems Operational
        </span>
        <span className="ml-auto text-slate-400">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </span>
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400">
        Uptime: <span className="font-medium text-slate-700 dark:text-slate-200">99.8%</span>
      </p>
    </button>
  );

  return (
    <div ref={ref} className="relative">
      {collapsed ? (
        <Tooltip
          className="block w-full"
          side="right"
          label={
            <span className="flex flex-col items-start">
              <span className="block">All Systems Operational</span>
              <span className="block text-[10px] font-normal text-slate-500 dark:text-slate-400">
                Uptime: 99.8%
              </span>
            </span>
          }
        >
          {button}
        </Tooltip>
      ) : (
        button
      )}

      {open && (
        <div
          role="dialog"
          aria-label="System health"
          className="absolute bottom-0 left-full z-50 mb-0 ml-2 w-72 animate-[expandDown_0.2s_ease-out] origin-bottom-left overflow-hidden rounded-xl border border-slate-200 bg-white shadow-pop dark:border-slate-700 dark:bg-[#111C2C]"
        >
          <div className="flex items-center gap-2 border-b border-slate-200 px-3 py-2.5 dark:border-slate-800">
            <HeartPulseIcon size={16} className="text-navy-700 dark:text-navy-500" />
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
              System Health
            </p>
          </div>
          <div className="max-h-72 overflow-auto p-2">
            <div className="mb-1 flex items-center justify-between rounded-lg px-2 py-1.5 text-sm">
              <span className="text-slate-600 dark:text-slate-300">Camera Streams</span>
              <span className="font-medium text-slate-800 dark:text-slate-100">
                {onlineCams} / {totalCams} Online
              </span>
            </div>
            {healthRows.map((s) => (
              <div
                key={s.name}
                className="flex items-center justify-between rounded-lg px-2 py-1.5 text-sm hover:bg-slate-50 dark:hover:bg-white/10"
              >
                <span className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
                  <span
                    className={`h-2 w-2 shrink-0 rounded-full ${toneDot[s.status] || toneDot.Unknown}`}
                    aria-hidden="true"
                  />
                  {s.name}
                </span>
                <span
                  className={`text-xs font-semibold ${
                    s.status === "Healthy" || s.status === "Online" || s.status === "Connected"
                      ? "text-success dark:text-green-400"
                      : s.status === "Warning"
                      ? "text-warning"
                      : s.status === "Offline"
                      ? "text-danger"
                      : "text-slate-500"
                  }`}
                >
                  {s.status}
                </span>
              </div>
            ))}
            <div className="mb-1 flex items-center justify-between rounded-lg px-2 py-1.5 text-sm">
              <span className="text-slate-600 dark:text-slate-300">Uptime</span>
              <span className="font-medium text-slate-800 dark:text-slate-100">99.8%</span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onNavigate?.();
              navigate("/analytics");
            }}
            className="btn-focus flex w-full items-center gap-2 border-t border-slate-200 px-3 py-2.5 text-sm font-medium text-navy-700 hover:bg-navy-50 dark:border-slate-800 dark:text-navy-500 dark:hover:bg-white/10"
          >
            <ExternalLinkIcon size={15} /> View System Health
          </button>
        </div>
      )}
    </div>
  );
}

export function SidebarContent({ onNavigate, showClose, onClose, collapsed, onToggleCollapse }) {
  return (
    <div className="flex h-full flex-col">
      {/* Brand */}
      <div
        className={`relative flex h-16 shrink-0 items-center ${
          collapsed ? "justify-center" : "gap-3 px-4"
        }`}
      >
        {showClose && (
          <button
            type="button"
            onClick={onClose}
            className="btn-focus absolute right-3 top-4 z-10 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10"
            aria-label="Close navigation menu"
          >
            <XIcon size={20} />
          </button>
        )}
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-navy-800 text-white shadow-sm">
          <ShieldIcon size={22} />
        </div>
        <div
          aria-hidden={collapsed}
          className={`overflow-hidden whitespace-nowrap transition-[max-width,opacity] duration-[180ms] ease-in-out ${
            collapsed ? "max-w-0 opacity-0" : "max-w-[180px] opacity-100 delay-100"
          }`}
        >
          <p className="text-lg font-bold leading-tight tracking-tight text-navy-900 dark:text-navy-300">
            IBVAP
          </p>
          <p className="text-[11px] leading-tight text-slate-500 dark:text-slate-400">
            Border Surveillance
          </p>
        </div>
      </div>

      {/* Expand / collapse control */}
      {onToggleCollapse && (
        <div
          className={`flex h-11 shrink-0 items-center ${
            collapsed ? "justify-center" : "justify-start px-3"
          }`}
        >
          <button
            type="button"
            onClick={onToggleCollapse}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className={`btn-focus flex h-9 w-9 items-center justify-center rounded-full transition-colors ${
              collapsed
                ? "border border-slate-200 text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:border-[#243247] dark:text-slate-400 dark:hover:bg-[#111C2C] dark:hover:text-slate-200"
                : "text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-[#111C2C] dark:hover:text-slate-200"
            }`}
          >
            {collapsed ? <MenuIcon size={17} /> : <ChevronLeftIcon size={17} />}
          </button>
        </div>
      )}

      <div
        className={`shrink-0 border-t border-slate-200 dark:border-[#243247] ${
          collapsed ? "mx-2 my-2" : "mx-3 my-2"
        }`}
      />

      {/* Navigation */}
      <nav
        className={`flex-1 space-y-1 overflow-y-auto ${collapsed ? "px-2" : "px-3"}`}
        aria-label="Main navigation"
      >
        {navItems.map((item) => (
          <div key={item.to} onClick={onNavigate}>
            <NavItem item={item} collapsed={collapsed} />
          </div>
        ))}
      </nav>

      {/* System status */}
      <div className="shrink-0 border-t border-slate-200 p-2 dark:border-[#243247]">
        <SystemStatusCard onNavigate={onNavigate} collapsed={collapsed} />
      </div>
    </div>
  );
}