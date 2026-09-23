import React, { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { EyeIcon, EyeOffIcon, MoonIcon, ShieldIcon, SunIcon, UserIcon } from "../components/common/Icons";
import Modal from "../components/common/Modal";
import Logo from "../components/common/Logo";
import { useAuth } from "../hooks/useAuth";
import { getDemoAccess } from "../services/authApi";
import {
  useLanguage,
  SUPPORTED_LANGUAGES,
} from "../hooks/useLanguage";
import { useTheme } from "../hooks/useTheme";

const DEMO_OPTIONS = [
  {
    role: "ADMINISTRATOR",
    title: "Explore as Administrator",
    loadingTitle: "Entering Admin Demo...",
    Icon: ShieldIcon,
  },
  {
    role: "SECURITY_OPERATOR",
    title: "Explore as Security Operator",
    loadingTitle: "Entering Operator Demo...",
    Icon: UserIcon,
  },
];

function Login() {
  const navigate = useNavigate();
  const [params] = useSearchParams();

  const {
    login,
    loginWithDemo,
    isAuthenticated,
    isChecking,
    isLoading,
  } = useAuth();

  const { lang, setLang } = useLanguage();
  const { isDark, toggleTheme } = useTheme();

  const [values, setValues] = useState({
    email: "",
    password: "",
  });

  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [demoEnabled, setDemoEnabled] = useState(false);
  const [demoLoading, setDemoLoading] = useState(null);

  // Ask the backend whether demo logins are allowed before showing the
  // Explore Demo section. Failures fall back to hidden (safe default).
  useEffect(() => {
    let active = true;

    getDemoAccess()
      .then((res) => {
        if (active) setDemoEnabled(Boolean(res?.data?.enabled));
      })
      .catch(() => {
        if (active) setDemoEnabled(false);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (isChecking || isLoading) return;

    if (isAuthenticated) {
      const redirect = params.get("redirect");

      navigate(
        redirect
          ? decodeURIComponent(redirect)
          : "/dashboard",
        { replace: true }
      );
    }
  }, [
    isAuthenticated,
    isChecking,
    isLoading,
    navigate,
    params,
  ]);

  const handleChange = (event) => {
    const { name, value } = event.target;

    setValues((current) => ({
      ...current,
      [name]: value,
    }));

    if (error) {
      setError("");
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    setError("");

    if (!values.email || !values.password) {
      setError("Please enter your email and password.");
      return;
    }

    setLoading(true);

    try {
      const user = await login({
        email: values.email,
        password: values.password,
      });

      if (user) {
        const redirect = params.get("redirect");

        navigate(
          redirect
            ? decodeURIComponent(redirect)
            : "/dashboard",
          { replace: true }
        );
      }
    } catch (err) {
      setError(
        err?.message || "Invalid email or password."
      );
    } finally {
      setLoading(false);
    }
  };

  const handleDemoLogin = async (role) => {
    if (demoLoading) return;

    setError("");
    setDemoLoading(role);

    try {
      const user = await loginWithDemo(role);

      if (user) {
        navigate("/dashboard", { replace: true });
      }
    } catch (err) {
      setError(
        err?.message || "Unable to enter demo mode. Please try again."
      );
    } finally {
      setDemoLoading(null);
    }
  };

  return (
    <main className="login-page relative flex min-h-screen items-center justify-center overflow-hidden px-5 py-10">
      <div className="relative z-10 w-full max-w-[480px]">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl shadow-sm"><Logo size={36} rounded={false} /></div>
            <div>
              <p className="text-xl font-semibold tracking-tight text-primary">IBVAP</p>
              <p className="text-xs text-muted">Border surveillance command</p>
            </div>
          </div>
          <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-1 dark:bg-slate-50">
            {SUPPORTED_LANGUAGES.map((language) => (
              <button
                key={language.code}
                type="button"
                onClick={() => setLang(language.code)}
                className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition ${lang === language.code ? "bg-blue-600 text-white" : "text-muted hover:bg-slate-100 hover:text-slate-800 dark:hover:text-white/90"}`}
              >
                {language.label}
              </button>
            ))}
            <button type="button" onClick={toggleTheme} className="btn-focus flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-slate-100 hover:text-slate-800 dark:hover:text-white/90" aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}>
              {isDark ? <SunIcon size={16} /> : <MoonIcon size={16} />}
            </button>
          </div>
        </div>

        <section className="login-card rounded-2xl border px-6 py-8 sm:px-9 sm:py-9">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-primary sm:text-[28px]">
              Welcome Back
            </h1>

            <p className="mt-2 text-sm text-muted">
              Enter your credentials to access your account.
            </p>
          </div>

          <form
            onSubmit={handleSubmit}
            className="mt-8"
            noValidate
          >
            <div className="space-y-4">
              <div className="group relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    className="h-5 w-5 text-muted transition group-focus-within:text-blue-600"
                    aria-hidden="true"
                  >
                    <rect
                      x="3"
                      y="5"
                      width="18"
                      height="14"
                      rx="2.5"
                      stroke="currentColor"
                      strokeWidth="1.7"
                      strokeLinejoin="round"
                    />

                    <path
                      d="m5 7 7 5.5L19 7"
                      stroke="currentColor"
                      strokeWidth="1.7"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>

                <input
                  id="email"
                  name="email"
                  type="email"
                  aria-label="Email address"
                  value={values.email}
                  onChange={handleChange}
                  autoComplete="email"
                  placeholder="Enter your email"
                  className="input-field h-[52px] !pl-12 !pr-4"
                />
              </div>

              <div className="group relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    className="h-5 w-5 text-muted transition group-focus-within:text-blue-600"
                    aria-hidden="true"
                  >
                    <rect
                      x="5"
                      y="10"
                      width="14"
                      height="10"
                      rx="2"
                      fill="currentColor"
                    />

                    <path
                      d="M8 10V7.5a4 4 0 0 1 8 0V10"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />

                    <circle
                      cx="12"
                      cy="15"
                      r="1.2"
                      fill="white"
                    />
                  </svg>
                </div>

                <input
                  id="password"
                  name="password"
                  aria-label="Password"
                  type={
                    showPassword
                      ? "text"
                      : "password"
                  }
                  value={values.password}
                  onChange={handleChange}
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  className="input-field h-[52px] !pl-12 !pr-12"
                />

                <button
                  type="button"
                  onClick={() =>
                    setShowPassword(
                      (current) => !current
                    )
                  }
                  className="absolute inset-y-0 right-0 flex items-center px-5 text-muted transition hover:text-blue-600 focus:outline-none"
                  aria-label={
                    showPassword
                      ? "Hide password"
                      : "Show password"
                  }
                >
                  {showPassword ? (
                    <EyeOffIcon size={19} />
                  ) : (
                    <EyeIcon size={19} />
                  )}
                </button>
              </div>
            </div>

            {error && (
              <div
                role="alert"
                className="mt-5 rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600"
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="btn-focus mt-6 flex h-12 w-full items-center justify-center rounded-lg bg-blue-600 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {loading ? (
                <div className="flex items-center gap-3">
                  <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                  Signing In...
                </div>
              ) : (
                "Sign In"
              )}
            </button>
          </form>

          {demoEnabled && (
            <div className="mt-7">
              <div className="flex items-center gap-3" role="separator" aria-label="Explore Demo">
                <span className="h-px flex-1 bg-slate-200 dark:bg-white/10" />
                <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
                  Explore Demo
                </span>
                <span className="h-px flex-1 bg-slate-200 dark:bg-white/10" />
              </div>

              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {DEMO_OPTIONS.map(({ role, title, loadingTitle, description, Icon }) => (
                  <button
                    key={role}
                    type="button"
                    onClick={() => handleDemoLogin(role)}
                    disabled={demoLoading !== null || loading}
                    className="btn-focus group flex flex-col items-start gap-1 rounded-xl border border-slate-200 bg-white px-4 py-3 text-left transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
                  >
                    <span className="flex items-center gap-2 text-sm font-semibold text-secondary dark:text-white/90">
                      <Icon
                        size={16}
                        className="shrink-0 text-muted transition group-hover:text-blue-600"
                      />
                      {demoLoading === role ? (
                        <>
                          <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600 dark:border-white/30 dark:border-t-white" />
                          {loadingTitle}
                        </>
                      ) : (
                        title
                      )}
                    </span>
                    <span className="mt-0.5 pl-6 text-xs leading-5 text-muted">
                      {description}
                    </span>
                  </button>
                ))}
              </div>

              <p className="mt-3 text-center text-[11px] text-muted">
                Demo Access — For presentation/testing only
              </p>
            </div>
          )}
        </section>

        <div className="mt-6 text-center text-sm">
          <span className="text-muted">
            Forgot your password?{" "}
          </span>

          <button
            type="button"
            onClick={() => setForgotOpen(true)}
            className="font-medium text-blue-500 transition hover:text-blue-700"
          >
            Reset Password
          </button>
        </div>

        <div className="mt-5 text-center">
          <p className="text-xs font-medium tracking-wide text-muted">
            IBVAP · Intelligent Border Video Analytics Platform
          </p>
        </div>
      </div>

      <Modal
        open={forgotOpen}
        onClose={() => setForgotOpen(false)}
        title="Reset Password"
      >
        <p className="text-sm leading-6 text-secondary">
          Password resets are handled by the platform
          administrator. Please contact the National Border
          Command Centre help desk to reset your password.
        </p>

        <p className="mt-3 text-xs leading-5 text-muted">
          Self-service password reset will be available after
          the authentication backend is fully configured.
        </p>
      </Modal>
    </main>
  );
}

export default Login;
