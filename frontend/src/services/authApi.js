import request from "./api";

// POST /api/auth/login
export async function login(credentials) {
  const data = await request("/api/auth/login", {
    method: "POST",
    body: JSON.stringify(credentials),
  });
  return data;
}

// (Optional future) GET /api/auth/me  -> validate a persisted token
export async function getCurrentUser(token) {
  const data = await request("/api/auth/me", {
    headers: { Authorization: `Bearer ${token}` },
  });
  return data;
}
