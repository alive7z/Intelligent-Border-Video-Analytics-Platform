import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { login as loginApi, logout as logoutApi, getCurrentUser, demoLogin as demoLoginApi, updateProfile as updateProfileApi } from "../services/authApi";
import { AUTH_UNAUTHORIZED_EVENT } from "../services/api";
import { roleLabel, roleKey } from "../utils/roles";
import {
  getToken,
  setToken,
  clearToken,
  readUser,
  saveUser,
} from "../utils/token";

const AuthContext = createContext(null);

function normalizeUser(rawUser) {
  if (!rawUser) return null;
  return {
    ...rawUser,
    // Display-friendly role the UI already understands, plus the raw backend key.
    role: roleLabel(rawUser.role),
    roleKey: roleKey(rawUser.role),
  };
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => normalizeUser(readUser()));
  const [token, setTokenState] = useState(() => getToken());
  const [status, setStatus] = useState(() => (getToken() ? "checking" : "idle"));
  const [isLoading, setIsLoading] = useState(() => Boolean(getToken()));

  // Guards the /auth/me restore effect so it does not re-validate (and possibly
  // wipe) a session that was just established by a fresh login.
  const freshLoginRef = useRef(false);

  useEffect(() => {
    if (token) setToken(token);
    else clearToken();
  }, [token]);

  useEffect(() => {
    saveUser(user);
  }, [user]);

  // The API client reports an expired/revoked session through an in-app event.
  // Updating context here lets ProtectedRoute redirect without reloading the
  // document. The API client also ignores stale 401s from older tokens.
  useEffect(() => {
    const handleUnauthorized = () => {
      freshLoginRef.current = false;
      setTokenState(null);
      setUser(null);
      setStatus("idle");
      setIsLoading(false);
    };
    window.addEventListener(AUTH_UNAUTHORIZED_EVENT, handleUnauthorized);
    return () => window.removeEventListener(AUTH_UNAUTHORIZED_EVENT, handleUnauthorized);
  }, []);

  // Session restoration (only on app load / refresh when a token already
  // exists). Does NOT run for a token established by an in-progress login:
  // login() sets freshLoginRef so the /auth/me call is skipped for that change
  // and the flag is cleared here (after state has committed) so future token
  // changes (logout) behave normally.
  useEffect(() => {
    if (freshLoginRef.current) {
      freshLoginRef.current = false;
      return;
    }
    if (!token) {
      setStatus("idle");
      setIsLoading(false);
      return;
    }
    let active = true;
    getCurrentUser()
      .then((res) => {
        if (!active) return;
        const raw = res?.data?.user || res?.data;
        if (raw) {
          setUser(normalizeUser(raw));
          setStatus("authenticated");
        } else {
          setTokenState(null);
          setUser(null);
          setStatus("idle");
        }
      })
      .catch(() => {
        if (!active) return;
        setTokenState(null);
        setUser(null);
        setStatus("idle");
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [token]);

  // Shared post-auth handling for BOTH normal login and demo login: persists
  // the token synchronously, normalizes the user, and flips status to
  // authenticated. Demo and normal sessions are indistinguishable here on
  // purpose (the backend issues the same JWT/session for both).
  const completeLogin = useCallback((data) => {
    if (!data.accessToken || !data.user) {
      throw new Error("The server returned an invalid login response.");
    }
    // Persist the token to storage synchronously so any request issued right
    // after login (e.g. dashboard mount -> getSummary) sees it immediately,
    // without waiting for the [token] persist effect to run during render.
    // Otherwise those requests fire with no Authorization header, get a 401,
    // and handleUnauthorized() does a full page reload back to login.
    setToken(data.accessToken);
    setTokenState(data.accessToken);
    const normalized = normalizeUser(data.user);
    setUser(normalized);
    setStatus("authenticated");
    setIsLoading(false);
    return normalized;
  }, []);

  const login = useCallback(async (credentials) => {
    freshLoginRef.current = true;
    setStatus("loading");
    setIsLoading(true);
    try {
      const res = await loginApi(credentials);
      return completeLogin(res.data || {});
    } catch (err) {
      freshLoginRef.current = false;
      setStatus("error");
      setIsLoading(false);
      throw err;
    }
  }, [completeLogin]);

  // Demo login for SIH/exhibition walkthroughs. Only rendered when the backend
  // reports demo access; the backend gates this behind DEMO_MODE and selects
  // preconfigured demo accounts. No credentials exist on this side.
  const loginWithDemo = useCallback(async (role) => {
    freshLoginRef.current = true;
    setStatus("loading");
    setIsLoading(true);
    try {
      const res = await demoLoginApi(role);
      return completeLogin(res.data || {});
    } catch (err) {
      freshLoginRef.current = false;
      setStatus("error");
      setIsLoading(false);
      throw err;
    }
  }, [completeLogin]);

  const logout = useCallback(async () => {
    try {
      if (getToken()) await logoutApi();
    } catch {
      // Logging out locally remains safe if the session already expired.
    } finally {
      clearToken();
      saveUser(null);
      setTokenState(null);
      setUser(null);
      setStatus("idle");
      setIsLoading(false);
    }
  }, []);

  const refreshUser = useCallback(async () => {
    const res = await getCurrentUser();
    const raw = res?.data?.user || res?.data;
    if (raw) setUser(normalizeUser(raw));
    return raw ? normalizeUser(raw) : null;
  }, []);

  // PATCH the authenticated user's own profile (e.g. display name) and refresh
  // local context so the header and persisted user stay in sync.
  const updateUser = useCallback(async (patch) => {
    const res = await updateProfileApi(patch);
    const raw = res?.data?.user || res?.data;
    if (raw) setUser(normalizeUser(raw));
    return res;
  }, []);

  const value = useMemo(
    () => ({
      user,
      token,
      status,
      isLoading,
      isAuthenticated: !!token,
      isChecking: status === "checking",
      login,
      loginWithDemo,
      logout,
      updateUser,
      refreshUser,
    }),
    [user, token, status, isLoading, login, loginWithDemo, logout, updateUser, refreshUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export default AuthContext;
