import request from "./api";

// POST /auth/login  -> { success, message, data: { accessToken, tokenType, expiresIn, user } }
// The backend expects { email, password }.
export async function login(credentials) {
  const res = await request("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({
      email: credentials.email || credentials.username,
      password: credentials.password,
    }),
  });
  return res;
}

// GET /auth/demo-access -> whether the backend allows demo logins
// (DEMO_MODE). Only used to decide whether to show the Explore Demo section.
export async function getDemoAccess() {
  const res = await request("/api/auth/demo-access");
  return res;
}

// POST /auth/demo-login -> { role: "ADMINISTRATOR" | "SECURITY_OPERATOR" }
// Authenticates a dedicated demo account with the SAME response shape as a
// normal login ({ accessToken, tokenType, expiresIn, user }). No passwords,
// tokens or secrets are stored anywhere in the frontend.
export async function demoLogin(role) {
  const res = await request("/api/auth/demo-login", {
    method: "POST",
    body: JSON.stringify({ role }),
  });
  return res;
}

// GET /auth/me  -> validate a persisted token and return the current user.
// The Authorization header is attached automatically by the API client.
export async function getCurrentUser() {
  const res = await request("/api/auth/me");
  return res;
}

// PATCH /auth/profile  -> update the authenticated user's own profile.
// Currently only { fullName } is accepted by the backend.
export async function updateProfile(body) {
  const res = await request("/api/auth/profile", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
  return res;
}

// Records the authenticated logout before the local token is cleared.
export async function logout() {
  return request("/api/auth/logout", { method: "POST", body: JSON.stringify({}) });
}
