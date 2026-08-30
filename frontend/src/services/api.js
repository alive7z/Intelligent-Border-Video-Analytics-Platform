// Base API client.
// All frontend requests should go through this module (or dedicated services
// that use it). It currently resolves local mock data so the UI is usable
// without a backend. When the Node.js REST API is ready, flip USE_MOCK to
// false (or remove the mock branch) and set VITE_API_BASE_URL accordingly.

const API_BASE_URL =
  import.meta.env?.VITE_API_BASE_URL || "http://localhost:3001";

// Set to false to route requests to the real backend.
const USE_MOCK = true;

let mockResolver = null;

/**
 * Register a mock resolver map: { '/api/cameras': () => [...] , ... }
 * Used to keep the services decoupled from the mock data while allowing
 * a future switch to live endpoints.
 */
export function setMockResolver(fn) {
  mockResolver = fn;
}

const delay = (ms = 300) =>
  new Promise((resolve) => setTimeout(resolve, ms));

async function mockRequest(url, options = {}) {
  await delay();
  if (!mockResolver) {
    throw new Error(`No mock resolver registered for ${url}`);
  }
  const result = mockResolver(url, options);
  if (result instanceof Promise) {
    return result;
  }
  return result ?? { data: null };
}

async function liveRequest(url, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };
  const token = localStorage.getItem("ibvap_token");
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const res = await fetch(`${API_BASE_URL}${url}`, {
    ...options,
    headers,
  });
  if (!res.ok) {
    const err = new Error(`Request failed: ${res.status} ${res.statusText}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

export const request = (url, options = {}) =>
  USE_MOCK ? mockRequest(url, options) : liveRequest(url, options);

export default request;
