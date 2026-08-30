import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { login as loginApi } from "../services/authApi";

const AuthContext = createContext(null);

const TOKEN_KEY = "ibvap_token";
const USER_KEY = "ibvap_user";

function readUser() {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY)) || null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(readUser);
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY));
  const [status, setStatus] = useState("idle");

  // Persist token/user when they change.
  useEffect(() => {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  }, [token]);

  useEffect(() => {
    if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
    else localStorage.removeItem(USER_KEY);
  }, [user]);

  const login = useCallback(async (credentials) => {
    setStatus("loading");
    try {
      const res = await loginApi(credentials);
      setToken(res.data.token);
      setUser(res.data.user);
      setStatus("authenticated");
      return res.data.user;
    } catch (err) {
      setStatus("error");
      throw err;
    }
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    setStatus("idle");
  }, []);

  const value = useMemo(
    () => ({ user, token, status, isAuthenticated: !!token, login, logout }),
    [user, token, status, login, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export default AuthContext;
