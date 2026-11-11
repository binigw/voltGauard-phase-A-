import { getSupabase } from "@/lib/supabase-client";

function readConfiguredApiUrl(): string {
  const candidates = [
    import.meta.env.VITE_API_URL,
    import.meta.env.VITE_API_BASE_URL,
  ];

  return candidates.find(
    (value): value is string => typeof value === "string" && value.trim() !== "",
  )?.trim() ?? "";
}

function normalizeApiBaseUrl(value: string): string {
  const withoutTrailingSlashes = value.replace(/\/+$/, "");
  return withoutTrailingSlashes.replace(/\/api$/i, "");
}

const apiBaseUrl = normalizeApiBaseUrl(readConfiguredApiUrl());

export function getApiBaseUrl(): string {
  return apiBaseUrl;
}

export function apiUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return apiBaseUrl ? `${apiBaseUrl}${normalizedPath}` : normalizedPath;
}

/**
 * User API transport.
 *
 * A browser-visible VITE key is never an authorization credential. Every
 * signed-in request carries the current Supabase access token; Render
 * validates that token and resolves the DB role server-side. Open endpoints
 * also tolerate the absence of a session.
 */
export async function apiFetch(
  input: string | URL | Request,
  init?: RequestInit,
): Promise<Response> {
  const headers = buildHeaders(input, init);
  if (!headers.has("Authorization")) {
    const { data } = await getSupabase().auth.getSession();
    const token = data.session?.access_token;
    if (token) headers.set("Authorization", `Bearer ${token}`);
  }

  const requestInput = typeof input === "string" ? apiUrl(input) : input;
  return fetch(requestInput, { ...init, headers });
}

function buildHeaders(
  input: string | URL | Request,
  init?: RequestInit,
): Headers {
  const headers = new Headers(
    typeof Request !== "undefined" && input instanceof Request
      ? input.headers
      : undefined,
  );
  new Headers(init?.headers).forEach((value, key) => headers.set(key, value));
  return headers;
}
