import { apiFetch } from "@/lib/api-url";

/**
 * Sigmo V2 live backend (Render) — Section 6 dual-view endpoints.
 *
 * Paths are RELATIVE on purpose: api-url.ts prefixes VITE_API_BASE_URL
 * (the Render origin), and the Vercel rewrite proxies relative /api
 * calls to the same backend when no env var is set. Both layers attach
 * the X-API-Key header.
 */
export const SIGMO_V2_ENDPOINTS = {
  executive: "/api/v2/views/executive",
  technician: "/api/v2/views/technician", // per-motor: + /{motor_id}
  motors: "/api/v2/motors",
  health: "/api/v2/health",
  activeModels: "/api/v2/models/active",
} as const;

/** Full technician path for one motor (Section 6.b requires the id). */
export function technicianEndpoint(motorId: string): string {
  return `${SIGMO_V2_ENDPOINTS.technician}/${encodeURIComponent(motorId)}`;
}

export type SigmoLivePayload = unknown;

const SIGMO_REQUEST_TIMEOUT_MS = 30_000;

function describeErrorBody(body: unknown): string {
  if (typeof body === "string") {
    return body.trim().slice(0, 240);
  }

  if (body && typeof body === "object") {
    const record = body as Record<string, unknown>;
    for (const key of ["message", "detail", "error", "title"]) {
      const value = record[key];
      if (typeof value === "string" && value.trim() !== "") {
        return value.trim().slice(0, 240);
      }
    }
  }

  return "";
}

async function fetchSigmoPayload(
  path: string,
  signal: AbortSignal | undefined,
): Promise<SigmoLivePayload> {
  const requestController = new AbortController();
  let didTimeout = false;
  const timeoutId = window.setTimeout(() => {
    didTimeout = true;
    requestController.abort();
  }, SIGMO_REQUEST_TIMEOUT_MS);
  const abortRequest = () => requestController.abort();

  signal?.addEventListener("abort", abortRequest, { once: true });

  try {
    const response = await apiFetch(path, {
      signal: requestController.signal,
      headers: { Accept: "application/json" },
    });

    const responseText = await response.text();
    let body: unknown = null;

    if (responseText.trim() !== "") {
      try {
        body = JSON.parse(responseText) as unknown;
      } catch {
        body = responseText;
      }
    }

    if (!response.ok) {
      const detail = describeErrorBody(body);
      throw new Error(
        `${path} returned HTTP ${response.status}${detail ? `: ${detail}` : ""}`,
      );
    }

    return body;
  } catch (error) {
    if (didTimeout) {
      throw new Error(
        `${path} timed out after ${SIGMO_REQUEST_TIMEOUT_MS / 1000} seconds while waiting for the Render backend.`,
      );
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
    signal?.removeEventListener("abort", abortRequest);
  }
}

export function fetchExecutiveView(signal?: AbortSignal) {
  return fetchSigmoPayload(SIGMO_V2_ENDPOINTS.executive, signal);
}

/**
 * Section 6.b technician payload for ONE motor (the backend contract is
 * per-motor: /api/v2/views/technician/{motor_id}). Pass the commissioned
 * asset id, e.g. "MTR-PILOT-01".
 */
export function fetchTechnicianView(motorId: string, signal?: AbortSignal) {
  return fetchSigmoPayload(technicianEndpoint(motorId), signal);
}

export function fetchActiveModels(signal?: AbortSignal) {
  return fetchSigmoPayload(SIGMO_V2_ENDPOINTS.activeModels, signal);
}

/**
 * GET /api/v2/motors/{motor_id}/history — the Analytics trends source.
 * Steady-state window series: Section 14.5 health index, worst-phase
 * power-quality features and the persisted v6c verdict per window,
 * oldest-first. INRUSH windows are excluded server-side; an empty
 * points list is honest absence (telemetry exists, just outside the
 * requested window), never a fabricated series.
 */
export function motorHistoryEndpoint(
  motorId: string,
  hours: number,
  limit: number,
): string {
  const params = new URLSearchParams({
    hours: String(hours),
    limit: String(limit),
  });
  return `${SIGMO_V2_ENDPOINTS.motors}/${encodeURIComponent(
    motorId,
  )}/history?${params.toString()}`;
}

export interface V2TrendPoint {
  recordedAt: string;
  status: string; // HEALTHY | ANOMALY
  healthPercent: number;
  zscoreMax: number;
  thdPercentMax: number;
  unbalancePercent: number;
  crestFactorMax: number;
  rotorSidebandDbMax: number;
  fundamentalHz: number;
  rmsA: number;
  rmsB: number;
  rmsC: number;
  predictedClass: string | null;
  modelConfidence: number | null;
}

export interface V2TrendsPayload {
  motorId: string;
  modelVersion: string;
  databaseConnected: boolean;
  hours: number;
  limit: number;
  returned: number;
  points: V2TrendPoint[];
}

function normalizeTrendPoint(raw: unknown): V2TrendPoint | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const num = (key: string): number | null =>
    typeof r[key] === "number" && Number.isFinite(r[key] as number)
      ? (r[key] as number)
      : null;
  if (typeof r["recorded_at"] !== "string") return null;
  const required = [
    "health_percent",
    "thd_percent_max",
    "unbalance_percent",
    "crest_factor_max",
    "rotor_sideband_db_max",
  ];
  if (required.some((key) => num(key) === null)) return null;
  const optionalNum = (key: string): number | null => num(key);
  return {
    recordedAt: r["recorded_at"] as string,
    status: typeof r["status"] === "string" ? (r["status"] as string) : "—",
    healthPercent: num("health_percent") as number,
    zscoreMax: optionalNum("zscore_max") ?? 0,
    thdPercentMax: num("thd_percent_max") as number,
    unbalancePercent: num("unbalance_percent") as number,
    crestFactorMax: num("crest_factor_max") as number,
    rotorSidebandDbMax: num("rotor_sideband_db_max") as number,
    fundamentalHz: optionalNum("fundamental_hz") ?? 0,
    rmsA: optionalNum("rms_a") ?? 0,
    rmsB: optionalNum("rms_b") ?? 0,
    rmsC: optionalNum("rms_c") ?? 0,
    predictedClass:
      typeof r["predicted_class"] === "string"
        ? (r["predicted_class"] as string)
        : null,
    modelConfidence: optionalNum("model_confidence"),
  };
}

export async function fetchMotorHistory(
  motorId: string,
  hours: number,
  limit: number,
  signal?: AbortSignal,
): Promise<V2TrendsPayload> {
  const payload = await fetchSigmoPayload(
    motorHistoryEndpoint(motorId, hours, limit),
    signal,
  );
  const record =
    payload && typeof payload === "object"
      ? (payload as Record<string, unknown>)
      : {};
  const window =
    record["window"] && typeof record["window"] === "object"
      ? (record["window"] as Record<string, unknown>)
      : {};
  const points = Array.isArray(record["points"])
    ? record["points"]
        .map(normalizeTrendPoint)
        .filter((p): p is V2TrendPoint => p !== null)
    : [];
  return {
    motorId:
      typeof record["motor_id"] === "string"
        ? (record["motor_id"] as string)
        : motorId,
    modelVersion:
      typeof record["model_version"] === "string"
        ? (record["model_version"] as string)
        : "—",
    databaseConnected: record["database_connected"] === true,
    hours: typeof window["hours"] === "number" ? window["hours"] : hours,
    limit: typeof window["limit"] === "number" ? window["limit"] : limit,
    returned:
      typeof window["returned"] === "number"
        ? window["returned"]
        : points.length,
    points,
  };
}

/**
 * GET /api/v2/motors — live per-motor overview (status, health index,
 * Stage 1-4, verdict) for the dashboard status grid. One entry per
 * motor with telemetry; freshest state wins (live runtime vs the
 * persisted Supabase row).
 */
export function fetchMotorsOverview(signal?: AbortSignal) {
  return fetchSigmoPayload(SIGMO_V2_ENDPOINTS.motors, signal);
}

export interface V2HealthPayload {
  service?: string;
  database_connected?: boolean;
  offline_buffer_depth?: number;
  motors_streaming?: number;
}

/** GET /api/v2/health — open endpoint, the real liveness probe. */
export async function fetchV2Health(
  signal?: AbortSignal,
): Promise<V2HealthPayload | null> {
  try {
    const payload = await fetchSigmoPayload(
      SIGMO_V2_ENDPOINTS.health,
      signal,
    );
    return payload && typeof payload === "object"
      ? (payload as V2HealthPayload)
      : null;
  } catch {
    return null;
  }
}

/**
 * Defensive readers for the live payloads (they arrive as `unknown`).
 * Every reader returns undefined for anything unexpected — the UI shows
 * honest placeholders instead of throwing.
 */
function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

// ---------------------------------------------------------------------------
// Fault episode history (GET /api/v2/faults — Section 10 audit trail)
// ---------------------------------------------------------------------------

export interface V2FaultLog {
  id: number;
  motorId: string;
  detectedAt: string;
  taxonomyCode: string;
  urgencyStage: number; // 1-4
  modelConfidence: number; // 0-1
  populationSigma: number;
  absoluteThresholdBreached: boolean;
  trendConfirmed: boolean;
  fourSignalConfirmed: boolean;
  physicallyVerified: boolean;
  verifiedBy: string | null;
  spectralEvidence: Record<string, unknown>;
  resolvedAt: string | null;
}

export interface V2FaultLogsPayload {
  motorId: string | null;
  returned: number;
  faults: V2FaultLog[];
}

function normalizeFaultLog(raw: unknown): V2FaultLog | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r["id"] !== "number" || typeof r["motor_id"] !== "string") {
    return null;
  }
  const num = (key: string): number => {
    const v = r[key];
    return typeof v === "number" && Number.isFinite(v) ? v : 0;
  };
  const bool = (key: string): boolean => r[key] === true;
  const iso = (key: string): string | null =>
    typeof r[key] === "string" ? (r[key] as string) : null;
  return {
    id: r["id"] as number,
    motorId: r["motor_id"] as string,
    detectedAt: iso("detected_at") ?? "",
    taxonomyCode: typeof r["taxonomy_code"] === "string" ? r["taxonomy_code"] as string : "—",
    urgencyStage: num("urgency_stage"),
    modelConfidence: num("model_confidence"),
    populationSigma: num("population_sigma"),
    absoluteThresholdBreached: bool("absolute_threshold_breached"),
    trendConfirmed: bool("trend_confirmed"),
    fourSignalConfirmed: bool("four_signal_confirmed"),
    physicallyVerified: bool("physically_verified"),
    verifiedBy: typeof r["verified_by"] === "string" ? r["verified_by"] as string : null,
    spectralEvidence:
      r["spectral_evidence"] && typeof r["spectral_evidence"] === "object"
        && !Array.isArray(r["spectral_evidence"])
        ? (r["spectral_evidence"] as Record<string, unknown>)
        : {},
    resolvedAt: iso("resolved_at"),
  };
}

export async function fetchFaultLogs(
  motorId: string | null,
  limit: number,
  signal?: AbortSignal,
): Promise<V2FaultLogsPayload> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (motorId) params.set("motor_id", motorId);
  const payload = await fetchSigmoPayload(`/api/v2/faults?${params.toString()}`, signal);
  const record =
    payload && typeof payload === "object"
      ? (payload as Record<string, unknown>)
      : {};
  const faults = Array.isArray(record["faults"])
    ? record["faults"]
        .map(normalizeFaultLog)
        .filter((f): f is V2FaultLog => f !== null)
    : [];
  return {
    motorId:
      typeof record["motor_id"] === "string"
        ? (record["motor_id"] as string)
        : null,
    returned:
      typeof record["returned"] === "number"
        ? record["returned"]
        : faults.length,
    faults,
  };
}

// ---------------------------------------------------------------------------
// Per-motor assessment (GET /api/v2/motors/{motor_id}/assessment)
// ---------------------------------------------------------------------------

export interface V2Assessment {
  motorId: string;
  modelVersion: string;
  generatedAt: string | null;
  snapshot: {
    recordedAt: string | null;
    status: string;
    fundamentalHz: number | null;
    rmsA: number | null;
    rmsB: number | null;
    rmsC: number | null;
    thdPercentMax: number | null;
    unbalancePercent: number | null;
    crestFactorMax: number | null;
    sidebandDbMax: number | null;
    zscoreMax: number | null;
  } | null;
  snapshotSource: string | null;
  fault: {
    dominantFault: string;
    confidence: number;
    isFault: boolean;
    probabilities: Array<[string, number]>;
    temporal: {
      aggregatedClass: string | null;
      windowsBuffered: number;
      voteShare: number | null;
      stable: boolean;
    } | null;
    classifiedAt: string | null;
    source: string | null;
  } | null;
  rul: {
    estimate: string;
    status: string;
    slopeSigmaPerDay: number | null;
    trendWindowDays: number | null;
    trendPoints: number;
    lastWindowAt: string | null;
  } | null;
  rulUnavailableReason: string | null;
}

function numOrNull(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function strOrNull(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

export async function fetchMotorAssessment(
  motorId: string,
  signal?: AbortSignal,
): Promise<V2Assessment> {
  const payload = await fetchSigmoPayload(
    `${SIGMO_V2_ENDPOINTS.motors}/${encodeURIComponent(motorId)}/assessment`,
    signal,
  );
  const record =
    payload && typeof payload === "object"
      ? (payload as Record<string, unknown>)
      : {};
  const snap =
    record["snapshot"] && typeof record["snapshot"] === "object"
      ? (record["snapshot"] as Record<string, unknown>)
      : null;
  const fa =
    record["fault_assessment"] && typeof record["fault_assessment"] === "object"
      ? (record["fault_assessment"] as Record<string, unknown>)
      : null;
  const rul =
    record["rul"] && typeof record["rul"] === "object"
      ? (record["rul"] as Record<string, unknown>)
      : null;
  const temporal =
    fa && fa["temporal_aggregation"] && typeof fa["temporal_aggregation"] === "object"
      ? (fa["temporal_aggregation"] as Record<string, unknown>)
      : null;
  const probabilities: Array<[string, number]> =
    fa && fa["probabilities"] && typeof fa["probabilities"] === "object"
      ? Object.entries(fa["probabilities"] as Record<string, unknown>)
          .filter(([, v]) => typeof v === "number")
          .map(([k, v]) => [k, v as number] as [string, number])
          .sort((a, b) => b[1] - a[1])
      : [];
  return {
    motorId: strOrNull(record["motor_id"]) ?? motorId,
    modelVersion: strOrNull(record["model_version"]) ?? "—",
    generatedAt: strOrNull(record["generated_at"]),
    snapshot: snap
      ? {
          recordedAt: strOrNull(snap["recorded_at"]),
          status: strOrNull(snap["status"]) ?? "—",
          fundamentalHz: numOrNull(snap["fundamental_hz"]),
          rmsA: numOrNull(snap["rms_a"]),
          rmsB: numOrNull(snap["rms_b"]),
          rmsC: numOrNull(snap["rms_c"]),
          thdPercentMax: numOrNull(snap["thd_percent_max"]),
          unbalancePercent: numOrNull(snap["current_unbalance_percent"]),
          crestFactorMax: numOrNull(snap["crest_factor_max"]),
          sidebandDbMax: numOrNull(snap["rotor_sideband_db_max"]),
          zscoreMax: numOrNull(snap["zscore_max"]),
        }
      : null,
    snapshotSource: strOrNull(record["snapshot_source"]),
    fault: fa
      ? {
          dominantFault: strOrNull(fa["dominant_fault"]) ?? "—",
          confidence: numOrNull(fa["confidence"]) ?? 0,
          isFault: fa["is_fault"] === true,
          probabilities,
          temporal: temporal
            ? {
                aggregatedClass: strOrNull(temporal["aggregated_class"]),
                windowsBuffered: numOrNull(temporal["windows_buffered"]) ?? 0,
                voteShare: numOrNull(temporal["vote_share"]),
                stable: temporal["stable"] === true,
              }
            : null,
          classifiedAt: strOrNull(fa["classified_at"]),
          source: strOrNull(fa["source"]),
        }
      : null,
    rul: rul
      ? {
          estimate: String(rul["rul_days_estimate"] ?? "—"),
          status: strOrNull(rul["rul_status"]) ?? "—",
          slopeSigmaPerDay: numOrNull(rul["slope_sigma_per_day"]),
          trendWindowDays: numOrNull(rul["trend_window_days"]),
          trendPoints: numOrNull(rul["trend_points"]) ?? 0,
          lastWindowAt: strOrNull(rul["last_window_at"]),
        }
      : null,
    rulUnavailableReason: strOrNull(record["rul_unavailable_reason"]),
  };
}

// ---------------------------------------------------------------------------
// AI technician analysis (POST /api/v2/ai/explain — real LLM, Amharic+English)
// ---------------------------------------------------------------------------

export interface V2AiExplanation {
  motorId: string;
  provider: string; // openai | deepseek | gemini
  model: string;
  generatedAt: string | null;
  analysisAm: string;
  analysisEn: string;
  elapsedMs: number | null;
}

const AI_REQUEST_TIMEOUT_MS = 120_000;

/** Honest error from the backend, with its status code attached. */
export class AiExplanationApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function fetchAiExplanation(
  motorId: string,
  signal?: AbortSignal,
): Promise<V2AiExplanation> {
  const response = await apiFetch("/api/v2/ai/explain", {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ motor_id: motorId }),
  });
  const text = await response.text();
  let body: unknown = null;
  if (text.trim() !== "") {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  if (!response.ok) {
    const detail =
      body && typeof body === "object"
        ? String((body as Record<string, unknown>)["detail"] ?? "")
        : "";
    throw new AiExplanationApiError(
      detail || `AI explanation failed (HTTP ${response.status})`,
      response.status,
    );
  }
  const record =
    body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  return {
    motorId:
      typeof record["motor_id"] === "string" ? (record["motor_id"] as string) : motorId,
    provider: typeof record["provider"] === "string" ? record["provider"] as string : "—",
    model: typeof record["model"] === "string" ? record["model"] as string : "—",
    generatedAt:
      typeof record["generated_at"] === "string" ? record["generated_at"] as string : null,
    analysisAm:
      typeof record["analysis_am"] === "string" ? record["analysis_am"] as string : "",
    analysisEn:
      typeof record["analysis_en"] === "string" ? record["analysis_en"] as string : "",
    elapsedMs:
      typeof record["elapsed_ms"] === "number" ? record["elapsed_ms"] as number : null,
  };
}

// ---------------------------------------------------------------------------
// Live alerts — the operator inbox (GET /api/v2/alerts + dismiss/restore)
// ---------------------------------------------------------------------------

export interface V2Alert {
  alertId: string;
  motorId: string;
  alertKey: string;
  severity: "critical" | "high" | "medium";
  predictedClass: string | null;
  stage: number;
  stageLabel: string;
  isFault: boolean;
  status: string;
  modelConfidence: number | null;
  healthPercent: number | null;
  thdPercentMax: number | null;
  unbalancePercent: number | null;
  recordedAt: string | null;
  source: string;
  dismissed: boolean;
  dismissedAt: string | null;
}

export interface V2AlertsPayload {
  generatedAt: string | null;
  databaseConnected: boolean;
  totalActive: number;
  alerts: V2Alert[];
}

export interface V2AlertMutationResult {
  requested: number;
  affected: number;
  unknown: string[];
}

export class AlertsApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "AlertsApiError";
    this.status = status;
  }
}

function normalizeAlert(r: unknown): V2Alert | null {
  if (!r || typeof r !== "object") return null;
  const record = r as Record<string, unknown>;
  const severity =
    record["severity"] === "critical" ||
    record["severity"] === "high" ||
    record["severity"] === "medium"
      ? (record["severity"] as V2Alert["severity"])
      : "medium";
  const str = (v: unknown): string | null =>
    typeof v === "string" ? v : null;
  const num = (v: unknown): number | null =>
    typeof v === "number" && Number.isFinite(v) ? v : null;
  const alertId = str(record["alert_id"]);
  const motorId = str(record["motor_id"]);
  if (!alertId || !motorId) return null;
  return {
    alertId,
    motorId,
    alertKey: str(record["alert_key"]) ?? "",
    severity,
    predictedClass: str(record["predicted_class"]),
    stage: num(record["stage"]) ?? 1,
    stageLabel: str(record["stage_label"]) ?? "",
    isFault: record["is_fault"] === true,
    status: str(record["status"]) ?? "",
    modelConfidence: num(record["model_confidence"]),
    healthPercent: num(record["health_percent"]),
    thdPercentMax: num(record["thd_percent_max"]),
    unbalancePercent: num(record["unbalance_percent"]),
    recordedAt: str(record["recorded_at"]),
    source: str(record["source"]) ?? "",
    dismissed: record["dismissed"] === true,
    dismissedAt: str(record["dismissed_at"]),
  };
}

export async function fetchAlerts(
  includeDismissed: boolean,
  signal?: AbortSignal,
): Promise<V2AlertsPayload> {
  const suffix = includeDismissed ? "?include_dismissed=true" : "";
  const payload = await fetchSigmoPayload(`/api/v2/alerts${suffix}`, signal);
  const record =
    payload && typeof payload === "object"
      ? (payload as Record<string, unknown>)
      : {};
  const alerts = Array.isArray(record["alerts"])
    ? record["alerts"]
        .map(normalizeAlert)
        .filter((a): a is V2Alert => a !== null)
    : [];
  return {
    generatedAt:
      typeof record["generated_at"] === "string"
        ? (record["generated_at"] as string)
        : null,
    databaseConnected: record["database_connected"] === true,
    totalActive:
      typeof record["total_active"] === "number"
        ? (record["total_active"] as number)
        : alerts.filter((a) => !a.dismissed).length,
    alerts,
  };
}

async function mutateAlerts(
  path: string,
  alertIds: string[],
): Promise<V2AlertMutationResult> {
  const response = await apiFetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ alert_ids: alertIds }),
  });
  const text = await response.text();
  let body: unknown = null;
  if (text.trim() !== "") {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  if (!response.ok) {
    const detail =
      body && typeof body === "object"
        ? String((body as Record<string, unknown>)["detail"] ?? "")
        : "";
    throw new AlertsApiError(
      detail || `Alert management failed (HTTP ${response.status})`,
      response.status,
    );
  }
  const record =
    body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const unknown = Array.isArray(record["unknown"])
    ? record["unknown"].filter(
        (v): v is string => typeof v === "string",
      )
    : [];
  return {
    requested:
      typeof record["requested"] === "number"
        ? (record["requested"] as number)
        : alertIds.length,
    affected:
      typeof record["affected"] === "number"
        ? (record["affected"] as number)
        : 0,
    unknown,
  };
}

/** Dismiss live alerts (single id = array of one). They re-alert
 * automatically if the condition escalates or re-triggers. */
export function dismissAlerts(alertIds: string[]) {
  return mutateAlerts("/api/v2/alerts/dismiss", alertIds);
}

/** Restore previously dismissed alerts (idempotent). */
export function restoreAlerts(alertIds: string[]) {
  return mutateAlerts("/api/v2/alerts/restore", alertIds);
}

export function readExecutiveField(
  payload: SigmoLivePayload,
  key: string,
): unknown {
  return asRecord(payload)?.[key];
}

// ---------------------------------------------------------------------------
// Technician invitations (POST /api/v2/invitations — admin-gated)
// ---------------------------------------------------------------------------

/** Stable error codes from the backend invite endpoint (+ local ones). */
export type InviteErrorCode =
  | "invalid_email"
  | "missing_session"
  | "invalid_session"
  | "not_admin"
  | "already_registered"
  | "email_rate_limited"
  | "invite_not_configured"
  | "supabase_unreachable"
  | "invite_failed"
  | "network"
  | "unknown";

export class InviteError extends Error {
  readonly code: InviteErrorCode;

  constructor(code: InviteErrorCode, message?: string) {
    super(message ?? code);
    this.name = "InviteError";
    this.code = code;
  }
}

export interface InviteResult {
  status: "invited" | "resent";
  email: string;
  userId: string | null;
  role: string;
}

/**
 * Send a technician invitation. The caller passes the SIGNED-IN user's
 * Supabase access token; the backend verifies it server-side and
 * requires the admin DB role. Only the dashboard API key (attached by
 * apiFetch) and the user's own short-lived token reach the network —
 * the service-role key stays server-side forever.
 */
export async function inviteTechnician(
  email: string,
  accessToken: string,
): Promise<InviteResult> {
  let response: Response;
  try {
    response = await apiFetch("/api/v2/invitations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email }),
    });
  } catch {
    throw new InviteError("network");
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (response.ok) {
    const record = (payload ?? {}) as Record<string, unknown>;
    return {
      status: record.status === "resent" ? "resent" : "invited",
      email: typeof record.email === "string" ? record.email : email,
      userId: typeof record.user_id === "string" ? record.user_id : null,
      role: typeof record.role === "string" ? record.role : "technician",
    };
  }

  // Structured errors: { detail: { code, message } } (backend invitations.py)
  const detail =
    payload && typeof payload === "object"
      ? (payload as Record<string, unknown>).detail
      : null;
  const code =
    detail &&
    typeof detail === "object" &&
    typeof (detail as Record<string, unknown>).code === "string"
      ? ((detail as Record<string, unknown>).code as InviteErrorCode)
      : response.status === 503
        ? "invite_not_configured"
        : "unknown";
  throw new InviteError(code);
}
