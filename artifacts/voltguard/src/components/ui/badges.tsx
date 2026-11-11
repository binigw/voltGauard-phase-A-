import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/i18n";

export function MotorStatusBadge({ status }: { status: 'running' | 'warning' | 'stopped' }) {
  const { t } = useI18n();
  switch (status) {
    case 'running':
      return <Badge className="bg-primary hover:bg-primary/80 text-primary-foreground border-transparent font-semibold shadow-[0_0_10px_rgba(26,214,104,0.3)]">{t("status.running")}</Badge>;
    case 'warning':
      return <Badge className="bg-[hsl(var(--chart-2))] hover:bg-[hsl(var(--chart-2))]/80 text-black border-transparent font-semibold">{t("status.warning")}</Badge>;
    case 'stopped':
      return <Badge variant="destructive" className="font-semibold shadow-[0_0_10px_rgba(255,42,42,0.3)]">{t("status.stopped")}</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

export function SeverityBadge({ severity }: { severity: 'critical' | 'high' | 'medium' | 'low' | string }) {
  const { t } = useI18n();
  switch (severity.toLowerCase()) {
    case 'critical':
      return <Badge variant="destructive" className="animate-pulse shadow-[0_0_10px_rgba(255,42,42,0.5)]">{t("severity.critical")}</Badge>;
    case 'high':
      return <Badge variant="destructive">{t("severity.high")}</Badge>;
    case 'medium':
      return <Badge className="bg-[hsl(var(--chart-2))] hover:bg-[hsl(var(--chart-2))]/80 text-black">{t("severity.medium")}</Badge>;
    case 'low':
      return <Badge className="bg-muted text-muted-foreground border-border">{t("severity.low")}</Badge>;
    default:
      return <Badge variant="outline">{severity}</Badge>;
  }
}

export function HealthScoreBadge({ score }: { score: number }) {
  let colorClass = "text-emerald-300";
  if (score < 50) colorClass = "text-destructive";
  else if (score < 80) colorClass = "text-[hsl(var(--chart-2))]";

  return <span className={`font-bold ${colorClass}`}>{score}%</span>;
}

/**
 * Severity stage badge — descriptive word only ("Moderate Risk" /
 * "Severe" / "Critical"); the Stage NUMBER is deliberately NOT shown
 * (technician feedback: a bare "Stage 2" is jargon that must be
 * decoded). The full backend policy label (e.g. "Stage 2 — Moderate
 * Risk (Early-Stage Fault)") remains available as the hover tooltip
 * for cross-referencing the Section 6.b policy table.
 *
 * Color mapping matches the long-standing stage palette (emerald /
 * amber / destructive) so dark-mode contrast behaviour is unchanged.
 */
const STAGE_BADGE_CLASS: Record<number, string> = {
  1: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
  2: "border-amber-500/30 bg-amber-500/10 text-amber-400",
  3: "border-destructive/30 bg-destructive/10 text-destructive",
  4: "border-destructive/50 bg-destructive/15 text-destructive shadow-[0_0_10px_rgba(255,42,42,0.35)]",
};

export function stageWordKey(stage: number): string {
  return `stage.word.${Math.max(1, Math.min(4, Math.round(stage)))}`;
}

export function StageBadge({
  stage,
  label,
  className,
}: {
  stage: number;
  label?: string;
  className?: string;
}) {
  const { t } = useI18n();
  const s = Math.max(1, Math.min(4, Math.round(stage)));
  return (
    <Badge
      variant="outline"
      title={label ?? undefined}
      className={`${STAGE_BADGE_CLASS[s]}${className ? ` ${className}` : ""}`}
    >
      <span
        aria-hidden
        className="mr-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-current"
      />
      {t(stageWordKey(s))}
    </Badge>
  );
}
