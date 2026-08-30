import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  BellIcon,
  ChevronDownIcon,
  GlobeIcon,
  LogOutIcon,
  MenuIcon,
  UserIcon,
  SettingsIcon,
  ExternalLinkIcon,
} from "../common/Icons";
import Tooltip from "../common/Tooltip";
import { useAuth } from "../../hooks/useAuth";
import { SUPPORTED_LANGUAGES } from "../../hooks/useLanguage";

const notifications = [
  { id: 1, level: "HIGH", tag: "bg-red-50 text-red-700 border-red-200 dark:bg-red-500/15 dark:text-red-300 dark:border-red-500/40", title: "Restricted Zone Intrusion", meta: "CAM-05 · East Sector", time: "2 min ago" },
  { id: 2, level: "MEDIUM", tag: "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-500/15 dark:text-orange-300 dark:border-orange-500/40", title: "Night Movement", meta: "CAM-03 · North Sector", time: "7 min ago" },
  { id: 3, level: "LOW", tag: "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-700/40 dark:text-slate-300 dark:border-slate-600", title: "Camera Offline: CAM-04", meta: "Signal lost", time: "12 min ago" },
];

function ProfileDropdown({ onLogout }) {
  const { user } = useAuth();
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

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="btn-focus flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-slate-100 dark:hover:bg-white/10"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-navy-700 text-white dark:bg-navy-700">
          <UserIcon size={16} />
        </span>
        <span className="hidden text-left sm:block">
          <span className="block text-sm font-medium leading-tight text-slate-800 dark:text-slate-100">
            {user?.name || "Amit Verma"}
          </span>
          <span className="block text-xs leading-tight text-slate-500 dark:text-slate-400">
            Security Operator
          </span>
        </span>
        <ChevronDownIcon size={16} className="text-slate-400" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-40 mt-2 w-44 animate-[dropdownIn_0.16s_ease-out] origin-top-right overflow-hidden rounded-xl border border-slate-200 bg-white shadow-pop dark:border-slate-700 dark:bg-[#111C2C]"
        >
          <div className="border-b border-slate-100 px-4 py-3 dark:border-slate-800">
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
              {user?.name || "Amit Verma"}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">Security Operator</p>
          </div>
          <button
            role="menuitem"
            className="btn-focus flex w-full items-center gap-2 px-4 py-2 text-sm text-slate-700 transition-colors hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-white/20"
            onClick={() => {
              setOpen(false);
              navigate("/admin");
            }}
          >
            <UserIcon size={16} /> Profile
          </button>
          <button
            role="menuitem"
            className="btn-focus flex w-full items-center gap-2 px-4 py-2 text-sm text-slate-700 transition-colors hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-white/20"
            onClick={() => {
              setOpen(false);
              navigate("/admin");
            }}
          >
            <SettingsIcon size={16} /> Preferences
          </button>
          <button
            role="menuitem"
            className="btn-focus flex w-full items-center gap-2 border-t border-slate-100 px-4 py-2 text-sm text-red-600 transition-colors hover:bg-red-50 dark:border-slate-800 dark:text-red-400 dark:hover:bg-red-500/10"
            onClick={onLogout}
          >
            <LogOutIcon size={16} /> Logout
          </button>
        </div>
      )}
    </div>
  );
}

function LanguageSelect({ lang, setLang }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const close = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const current = SUPPORTED_LANGUAGES.find((l) => l.code === lang) || SUPPORTED_LANGUAGES[0];

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="btn-focus flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-slate-600 transition-colors hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <GlobeIcon size={16} />
        <span className="hidden md:inline">{current.label}</span>
        <ChevronDownIcon size={14} className="text-slate-400" />
      </button>
      {open && (
        <div
          role="listbox"
          className="absolute right-0 top-full z-40 mt-2 w-32 animate-[dropdownIn_0.16s_ease-out] origin-top-right overflow-hidden rounded-xl border border-slate-200 bg-white shadow-pop dark:border-slate-700 dark:bg-[#111C2C]"
        >
          {SUPPORTED_LANGUAGES.map((l) => (
            <button
              key={l.code}
              role="option"
              aria-selected={l.code === lang}
              className={`btn-focus flex w-full px-3 py-2 text-left text-sm transition-colors hover:bg-slate-50 dark:hover:bg-white/20 ${
                l.code === lang
                  ? "font-medium text-navy-700 dark:text-navy-500"
                  : "text-slate-700 dark:text-slate-200"
              }`}
              onClick={() => {
                setLang(l.code);
                setOpen(false);
              }}
            >
              {l.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function NotificationPanel({ open, setOpen, ref }) {
  const navigate = useNavigate();
  return (
    <div
      className="absolute right-0 top-full z-40 mt-2 w-[360px] max-w-[calc(100vw-2rem)] animate-[dropdownIn_0.16s_ease-out] origin-top-right overflow-hidden rounded-xl border border-slate-200 bg-white shadow-pop dark:border-slate-700 dark:bg-[#111C2C]"
      ref={ref}
    >
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5 dark:border-slate-800">
        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Notifications</p>
        <span className="rounded-full bg-navy-50 px-2 py-0.5 text-[11px] font-semibold text-navy-700 dark:bg-navy-500/20 dark:text-navy-500">
          {notifications.length} new
        </span>
      </div>
      <div className="max-h-72 overflow-auto">
        {notifications.map((n) => (
          <button
            key={n.id}
            className="btn-focus w-full border-b border-slate-50 px-4 py-3 text-left transition-colors hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-[#162235]"
            onClick={() => {
              setOpen(false);
              navigate("/alerts");
            }}
          >
            <div className="mb-1 flex items-center gap-2">
              <span
                className={`inline-flex rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase ${n.tag}`}
              >
                {n.level}
              </span>
              <span className="ml-auto text-[11px] text-slate-400">{n.time}</span>
            </div>
            <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{n.title}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">{n.meta}</p>
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={() => {
          setOpen(false);
          navigate("/alerts");
        }}
        className="btn-focus flex w-full items-center justify-center gap-1.5 border-t border-slate-100 px-4 py-2.5 text-sm font-medium text-navy-700 transition-colors hover:bg-navy-50 dark:border-slate-800 dark:text-navy-500 dark:hover:bg-white/20"
      >
        <ExternalLinkIcon size={15} /> View All Alerts
      </button>
    </div>
  );
}

export function Header({ onMenuClick, lang, setLang }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [notifOpen, setNotifOpen] = useState(false);
  const notifRef = useRef(null);

  useEffect(() => {
    if (!notifOpen) return;
    const close = (e) => {
      if (notifRef.current && !notifRef.current.contains(e.target)) setNotifOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [notifOpen]);

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <div className="sticky top-0 z-20">
      <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-4 transition-colors dark:border-slate-800 dark:bg-[#081525] lg:px-4">
      <div className="flex items-center gap-3">
        {/* Mobile hamburger */}
        <button
          type="button"
          onClick={onMenuClick}
          className="btn-focus rounded-lg p-2 text-slate-600 transition-colors hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10 lg:hidden"
          aria-label="Open navigation menu"
        >
          <MenuIcon size={20} />
        </button>
        <div>
          <h1 className="text-base font-semibold leading-tight text-slate-800 dark:text-slate-100">
            IBVAP – Intelligent Border Video Analytics Platform
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Border Surveillance Command Dashboard
          </p>
        </div>
      </div>

      <div className="flex items-center gap-1.5 lg:gap-2">
        <LanguageSelect lang={lang} setLang={setLang} />

        <div className="relative">
          <Tooltip label="Notifications" side="bottom">
            <button
              type="button"
              onClick={() => setNotifOpen((o) => !o)}
              className="btn-focus relative flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-slate-200"
              aria-label="Notifications"
              aria-expanded={notifOpen}
            >
              <BellIcon size={19} />
              <span className="absolute right-1.5 top-1.5 flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-danger opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-danger" />
              </span>
            </button>
          </Tooltip>
          {notifOpen && <NotificationPanel ref={notifRef} open={notifOpen} setOpen={setNotifOpen} />}
        </div>

        <ProfileDropdown onLogout={handleLogout} />
      </div>
      </header>
      <div
        className="h-[3px] w-full"
        style={{
          background:
            "linear-gradient(90deg, #F28C28 0%, #F28C28 33%, transparent 34%, transparent 66%, #16a34a 66%, #16a34a 100%)",
        }}
        aria-hidden="true"
      />
    </div>
  );
}
