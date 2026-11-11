import { useQuery } from "@tanstack/react-query";
import type { Motor } from "@workspace/api-client-react";
import { fetchAlerts, fetchMotorsOverview } from "@/lib/sigmo-api";
import type { SigmoLivePayload } from "@/lib/sigmo-api";

/**
 * Live motor overview mapping (GET /api/v2/motors).
 *
 * The Sigmo V2 backend returns one entry per motor with telemetry.
 * These helpers turn that payload into the shapes the existing UI
 * components already understand (badge statuses, alert records, the
 * legacy Motor object of DecisionEngineStatus) — no component had to
 * change its visual contract.
 */

export interface V2MotorEntry {
  motor_id: string;
  status: string; // HEALTHY | ANOMALY | INRUSH_SUPPRESSED
  predicted_class: string | null;
  model_confidence: number | null;
  health_percent: number | null;
  stage: number;
  stage_label: string;
  is_fault: boolean;
  thd_percent_max: number | null;
  unbalance_percent: number | null;
  fundamental_hz: number | null;
  recorded_at: string;
  source: string; // live_runtime | supabase
}

export interface V2MotorsOverview {
  generated_at: string;
  model_version: string;
  database_connected: boolean;
  motors: V2MotorEntry[];
}

/**
 * Legacy Motor shape extended with the V2 decision fields the
 * DecisionEngineStatus card renders. The V2 backend has exactly one
 * classifier (XGBoost) plus a deterministic stage engine — the legacy
 * RF / model-agreement / original-ML fields have no V2 counterpart.
 */
export interface DecisionMotor extends Motor {
  /** Section 14.5 health index, 0-100 (z-score anchored). */
  decisionHealthPercent?: number;
  /** Stage 1-4 from the deterministic stage engine. */
  decisionStage?: number;
  /** Human-readable stage policy label (e.g. "Stage 2 — Moderate Risk"). */
  decisionStageLabel?: string;
  /** Gating status of the newest window: HEALTHY | ANOMALY | INRUSH_SUPPRESSED. */
  decisionGateStatus?: string;
  /** Where the verdict came from: live_runtime | supabase. */
  decisionSource?: string;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function normalizeEntry(raw: unknown): V2MotorEntry | null {
  const record = asRecord(raw);
  if (!record || typeof record["motor_id"] !== "string") return null;
  const num = (key: string): number | null =>
    typeof record[key] === "number" && Number.isFinite(record[key] as number)
      ? (record[key] as number)
      : null;
  return {
    motor_id: record["motor_id"] as string,
    status: typeof record["status"] === "string" ? record["status"] : "—",
    predicted_class:
      typeof record["predicted_class"] === "string"
        ? record["predicted_class"]
        : null,
    model_confidence: num("model_confidence"),
    health_percent: num("health_percent"),
    stage: num("stage") ?? 1,
    stage_label:
      typeof record["stage_label"] === "string"
        ? record["stage_label"]
        : "Stage 1",
    is_fault: record["is_fault"] === true,
    thd_percent_max: num("thd_percent_max"),
    unbalance_percent: num("unbalance_percent"),
    fundamental_hz: num("fundamental_hz"),
    recorded_at:
      typeof record["recorded_at"] === "string"
        ? record["recorded_at"]
        : new Date().toISOString(),
    source:
      typeof record["source"] === "string" ? record["source"] : "supabase",
  };
}

export function parseMotorsOverview(
  payload: SigmoLivePayload,
): V2MotorsOverview | null {
  const record = asRecord(payload);
  if (!record || !Array.isArray(record["motors"])) return null;
  return {
    generated_at:
      typeof record["generated_at"] === "string"
        ? record["generated_at"]
        : new Date().toISOString(),
    model_version:
      typeof record["model_version"] === "string"
        ? record["model_version"]
        : "",
    database_connected: record["database_connected"] === true,
    motors: record["motors"]
      .map(normalizeEntry)
      .filter((entry): entry is V2MotorEntry => entry !== null),
  };
}

/** Shared live query — one poll drives the grid, alerts and badge. */
export function useMotorsOverview() {
  return useQuery<V2MotorsOverview | null, Error>({
    queryKey: ["sigmo-v2", "motors-overview"],
    queryFn: async ({ signal }) =>
      parseMotorsOverview(await fetchMotorsOverview(signal)),
    refetchInterval: 30000,
  });
}

/** Map the V2 gating status onto the existing badge contract. */
export function toBadgeStatus(
  entry: V2MotorEntry,
): "running" | "warning" | "stopped" {
  if (entry.stage >= 3 || entry.status === "ANOMALY") {
    if (entry.stage >= 3) return "stopped";
    return "warning";
  }
  return "running";
}

/**
 * Dismissal-aware live alerts (GET /api/v2/alerts).
 *
 * The backend is the single source of truth for the operator's alert
 * inbox: it derives alerts from live motor state and subtracts stored
 * dismissals. Every alerts indicator in the UI (top-bar badge,
 * dashboard feed, Alerts page) reads from here so a dismissed alert
 * never keeps signaling. The key shares the ["sigmo-v2", "alerts"]
 * prefix with the Alerts page, so a dismiss/restore there refreshes
 * every consumer in the same cache invalidation.
 */
export const ACTIVE_ALERTS_QUERY_KEY = ["sigmo-v2", "alerts", "active"] as const;

export function useActiveAlerts() {
  return useQuery({
    queryKey: ACTIVE_ALERTS_QUERY_KEY,
    queryFn: ({ signal }) => fetchAlerts(false, signal),
    refetchInterval: 30_000,
  });
}

/**
 * Adapt a V2 entry to the legacy Motor shape so the existing
 * DecisionEngineStatus card renders live data unchanged. V2 decision
 * fields (stage engine, gating status, health index, verdict source)
 * ride along as DecisionMotor extras.
 */
export function toLegacyMotor(entry: V2MotorEntry): DecisionMotor {
  return {
    id: 0,
    name: entry.motor_id,
    location: entry.source === "live_runtime" ? "live" : "history",
    status: toBadgeStatus(entry),
    healthScore: entry.health_percent ?? 0,
    decisionFaultLabel: entry.predicted_class ?? undefined,
    decisionFaultConfidence: entry.model_confidence ?? undefined,
    decisionMlActive: entry.predicted_class !== null,
    decisionUpdatedAt: entry.recorded_at,
    decisionHealthPercent: entry.health_percent ?? undefined,
    decisionStage: entry.stage,
    decisionStageLabel: entry.stage_label,
    decisionGateStatus: entry.status,
    decisionSource: entry.source,
  } as DecisionMotor;
}
