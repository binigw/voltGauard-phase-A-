/**
 * Motor registration proxy — Vercel serverless function.
 *
 * WHY THIS EXISTS: the V2 backend's commissioning endpoint
 * (PUT /api/v2/admin/motor-assets/{motor_id}) requires the ADMIN API
 * key, and no write-scope credential may ever ship to the browser.
 * This function is the trust boundary:
 *
 *   1. The caller sends their Supabase session token as a Bearer header.
 *   2. The token is verified against Supabase Auth (GET /auth/v1/user).
 *   3. The caller's role is read from public.user_roles THROUGH THEIR
 *      OWN SESSION (PostgREST + RLS — they can only ever see their own
 *      row), and must be "admin".
 *   4. Only then is the payload forwarded with BOTH the caller's Bearer
 *      token and the server-only SIGMO_ADMIN_API_KEY. Render revalidates
 *      the session and DB role, so the static key alone is insufficient.
 *
 * Everything is fail-closed: missing/bad token -> 401, non-admin ->
 * 403, backend trouble -> 502. The admin key never leaves the server.
 */

const ALLOWED_MOTOR_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const DRIVE_TYPES = new Set(["DOL", "SOFT_STARTER", "VFD"]);

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

function str(value) {
  return typeof value === "string" ? value.trim() : "";
}

function optionalStr(value) {
  const s = str(value);
  return s.length > 0 ? s : null;
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return json(res, 405, { error: "method_not_allowed" });
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;
  const apiBase = (process.env.VITE_API_BASE_URL || "").replace(/\/+$/, "");
  const adminKey = process.env.SIGMO_ADMIN_API_KEY;

  if (!supabaseUrl || !supabaseAnonKey || !apiBase || !adminKey) {
    console.error("register-motor: missing server configuration");
    return json(res, 500, { error: "server_not_configured" });
  }

  const body = typeof req.body === "object" && req.body !== null ? req.body : {};
  const authHeader = str(req.headers.authorization);
  const sessionToken = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : "";
  const motorId = str(body.motorId);

  // ---- Validate the payload before any network calls ------------------
  if (!ALLOWED_MOTOR_ID.test(motorId)) {
    return json(res, 400, { error: "invalid_motor_id" });
  }

  const mccPanelId = str(body.mccPanelId);
  const cabinetNumber = str(body.cabinetNumber);
  const lineZoneId = str(body.lineZoneId);
  const nameplateKw = Number(body.nameplateKw);
  const ratedRpm = Number(body.ratedRpm);
  const driveType = str(body.driveType);

  if (!mccPanelId || !cabinetNumber || !lineZoneId) {
    return json(res, 400, { error: "missing_location_fields" });
  }
  if (!Number.isFinite(nameplateKw) || nameplateKw <= 0) {
    return json(res, 400, { error: "invalid_nameplate_kw" });
  }
  if (!Number.isInteger(ratedRpm) || ratedRpm <= 0) {
    return json(res, 400, { error: "invalid_rated_rpm" });
  }
  if (!DRIVE_TYPES.has(driveType)) {
    return json(res, 400, { error: "invalid_drive_type" });
  }

  const downtimeRaw = body.downtimeCostEtbPerHour;
  let downtimeCostEtbPerHour = null;
  if (downtimeRaw !== undefined && downtimeRaw !== null && downtimeRaw !== "") {
    const value = Number(downtimeRaw);
    if (!Number.isFinite(value) || value <= 0) {
      return json(res, 400, { error: "invalid_downtime_cost" });
    }
    downtimeCostEtbPerHour = value;
  }

  // ---- 1) Verify the session -----------------------------------------
  if (!sessionToken) {
    return json(res, 401, { error: "missing_session" });
  }

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

  // ---- 2) Server-side RBAC: the caller's own user_roles row -----------
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
    // Missing row, technician, or anything unexpected — fail closed.
    return json(res, 403, { error: "forbidden" });
  }

  // ---- 3) Forward to the backend with the admin key -------------------
  const payload = {
    mcc_panel_id: mccPanelId,
    cabinet_number: cabinetNumber,
    line_zone_id: lineZoneId,
    nameplate_kw: nameplateKw,
    rated_rpm: ratedRpm,
    drive_type: driveType,
    asset_tag: optionalStr(body.assetTag),
    bearing_part_number: optionalStr(body.bearingPartNumber),
    spare_capacitor_spec: optionalStr(body.spareCapacitorSpec),
    downtime_cost_etb_per_hour: downtimeCostEtbPerHour,
  };

  try {
    const backendResponse = await fetch(
      `${apiBase}/api/v2/admin/motor-assets/${encodeURIComponent(motorId)}`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": adminKey,
          Authorization: `Bearer ${sessionToken}`,
        },
        body: JSON.stringify(payload),
      },
    );
    const backendBody = await backendResponse.json().catch(() => ({}));
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
