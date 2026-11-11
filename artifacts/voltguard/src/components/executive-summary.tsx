import type { UseQueryResult } from "@tanstack/react-query";
import {
  Activity,
  BrainCircuit,
  CalendarClock,
  Cpu,
  Gauge,
  ShieldAlert,
  TrendingDown,
} from "lucide-react";
import { ApiErrorState } from "@/components/api-error-state";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useI18n } from "@/i18n";
import type { SigmoLivePayload } from "@/lib/sigmo-api";
import { cn } from "@/lib/utils";

/**
 * Executive Command Summary — the polished rendering of the live
 * Section 6.a payload from the Sigmo V2 backend.
 *
 * Every value comes straight from /api/v2/views/executive; honest
 * statuses are surfaced as badges (rate_not_configured is NEVER shown
 * as a number — zero-fake directive).
 */

interface ExecutiveSummaryProps {
  query: UseQueryResult<SigmoLivePayload, Error>;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readNumber(...path: unknown[]): number | null {
  let current: unknown = path[0];
  for (let i = 1; i < path.length; i += 1) {
    const record = asRecord(current);
    if (!record) return null;
    current = record[String(path[i])];
  }
  return typeof current === "number" && Number.isFinite(current)
    ? current
    : null;
}

function readString(...path: unknown[]): string | null {
  let current: unknown = path[0];
  for (let i = 1; i < path.length; i += 1) {
    const record = asRecord(current);
    if (!record) return null;
    current = record[String(path[i])];
  }
  return typeof current === "string" && current.trim() !== ""
    ? current
    : null;
}

const etbFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
});

function formatEtb(value: number): string {
  return `${etbFormatter.format(Math.round(value))} ETB`;
}

function FinancialStatusBadge({ status }: { status: string }) {
  const { t } = useI18n();
  const kind =
    status === "computed"
      ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
      : "border-amber-500/30 bg-amber-500/10 text-amber-400";
  const label =
    status === "computed"
      ? t("exec.statusComputed")
      : status === "partial_rates_configured"
        ? t("exec.statusPartial")
        : t("exec.statusUnconfigured");
  return (
    <Badge variant="outline" className={cn("text-[10px]", kind)}>
      {label}
    </Badge>
  );
}

function StatTile({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-black/20 p-4">
      <div className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="text-2xl font-bold tracking-tight text-foreground">
        {value}
      </div>
      {hint ? (
        <div className="mt-1 text-[11px] text-muted-foreground">{hint}</div>
      ) : null}
    </div>
  );
}

export function ExecutiveSummary({ query }: ExecutiveSummaryProps) {
  const { t } = useI18n();

  if (query.isLoading) {
    return (
      <Card className="border-border bg-card">
        <CardHeader className="border-b border-border/50 pb-4">
          <Skeleton className="h-5 w-64" />
          <Skeleton className="mt-2 h-3 w-96" />
        </CardHeader>
        <CardContent className="grid gap-4 p-4 md:grid-cols-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-20 w-full md:col-span-3" />
        </CardContent>
      </Card>
    );
  }

  if (query.isError) {
    return (
      <Card className="border-border bg-card">
        <CardHeader className="border-b border-border/50 pb-4">
          <CardTitle className="flex items-center gap-2 text-base">
            <Activity className="h-4 w-4 text-primary" />
            {t("exec.commandTitle")}
          </CardTitle>
          <CardDescription>{t("exec.commandSubtitle")}</CardDescription>
        </CardHeader>
        <CardContent className="p-4">
          <ApiErrorState
            message={
              query.error?.message || "Unable to load the executive view."
            }
          />
        </CardContent>
      </Card>
    );
  }

  const payload = asRecord(query.data);
  if (!payload) {
    return (
      <Card className="border-border bg-card">
        <CardContent className="p-6 text-sm text-muted-foreground">
          {t("exec.noData")}
        </CardContent>
      </Card>
    );
  }

  const plantHealth = readNumber(payload, "plant_health_index");
  const healthNote = readString(payload, "plant_health_index_note");
  const motorsMonitored = readNumber(payload, "motors_monitored");
  const modelVersion = readString(payload, "model_version");
  const generatedAt = readString(payload, "generated_at");
  const directive = readString(payload, "executive_decision_directive");

  const riskValue = readNumber(
    payload,
    "financial_risk_exposure_etb",
    "value_etb",
  );
  const riskStatus =
    readString(payload, "financial_risk_exposure_etb", "status") ??
    "rate_not_configured";
  const energyValue = readNumber(
    payload,
    "energy_efficiency_loss_penalty_etb",
    "value_etb",
  );
  const energyStatus =
    readString(payload, "energy_efficiency_loss_penalty_etb", "status") ??
    "rate_not_configured";

  const rulEstimate = readString(payload, "rul_days_estimate", "estimate");
  const rulLower = readNumber(payload, "rul_days_estimate", "lower");
  const rulUpper = readNumber(payload, "rul_days_estimate", "upper");
  const rulBinding = readString(payload, "rul_days_estimate", "binding_motor_id");

  const healthy = readNumber(payload, "critical_asset_risk_summary", "healthy") ?? 0;
  const stage2 =
    readNumber(payload, "critical_asset_risk_summary", "stage_2_moderate_risk") ?? 0;
  const stage34 =
    readNumber(
      payload,
      "critical_asset_risk_summary",
      "stage_3_4_critical_failure_risk",
    ) ?? 0;
  const totalMonitored =
    readNumber(payload, "critical_asset_risk_summary", "total_monitored") ??
    motorsMonitored ??
    0;

  const rulWindowLabel =
    rulLower !== null && rulUpper !== null
      ? `${rulEstimate} (${rulLower}-${rulUpper})`
      : (rulEstimate ?? "—");

  const segmentTotal = Math.max(healthy + stage2 + stage34, 1);

  return (
    <Card className="border-border bg-card">
      <CardHeader className="border-b border-border/50 pb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="h-4 w-4 text-primary" />
              {t("exec.commandTitle")}
            </CardTitle>
            <CardDescription>{t("exec.commandSubtitle")}</CardDescription>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <Badge
              variant="outline"
              className="border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
            >
              LIVE
            </Badge>
            <span className="font-mono text-[10px] text-muted-foreground">
              {modelVersion ? `${t("exec.modelVersion")}: ${modelVersion}` : ""}
            </span>
            {generatedAt ? (
              <span className="text-[10px] text-muted-foreground">
                {t("exec.generatedAt")}:{" "}
                {new Date(generatedAt).toLocaleString()}
              </span>
            ) : null}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 p-4">
        {/* Top metrics row */}
        <div className="grid gap-4 md:grid-cols-3">
          <StatTile
            icon={<Gauge className="h-3.5 w-3.5" />}
            label={t("exec.plantHealth")}
            value={
              plantHealth !== null ? `${plantHealth.toFixed(1)}%` : "—"
            }
            hint={healthNote ?? t("exec.healthNote")}
          />
          <StatTile
            icon={<Cpu className="h-3.5 w-3.5" />}
            label={t("exec.monitored")}
            value={motorsMonitored ?? "—"}
            hint={`${totalMonitored} ${t("exec.stageHealthy")} / ${stage2} ${t("exec.stage2")} / ${stage34} ${t("exec.stage34")}`}
          />
          <StatTile
            icon={<CalendarClock className="h-3.5 w-3.5" />}
            label={t("exec.rulWindow")}
            value={rulWindowLabel}
            hint={rulBinding ? `${t("exec.rulWindow")}: ${rulBinding}` : undefined}
          />
        </div>

        {/* Financial figures */}
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-lg border border-border/60 bg-black/20 p-4">
            <div className="mb-1 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <ShieldAlert className="h-3.5 w-3.5" />
                {t("exec.riskExposure")}
              </div>
              <FinancialStatusBadge status={riskStatus} />
            </div>
            <div className="text-2xl font-bold tracking-tight text-foreground">
              {riskValue !== null ? formatEtb(riskValue) : "—"}
            </div>
          </div>
          <div className="rounded-lg border border-border/60 bg-black/20 p-4">
            <div className="mb-1 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <TrendingDown className="h-3.5 w-3.5" />
                {t("exec.energyPenalty")}
              </div>
              <FinancialStatusBadge status={energyStatus} />
            </div>
            <div className="text-2xl font-bold tracking-tight text-foreground">
              {energyValue !== null ? (
                <>
                  {formatEtb(energyValue)}{" "}
                  <span className="text-xs font-medium text-muted-foreground">
                    {t("exec.perMonth")}
                  </span>
                </>
              ) : (
                "—"
              )}
            </div>
          </div>
        </div>

        {/* Stage distribution */}
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <BrainCircuit className="h-3.5 w-3.5" />
            {t("exec.stagesTitle")}
          </div>
          <div
            className="flex h-3 w-full overflow-hidden rounded-full border border-border/60 bg-black/30"
            role="img"
            aria-label={`${healthy} ${t("exec.stageHealthy")}, ${stage2} ${t("exec.stage2")}, ${stage34} ${t("exec.stage34")}`}
          >
            <div
              className="bg-primary transition-all duration-500"
              style={{ width: `${(healthy / segmentTotal) * 100}%` }}
            />
            <div
              className="bg-amber-500 transition-all duration-500"
              style={{ width: `${(stage2 / segmentTotal) * 100}%` }}
            />
            <div
              className="bg-destructive transition-all duration-500"
              style={{ width: `${(stage34 / segmentTotal) * 100}%` }}
            />
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-primary" />
              {t("exec.stageHealthy")}: {healthy}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-amber-500" />
              {t("exec.stage2")}: {stage2}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-destructive" />
              {t("exec.stage34")}: {stage34}
            </span>
          </div>
        </div>

        {/* Deterministic directive */}
        {directive ? (
          <div className="rounded-lg border-l-4 border-primary bg-primary/5 p-4">
            <div className="mb-1 flex items-center gap-2 text-xs font-semibold text-emerald-300">
              <BrainCircuit className="h-3.5 w-3.5" />
              {t("exec.directive")}
            </div>
            <p className="text-sm leading-relaxed text-foreground/90">
              {directive}
            </p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
