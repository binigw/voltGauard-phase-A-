/**
 * Motor asset registry read — Vercel serverless function.
 *
 * Companion to /api/register-motor: the backend's asset registry
 * (GET /api/v2/admin/motor-assets) requires the ADMIN API key, which
 * never ships to the browser. This function is the dashboard-scope
 * read endpoint the frontend was waiting for:
 *
 *   1. The caller presents their Supabase session token
 *      (Authorization: Bearer <token>).
 *   2. The token is verified against Supabase Auth.
 *   3. The caller must have a user_roles row (admin or technician —
 *      the registry is physical plant data both roles may read).
 *      No row / bad token -> fail closed (401/403).
 *   4. The asset list is fetched with BOTH the server-only Admin key and
 *      caller Bearer token. Render independently revalidates both.
 *      Technicians receive it WITHOUT downtime_cost_etb_per_hour —
 *      financial exposure stays on the executive surface.
 *
 * The UI uses this to show commissioned-but-not-yet-streaming motors
 * as "Awaiting telemetry" rows instead of silently hiding them.
 */

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

function num(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeAsset(raw) {
  if (!raw || typeof raw !== "object") return null;
  const motorId = typeof raw.motor_id === "string" ? raw.motor_id.trim() : "";
  if (!motorId) return null;
  return {
    motor_id: motorId,
    mcc_panel_id: typeof raw.mcc_panel_id === "string" ? raw.mcc_panel_id : "",
    cabinet_number:
      typeof raw.cabinet_number === "string" ? raw.cabinet_number : "",
    line_zone_id: typeof raw.line_zone_id === "string" ? raw.line_zone_id : "",
    nameplate_kw: num(raw.nameplate_kw),
    rated_rpm: num(raw.rated_rpm),
    drive_type: raw.drive_type === "DOL" || raw.drive_type === "SOFT_STARTER" || raw.drive_type === "VFD"
      ? raw.drive_type
      : "DOL",
    asset_tag: typeof raw.asset_tag === "string" ? raw.asset_tag : null,
    bearing_part_number:
      typeof raw.bearing_part_number === "string" ? raw.bearing_part_number : null,
    spare_capacitor_spec:
      typeof raw.spare_capacitor_spec === "string" ? raw.spare_capacitor_spec : null,
    baseline_state:
      typeof raw.baseline_state === "string" ? raw.baseline_state : null,
    downtime_cost_etb_per_hour: num(raw.downtime_cost_etb_per_hour),
  };
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    return json(res, 405, { error: "method_not_allowed" });
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;
  const apiBase = (process.env.VITE_API_BASE_URL || "").replace(/\/+$/, "");
  const adminKey = process.env.SIGMO_ADMIN_API_KEY;

  if (!supabaseUrl || !supabaseAnonKey || !apiBase || !adminKey) {
    console.error("motor-assets: missing server configuration");
    return json(res, 500, { error: "server_not_configured" });
  }

  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : "";
  if (!token) {
    return json(res, 401, { error: "missing_session" });
  }

  // ---- 1) Verify the session ------------------------------------------
  let userId;
  try {
    const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${token}`,
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

  // ---- 2) RBAC: the caller's own user_roles row ------------------------
  let role = null;
  try {
    const rolesResponse = await fetch(
      `${supabaseUrl}/rest/v1/user_roles?select=role&user_id=eq.${encodeURIComponent(userId)}`,
      {
        headers: {
          apikey: supabaseAnonKey,
          Authorization: `Bearer ${token}`,
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

  if (role !== "admin" && role !== "technician") {
    return json(res, 403, { error: "forbidden" });
  }

  // ---- 3) Fetch the registry with the server-held admin key ------------
  try {
    const backendResponse = await fetch(`${apiBase}/api/v2/admin/motor-assets`, {
      headers: {
        "X-API-Key": adminKey,
        Authorization: `Bearer ${token}`,
      },
    });
    if (!backendResponse.ok) {
      return json(res, 502, { error: "backend_unavailable" });
    }
    const rawList = await backendResponse.json();
    const assets = (Array.isArray(rawList) ? rawList : [])
      .map(normalizeAsset)
      .filter(Boolean);
    // Financial exposure (downtime cost) is executive-surface data.
    if (role !== "admin") {
      for (const asset of assets) {
        delete asset.downtime_cost_etb_per_hour;
      }
    }
    return json(res, 200, { assets });
  } catch {
    return json(res, 502, { error: "backend_unreachable" });
  }
};
