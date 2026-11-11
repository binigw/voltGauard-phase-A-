/**
 * Motor deletion proxy — Vercel serverless function.
 *
 * Same trust-boundary pattern as /api/register-motor: the backend's
 * decommissioning endpoint (DELETE /api/v2/admin/motor-assets/{id})
 * requires the ADMIN API key, which never ships to the browser.
 *
 *   1. The caller sends their Supabase session token as a Bearer header.
 *   2. The token is verified against Supabase Auth.
 *   3. The caller's role is read from public.user_roles THROUGH THEIR
 *      OWN SESSION (RLS — own row only) and must be "admin".
 *   4. The DELETE is forwarded with BOTH the caller's Bearer token and
 *      server-only SIGMO_ADMIN_API_KEY; Render independently revalidates
 *      session and DB role.
 *
 * The backend itself refuses (409) when the motor has telemetry or
 * fault history — the audit trail is immutable. That status is passed
 * through so the UI can show the honest reason.
 */

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

function str(value) {
  return typeof value === "string" ? value.trim() : "";
}

const ALLOWED_MOTOR_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return json(res, 405, { error: "method_not_allowed" });
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;
  const apiBase = (process.env.VITE_API_BASE_URL || "").replace(/\/+$/, "");
  const adminKey = process.env.SIGMO_ADMIN_API_KEY;

  if (!supabaseUrl || !supabaseAnonKey || !apiBase || !adminKey) {
    console.error("delete-motor: missing server configuration");
    return json(res, 500, { error: "server_not_configured" });
  }

  const body = typeof req.body === "object" && req.body !== null ? req.body : {};
  const authHeader = str(req.headers.authorization);
  const sessionToken = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : "";
  const motorId = str(body.motorId);

  if (!ALLOWED_MOTOR_ID.test(motorId)) {
    return json(res, 400, { error: "invalid_motor_id" });
  }
  if (!sessionToken) {
    return json(res, 401, { error: "missing_session" });
  }

  // ---- 1) Verify the session -----------------------------------------
  let userId;
  try {
    const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${sessionToken}`,
      },
    });
    if (userResponse.status === 401 || userResponse.status === 403) {
      return json(res, 401, { error: "invalid_session" });
    }
    if (!userResponse.ok) {
      return json(res, 502, { error: "auth_check_failed" });
    }
    const user = await userResponse.json();
    userId = user && user.id;
    if (!userId) {
      return json(res, 401, { error: "invalid_session" });
    }
  } catch {
    return json(res, 502, { error: "auth_check_failed" });
  }

  // ---- 2) Server-side RBAC: admin only --------------------------------
  let role = null;
  try {
    const rolesResponse = await fetch(
      `${supabaseUrl}/rest/v1/user_roles?select=role&user_id=eq.${encodeURIComponent(userId)}`,
      {
        headers: {
          apikey: supabaseAnonKey,
          Authorization: `Bearer ${sessionToken}`,
        },
      },
    );
    if (!rolesResponse.ok) {
      return json(res, 502, { error: "role_check_failed" });
    }
    const rows = await rolesResponse.json();
    role = Array.isArray(rows) && rows.length > 0 ? rows[0].role : null;
  } catch {
    return json(res, 502, { error: "role_check_failed" });
  }

  if (role !== "admin") {
    // Fail closed: missing row, technician, or anything unexpected.
    return json(res, 403, { error: "forbidden" });
  }

  // ---- 3) Forward the DELETE with the admin key -----------------------
  try {
    const backendResponse = await fetch(
      `${apiBase}/api/v2/admin/motor-assets/${encodeURIComponent(motorId)}`,
      {
        method: "DELETE",
        headers: {
          "X-API-Key": adminKey,
          Authorization: `Bearer ${sessionToken}`,
        },
      },
    );
    const backendBody = await backendResponse.json().catch(() => ({}));
    if (backendResponse.status === 409) {
      // Motor has telemetry/fault history — the immutable audit trail.
      return json(res, 409, { error: "has_history" });
    }
    if (backendResponse.status === 404) {
      return json(res, 404, { error: "not_found" });
    }
    if (!backendResponse.ok) {
      return json(res, 502, {
        error: "backend_rejected",
        detail: backendBody && backendBody.detail ? backendBody.detail : null,
        status: backendResponse.status,
      });
    }
    return json(res, 200, backendBody);
  } catch {
    return json(res, 502, { error: "backend_unreachable" });
  }
};
