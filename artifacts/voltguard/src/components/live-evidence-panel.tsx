import type { UseQueryResult } from "@tanstack/react-query";
import { Activity, Waves } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StageBadge } from "@/components/ui/badges";
import { useI18n } from "@/i18n";
import type { SigmoLivePayload } from "@/lib/sigmo-api";

/**
 * Live Spectral Evidence — the polished rendering of the Section 6.b
 * technician payload for one motor: per-phase envelope peaks, rotor
 * sidebands, electrical quality metrics, the taxonomy code, urgency
 * stage and RUL status. Every value comes straight from the backend.
 */

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function numberList(value: unknown, expected: number): number[] | null {
  if (!Array.isArray(value) || value.length !== expected) return null;
  const parsed = value.map(num);
  return parsed.every((item) => item !== null) ? (parsed as number[]) : null;
}

function MetricTile({
  label,
  value,
  unit,
  tone,
}: {
  label: string;
  value: number | null;
  unit?: string;
  tone?: "ok" | "warn" | "bad";
}) {
  const toneClass =
    tone === "bad"
      ? "text-destructive"
      : tone === "warn"
        ? "text-amber-400"
        : "text-foreground";
  return (
    <div className="rounded-lg border border-border/60 bg-black/20 p-4">
      <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </p>
      <p className={`mt-1 text-xl font-bold tracking-tight ${toneClass}`}>
        {value !== null ? value.toFixed(2) : "—"}
        {unit && value !== null ? (
          <span className="ml-1 text-xs font-medium text-muted-foreground">
            {unit}
          </span>
        ) : null}
      </p>
    </div>
  );
}

function PhaseBars({
  title,
  unit,
  values,
  phases,
}: {
  title: string;
  unit: string;
  values: number[] | null;
  phases: string[];
}) {
  const max = values ? Math.max(...values.map(Math.abs), 1e-9) : 1;
  return (
    <div className="rounded-lg border border-border/60 bg-black/20 p-4">
      <p className="mb-3 text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
        {title}
      </p>
      <div className="space-y-2.5">
        {(values ?? [null, null, null]).map((value, index) => (
          <div key={phases[index]} className="flex items-center gap-3">
            <span className="w-14 shrink-0 text-xs text-muted-foreground">
              {phases[index]}
            </span>
            <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-black/30">
              <div
                className="h-full rounded-full bg-primary/80 transition-all duration-500"
                style={{
                  width:
                    value === null
                      ? "0%"
                      : `${Math.max((Math.abs(value) / max) * 100, 4)}%`,
                }}
              />
            </div>
            <span className="w-24 shrink-0 text-right font-mono text-xs text-foreground/90">
              {value === null ? "—" : value.toFixed(2)}
              <span className="ml-1 text-muted-foreground">{unit}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function LiveEvidencePanel({
  query,
  motorId,
}: {
  query: UseQueryResult<SigmoLivePayload, Error>;
  motorId: string;
}) {
  const { t, fault } = useI18n();
  const payload = asRecord(query.data);

  if (query.isLoading) {
    return (
      <Card className="border-border bg-card">
        <CardHeader className="border-b border-border/50 pb-4">
          <Skeleton className="h-5 w-64" />
          <Skeleton className="mt-2 h-3 w-96" />
        </CardHeader>
        <CardContent className="grid gap-4 p-4 md:grid-cols-2">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-24 w-full md:col-span-2" />
        </CardContent>
      </Card>
    );
  }

  if (query.isError) {
    return (
      <Card className="border-border bg-card">
        <CardContent className="flex flex-col items-center justify-center gap-3 p-10 text-center">
          <div className="rounded-full border border-amber-500/20 bg-amber-500/5 p-3">
            <Waves className="h-6 w-6 text-amber-400 opacity-80" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">
              {motorId} — {t("v2.evidenceTitle")}
            </p>
            <p className="mt-1 max-w-md text-xs text-muted-foreground">
              {query.error?.message ?? t("v2.emptyBody")}
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!payload) return null;

  const evidence = asRecord(payload["spectral_evidence_data"]);
  const stage = asRecord(payload["fault_urgency_stage"]);
  const rul = asRecord(payload["rul"]);
  const dominant = str(payload["dominant_fault"]);
  const confidence = num(payload["confidence"]);
  const taxonomy = str(payload["exact_fault_taxonomy_code"]);
  const stageNo = num(stage?.["stage"]);
  const rulStatus = str(rul?.["rul_status"]);
  const rulEstimate = str(rul?.["rul_days_estimate"]);

  const fft = numberList(evidence?.["fft_peak_hz"], 3);
  const sideband = numberList(evidence?.["sideband_50hz_db"], 3);
  const thd = num(evidence?.["thd_percent_max"]);
  const unbalance = num(evidence?.["unbalance_percent"]);
  const crest = num(evidence?.["crest_factor_max"]);
  const zscore = num(evidence?.["zscore_baseline_deviation"]);
  const fundamental = num(evidence?.["fundamental_hz"]);

  const phases = [t("v2.phaseA"), t("v2.phaseB"), t("v2.phaseC")];

  return (
    <Card className="border-border bg-card">
      <CardHeader className="border-b border-border/50 pb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="h-4 w-4 text-primary" />
              {t("v2.evidenceTitle")}
              <span className="font-mono text-sm text-muted-foreground">
                {motorId}
              </span>
            </CardTitle>
            <CardDescription>{t("v2.evidenceSubtitle")}</CardDescription>
          </div>
          <div className="flex flex-col items-end gap-1">
            <Badge
              variant="outline"
              className="border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
            >
              LIVE
            </Badge>
            {stageNo !== null ? <StageBadge stage={stageNo} /> : null}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 p-4">
        {/* Verdict row */}
        <div className="grid gap-4">
          <div className="rounded-lg border border-border/60 bg-black/20 p-4">
            <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
              {t("v2.verdict")}
            </p>
            <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span
                className={`text-xl font-bold tracking-tight ${dominant && dominant !== "HEALTHY" ? "text-destructive" : "text-emerald-300"}`}
              >
                {dominant ? (fault(dominant) ?? dominant) : "—"}
              </span>
              {confidence !== null ? (
                <span className="text-xs text-muted-foreground">
                  {t("v2.confidence")} {(confidence * 100).toFixed(1)}%
                </span>
              ) : null}
              {taxonomy ? (
                <span className="font-mono text-[11px] text-muted-foreground">
                  {taxonomy}
                </span>
              ) : null}
            </div>
          </div>
        </div>

        {/* Per-phase spectral evidence */}
        <div className="grid gap-4 md:grid-cols-2">
          <PhaseBars
            title={t("v2.fftPeaks")}
            unit="Hz"
            values={fft}
            phases={phases}
          />
          <PhaseBars
            title={t("v2.sidebands")}
            unit="dB"
            values={sideband}
            phases={phases}
          />
        </div>

        {/* Electrical quality */}
        <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
          <MetricTile
            label={t("v2.thdMax")}
            value={thd}
            unit="%"
            tone={thd !== null && thd > 8 ? "bad" : thd !== null && thd > 5 ? "warn" : "ok"}
          />
          <MetricTile
            label={t("v2.unbalance")}
            value={unbalance}
            unit="%"
            tone={unbalance !== null && unbalance > 5 ? "bad" : unbalance !== null && unbalance > 2 ? "warn" : "ok"}
          />
          <MetricTile label={t("v2.crest")} value={crest} />
          <MetricTile label={t("v2.fundamental")} value={fundamental} unit="Hz" />
          <MetricTile label={t("v2.zscore")} value={zscore} tone={zscore !== null && zscore >= 3 ? "bad" : "ok"} />
          <div className="rounded-lg border border-border/60 bg-black/20 p-4">
            <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
              {t("v2.rulStatus")}
            </p>
            <p className="mt-1 truncate text-sm font-semibold text-foreground" title={rulEstimate ?? undefined}>
              {rulEstimate ?? rulStatus ?? "—"}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
