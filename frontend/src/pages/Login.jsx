import React, { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  ShieldIcon,
  EyeIcon,
  EyeOffIcon,
  CctvIcon,
} from "../components/common/Icons";
import Button from "../components/common/Button";
import Input from "../components/common/Input";
import Modal from "../components/common/Modal";
import { useAuth } from "../hooks/useAuth";
import { useLanguage, SUPPORTED_LANGUAGES } from "../hooks/useLanguage";

function Login() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { login } = useAuth();
  const { lang, setLang } = useLanguage();

  const [values, setValues] = useState({ username: "", password: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);

  const handleChange = (e) =>
    setValues((v) => ({ ...v, [e.target.name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (!values.username || !values.password) {
      setError("Please enter username and password.");
      return;
    }
    setLoading(true);
    try {
      await login(values);
      const redirect = params.get("redirect");
      navigate(redirect ? decodeURIComponent(redirect) : "/dashboard");
    } catch (err) {
      setError("Invalid username or password");
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-white">
      {/* Left branding panel */}
      <div className="relative hidden w-1/2 flex-col justify-between overflow-hidden bg-navy-900 p-12 text-white lg:flex xl:w-3/5">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }}
          aria-hidden="true"
        />
        <div className="relative flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-white/10">
            <ShieldIcon size={30} />
          </div>
          <div>
            <p className="text-3xl font-bold tracking-tight">IBVAP</p>
            <p className="text-sm text-navy-200">
              Intelligent Border Video Analytics Platform
            </p>
          </div>
        </div>

        <div className="relative max-w-md">
          <h2 className="text-3xl font-semibold leading-tight">
            Secure Border Surveillance Command System
          </h2>
          <p className="mt-4 text-navy-200">
            AI-Powered Intelligent Surveillance using Existing CCTV
            Infrastructure
          </p>
          <ul className="mt-8 space-y-3 text-sm text-navy-100">
            <li className="flex items-center gap-3">
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-white/10">
                <CctvIcon size={16} />
              </span>
              Live surveillance across border sectors
            </li>
            <li className="flex items-center gap-3">
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-white/10">
                <ShieldIcon size={16} />
              </span>
              AI detection, tracking and alerting
            </li>
            <li className="flex items-center gap-3">
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-white/10">
                <CctvIcon size={16} />
              </span>
              Works with existing IP/RTSP cameras
            </li>
          </ul>
        </div>

        <p className="relative text-xs text-navy-300">
          © 2026 Government of India · National Border Command Centre (demo)
        </p>
      </div>

      {/* Right login card */}
      <div className="flex w-full items-center justify-center px-6 py-12 lg:w-1/2 xl:w-2/5">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-navy-800 text-white">
              <ShieldIcon size={24} />
            </div>
            <div>
              <p className="text-xl font-bold text-navy-900">IBVAP</p>
              <p className="text-xs text-slate-500">
                Intelligent Border Video Analytics Platform
              </p>
            </div>
          </div>

          <h1 className="text-2xl font-bold text-slate-900">Welcome Back</h1>
          <p className="mt-1 text-sm text-slate-500">
            Sign in to access the surveillance command dashboard.
          </p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-4" noValidate>
            <Input
              id="username"
              name="username"
              label="Username / Email"
              placeholder="operator"
              autoComplete="username"
              value={values.username}
              onChange={handleChange}
            />
            <Input
              id="password"
              name="password"
              label="Password"
              type={showPassword ? "text" : "password"}
              placeholder="••••••••"
              autoComplete="current-password"
              value={values.password}
              onChange={handleChange}
              rightElement={
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  className="btn-focus rounded p-1.5 text-slate-400 hover:text-slate-600"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOffIcon size={18} /> : <EyeIcon size={18} />}
                </button>
              }
            />

            {error && (
              <p
                role="alert"
                className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
              >
                {error}
              </p>
            )}

            <div className="flex items-center justify-between text-sm">
              <label className="flex cursor-pointer items-center gap-2 text-slate-600">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-navy-700 focus:ring-navy-500"
                />
                Remember Me
              </label>
              <button
                type="button"
                onClick={() => setForgotOpen(true)}
                className="btn-focus font-medium text-navy-700 hover:text-navy-900"
              >
                Forgot Password?
              </button>
            </div>

            <Button type="submit" fullWidth size="lg" loading={loading}>
              {loading ? "Signing in..." : "Sign In"}
            </Button>
          </form>

          <div className="mt-8 border-t border-slate-200 pt-5 text-sm text-slate-500">
            Demo credentials:
            <br />
            <span className="font-medium text-slate-700">operator</span> /{" "}
            <span className="font-medium text-slate-700">op1234</span>
          </div>

          <div className="mt-6 flex items-center gap-3">
            <span className="text-xs text-slate-400">Language:</span>
            {SUPPORTED_LANGUAGES.map((l) => (
              <button
                key={l.code}
                type="button"
                onClick={() => setLang(l.code)}
                className={`btn-focus rounded-md px-2 py-1 text-xs font-medium ${
                  lang === l.code
                    ? "bg-navy-700 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {l.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <Modal
        open={forgotOpen}
        onClose={() => setForgotOpen(false)}
        title="Forgot Password"
      >
        <p className="text-sm text-slate-600">
          Password resets are handled by the platform administrator. Please
          contact the National Border Command Centre help desk to reset your
          password.
        </p>
        <p className="mt-2 text-xs text-slate-500">
          Self-service password reset will be available after the real
          authentication backend is connected.
        </p>
      </Modal>
    </div>
  );
}

export default Login;
