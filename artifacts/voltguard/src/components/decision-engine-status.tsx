import { Fragment, type ReactNode } from "react";
import { formatDistanceToNow } from "date-fns";
import { Activity, BrainCircuit, Cpu, Database, Layers } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useI18n } from "@/i18n";
import type { DecisionMotor } from "@/lib/sigmo-motors";

/**
 * Fault-code renderer that breaks ONLY at underscore boundaries.
 *
 * `BEARING_OUTER_RACE` is a single unbreakable CSS token: with plain
 * wrapping it either truncates (overflow) or, with hyphens/break-words,
 * snaps mid-word ("...RA" / "CE..."). Zero-width break opportunities
 * after each underscore give clean lines: BEARING_ / OUTER_ / RACE.
 * Text without underscores renders untouched.
 */
function BreakableCode({ value }: { value: string }) {
  if (!value.includes("_")) return <>{value}</>;
  const segments = value.split(/(?=_)/);
  return (
    <>
      {segments.map((segment, i) => (
        <Fragment key={i}>
          {i > 0 ? <wbr /> : null}
          {segment}
        </Fragment>
      ))}
    </>
  );
}

interface DecisionEngineStatusProps {
  motor?: DecisionMotor;
  /**
   * Active classifier version — the payload-level `model_version` of
   * GET /api/v2/motors (single XGBoost classifier, no RF ensemble).
   */
  modelVersion?: string | null;
  className?: string;
}

export function latestDecisionMotor(
  motors?: DecisionMotor[],
): DecisionMotor | undefined {
  return [...(motors ?? [])]
    .filter((motor) => motor.decisionUpdatedAt)
    .sort((a, b) => {
      return new Date(b.decisionUpdatedAt!).getTime() - new Date(a.decisionUpdatedAt!).getTime();
    })[0];
}

export function DecisionEngineStatus({ motor, modelVersion, className }: DecisionEngineStatusProps) {
  const { t, fault } = useI18n();
  const activeDecision = fault(motor?.decisionFaultLabel) ?? t("dashboard.noDecision");

  // Stage severity mirrors the backend's own stage taxonomy
  // (Stage 3-4 = critical failure risk, Stage 2 = moderate risk).
  const stageTone: "primary" | "warning" | "danger" | "muted" =
    motor?.decisionStage == null
      ? "muted"
      : motor.decisionStage >= 3
        ? "danger"
        : motor.decisionStage === 2
          ? "warning"
          : "primary";
  const gateTone: "primary" | "warning" | "muted" =
    motor?.decisionGateStatus === "ANOMALY"
      ? "warning"
      : motor?.decisionGateStatus === "HEALTHY"
        ? "primary"
        : "muted";

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <CardTitle className="flex flex-wrap items-center gap-x-2 gap-y-1 text-base">
          <BrainCircuit className="h-5 w-5 shrink-0 text-primary" />
          <span className="min-w-0 break-words">
            {t("dashboard.decisionEngine")}:{" "}
            <BreakableCode value={activeDecision} />
          </span>
          {motor && (
            <Badge variant="outline" className="ml-auto font-mono text-xs">
              {motor.name}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!motor || !motor.decisionUpdatedAt ? (
          <div className="flex min-h-16 items-center gap-3 rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
            <Activity className="h-4 w-4 shrink-0" />
            {t("dashboard.noDecisionResult")}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-7">
              <StatusMetric
                label={t("dashboard.fault")}
                value={
                  <BreakableCode
                    value={fault(motor.decisionFaultLabel) ?? "—"}
                  />
                }
                className="col-span-2 md:col-span-3 xl:col-span-2"
              />
              <StatusMetric
                label={t("dashboard.faultConfidence")}
                value={motor.decisionFaultConfidence == null ? "—" : `${(motor.decisionFaultConfidence * 100).toFixed(1)}%`}
              />
              <StatusMetric
                label={t("dashboard.modelStatus")}
                value={motor.decisionMlActive ? t("dashboard.mlActive") : t("dashboard.ruleFallback")}
                tone={motor.decisionMlActive ? "primary" : "warning"}
              />
              <StatusMetric
                label={t("dashboard.health")}
                value={motor.decisionHealthPercent == null ? "—" : `${motor.decisionHealthPercent.toFixed(1)}%`}
                tone="primary"
              />
              <StatusMetric
                label={t("dashboard.stage")}
                value={motor.decisionStage == null ? "—" : `${motor.decisionStage} / 4`}
                tone={stageTone}
              />
              <StatusMetric
                label={t("dashboard.gate")}
                value={motor.decisionGateStatus ?? "—"}
                tone={gateTone}
              />
            </div>

            <div className="grid gap-3 border-t border-border/60 pt-3 text-xs text-muted-foreground md:grid-cols-2">
              <div className="flex items-start gap-2">
                <Cpu className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span>
                  <span className="font-semibold text-foreground">{t("dashboard.classifier")}:</span>{" "}
                  XGBoost {modelVersion ?? "—"}
                </span>
              </div>
              <div className="flex items-start gap-2">
                <Layers className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span>
                  <span className="font-semibold text-foreground">{t("dashboard.stagePolicy")}:</span>{" "}
                  {motor.decisionStageLabel ?? "—"}
                </span>
              </div>
              <div className="flex items-start gap-2">
                <Database className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span>
                  <span className="font-semibold text-foreground">{t("dashboard.dataSource")}:</span>{" "}
                  {motor.decisionSource === "live_runtime"
                    ? t("dashboard.sourceLive")
                    : motor.decisionSource === "supabase"
                      ? t("dashboard.sourcePersisted")
                      : "—"}
                </span>
              </div>
              <div className="flex items-start gap-2">
                <Activity className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                   {t("dashboard.updatedAgo")} {formatDistanceToNow(new Date(motor.decisionUpdatedAt!), { addSuffix: true })}
                </span>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function StatusMetric({
  label,
  value,
  tone = "muted",
  className,
}: {
  label: string;
  value: ReactNode;
  tone?: "primary" | "warning" | "danger" | "muted";
  className?: string;
}) {
  const toneClass = {
    primary: "text-emerald-300",
    warning: "text-[hsl(var(--chart-2))]",
    danger: "text-destructive",
    muted: "text-foreground",
  }[tone];

  return (
    <div className={`min-w-0 rounded-md border border-border/60 bg-black/20 p-3 ${className ?? ""}`}>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div
        className={`mt-1 font-mono text-[11px] font-semibold leading-snug break-words hyphens-none sm:text-xs xl:text-sm ${toneClass}`}
        title={typeof value === "string" ? value : undefined}
      >
        {value}
      </div>
    </div>
  );
}
