import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  Filter,
  Loader2,
  ShieldCheck,
  Trash2,
  Undo2,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ApiErrorState } from "@/components/api-error-state";
import { SeverityBadge, StageBadge } from "@/components/ui/badges";
import {
  dismissAlerts,
  fetchAlerts,
  restoreAlerts,
  type V2Alert,
} from "@/lib/sigmo-api";
import { useI18n } from "@/i18n";
import { usePageTitle } from "@/lib/use-page-title";
import { useToast } from "@/hooks/use-toast";

const ALERTS_QUERY_KEY = ["sigmo-v2", "alerts"] as const;

/**
 * Alerts & Notifications — the operator's live inbox (V2).
 *
 * Alerts are DERIVED by the backend from each motor's newest window
 * (Stage >= 2 or an active fault verdict) — they are never a stale
 * table. Dismissing hides an alert while its condition persists; the
 * backend auto-forgets the dismissal once the condition clears, so an
 * escalating or re-triggering fault always alerts again. The immutable
 * audit trail lives separately in Fault Logs (Section 10).
 */
export function Alerts() {
  const [severityFilter, setSeverityFilter] = useState<string>("all");
  const [showDismissed, setShowDismissed] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isBulkDialogOpen, setIsBulkDialogOpen] = useState(false);

  const { t, fault, relativeTime } = useI18n();
  usePageTitle(t("alerts.title"));
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const alertsQuery = useQuery({
    queryKey: [...ALERTS_QUERY_KEY, showDismissed],
    queryFn: ({ signal }) => fetchAlerts(showDismissed, signal),
    refetchInterval: 30_000,
  });

  const invalidateAlerts = () => {
    queryClient.invalidateQueries({ queryKey: ALERTS_QUERY_KEY });
  };

  const reportError = (error: unknown) => {
    toast({
      title: t("alerts.toastFailedTitle"),
      description:
        error instanceof Error ? error.message : t("alerts.toastFailedTitle"),
      variant: "destructive",
    });
  };

  const dismissMutation = useMutation({
    mutationFn: (ids: string[]) => dismissAlerts(ids),
    onSuccess: (result, ids) => {
      setSelectedIds((current) => {
        const next = new Set(current);
        ids.forEach((id) => next.delete(id));
        return next;
      });
      if (result.unknown.length > 0) {
        toast({
          title: t("alerts.toastPartialTitle"),
          description: `${result.affected} ok · ${result.unknown.length} ${t("alerts.toastUnknownSuffix")}`,
          variant: "destructive",
        });
      } else {
        toast({
          title: t("alerts.toastDismissedTitle"),
          description: `${result.affected} · ${t("alerts.toastDismissedBody")}`,
        });
      }
      invalidateAlerts();
    },
    onError: reportError,
  });

  const restoreMutation = useMutation({
    mutationFn: (ids: string[]) => restoreAlerts(ids),
    onSuccess: (result) => {
      toast({
        title: t("alerts.toastRestoredTitle"),
        description: `${result.affected} · ${t("alerts.toastRestoredBody")}`,
      });
      invalidateAlerts();
    },
    onError: reportError,
  });

  const allAlerts = alertsQuery.data?.alerts ?? [];
  const visibleAlerts = useMemo(
    () =>
      severityFilter === "all"
        ? allAlerts
        : allAlerts.filter((a) => a.severity === severityFilter),
    [allAlerts, severityFilter],
  );
  const activeVisible = visibleAlerts.filter((a) => !a.dismissed);
  const selectedVisibleCount = activeVisible.filter((a) =>
    selectedIds.has(a.alertId),
  ).length;
  const allVisibleSelected =
    activeVisible.length > 0 && selectedVisibleCount === activeVisible.length;

  const toggleSelection = (alertId: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(alertId)) next.delete(alertId);
      else next.add(alertId);
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelectedIds((current) => {
      if (allVisibleSelected) return new Set();
      return new Set(activeVisible.map((a) => a.alertId));
    });
  };

  const confirmBulkDismiss = () => {
    const ids = activeVisible
      .filter((a) => selectedIds.has(a.alertId))
      .map((a) => a.alertId);
    if (ids.length === 0) return;
    dismissMutation.mutate(ids);
    setIsBulkDialogOpen(false);
  };

  const isLoading = alertsQuery.isLoading;
  const isError = alertsQuery.isError;

  return (
    <div className="flex flex-col gap-6 h-full animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-3">
            <Bell className="h-8 w-8 text-primary" />
            {t("alerts.title")}
          </h1>
          <p className="text-muted-foreground mt-2 max-w-2xl">
            {t("alerts.subtitle")}
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 bg-card p-2 rounded-lg border border-border">
          <div className="flex items-center gap-2 px-2">
            <Checkbox
              checked={allVisibleSelected}
              onCheckedChange={toggleSelectAll}
              aria-label={t("alerts.selectAll")}
              disabled={activeVisible.length === 0}
            />
            <span className="text-sm font-medium text-muted-foreground whitespace-nowrap">
              {selectedVisibleCount > 0
                ? `${selectedVisibleCount}/${activeVisible.length} ${t("alerts.selected")}`
                : t("alerts.selectAll")}
            </span>
          </div>
          {selectedVisibleCount > 0 && (
            <Button
              size="sm"
              variant="destructive"
              aria-label={t("alerts.dismissSelected")}
              title={t("alerts.dismissSelected")}
              disabled={dismissMutation.isPending}
              onClick={() => setIsBulkDialogOpen(true)}
            >
              {dismissMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              <span className="ml-1.5 hidden sm:inline">
                {t("alerts.dismissSelected")}
              </span>
            </Button>
          )}
          <div className="flex items-center gap-2 px-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <Select
              value={severityFilter}
              onValueChange={(value) => {
                setSeverityFilter(value);
                setSelectedIds(new Set());
              }}
            >
              <SelectTrigger className="w-[150px] h-8 bg-transparent border-none focus:ring-0 shadow-none">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("alerts.severityAll")}</SelectItem>
                <SelectItem value="critical">
                  {t("severity.critical")}
                </SelectItem>
                <SelectItem value="high">{t("severity.high")}</SelectItem>
                <SelectItem value="medium">{t("severity.medium")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="h-6 w-px bg-border"></div>
          <div className="flex items-center gap-2 px-3">
            <Checkbox
              id="show-dismissed"
              checked={showDismissed}
              onCheckedChange={(c) => {
                setShowDismissed(!!c);
                setSelectedIds(new Set());
              }}
            />
            <label
              htmlFor="show-dismissed"
              className="text-sm font-medium leading-none text-muted-foreground cursor-pointer whitespace-nowrap"
            >
              {t("alerts.showDismissed")}
            </label>
          </div>
        </div>
      </div>

      <div className="space-y-4 pb-12">
        {isLoading ? (
          <>
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </>
        ) : isError ? (
          <ApiErrorState message={t("alerts.errorState")} />
        ) : visibleAlerts.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card py-20">
            <CheckCircle2 className="mb-4 h-16 w-16 text-primary opacity-50" />
            <h3 className="text-xl font-medium">
              {allAlerts.length === 0
                ? t("alerts.emptyTitle")
                : t("alerts.emptyFiltered")}
            </h3>
            <p className="text-muted-foreground">
              {allAlerts.length === 0
                ? t("alerts.emptyBody")
                : t("alerts.emptyFiltered")}
            </p>
          </div>
        ) : (
          visibleAlerts.map((alert) => (
            <AlertCard
              key={alert.alertId}
              alert={alert}
              selected={selectedIds.has(alert.alertId)}
              selectable={!alert.dismissed}
              onToggle={() => toggleSelection(alert.alertId)}
              onDismiss={() => dismissMutation.mutate([alert.alertId])}
              onRestore={() => restoreMutation.mutate([alert.alertId])}
              busy={
                (dismissMutation.isPending || restoreMutation.isPending) &&
                (dismissMutation.variables?.includes(alert.alertId) ===
                  true ||
                  restoreMutation.variables?.includes(alert.alertId) ===
                    true)
              }
              t={t}
              fault={fault}
              relativeTime={relativeTime}
            />
          ))
        )}
      </div>

      {!isLoading && !isError && allAlerts.length > 0 && (
        <p className="flex items-start gap-2 text-[11px] text-muted-foreground">
          <ShieldCheck className="mt-0.5 h-3 w-3 shrink-0" />
          {t("alerts.immutabilityNote")}
        </p>
      )}

      <Dialog open={isBulkDialogOpen} onOpenChange={setIsBulkDialogOpen}>
        <DialogContent className="sm:max-w-[425px] bg-card border-destructive">
          <DialogHeader>
            <DialogTitle className="text-destructive flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              {t("alerts.confirmTitle")}
            </DialogTitle>
            <DialogDescription>{t("alerts.confirmBody")}</DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4">
            <Button
              variant="outline"
              onClick={() => setIsBulkDialogOpen(false)}
              className="border-border"
              disabled={dismissMutation.isPending}
            >
              {t("alerts.cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={confirmBulkDismiss}
              disabled={dismissMutation.isPending}
            >
              {dismissMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="mr-2 h-4 w-4" />
              )}
              {t("alerts.confirmCta")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AlertCard({
  alert,
  selected,
  selectable,
  onToggle,
  onDismiss,
  onRestore,
  busy,
  t,
  fault,
  relativeTime,
}: {
  alert: V2Alert;
  selected: boolean;
  selectable: boolean;
  onToggle: () => void;
  onDismiss: () => void;
  onRestore: () => void;
  busy: boolean;
  t: ReturnType<typeof useI18n>["t"];
  fault: ReturnType<typeof useI18n>["fault"];
  relativeTime: ReturnType<typeof useI18n>["relativeTime"];
}) {
  const verdictLabel =
    alert.predictedClass != null
      ? (fault(alert.predictedClass) ?? alert.predictedClass)
      : alert.stageLabel;

  return (
    <Card
      className={`overflow-hidden transition-all duration-200 border-l-4 hover:bg-muted/30 ${
        alert.severity === "critical"
          ? "border-l-destructive shadow-[0_0_15px_rgba(255,42,42,0.1)]"
          : alert.severity === "high"
            ? "border-l-destructive/70"
            : "border-l-[hsl(var(--chart-2))]"
      } ${alert.dismissed ? "opacity-60" : ""}`}
    >
      <CardContent className="p-0">
        <div className="flex flex-col sm:flex-row items-start sm:items-center p-4 gap-4">
          {selectable && (
            <Checkbox
              checked={selected}
              onCheckedChange={onToggle}
              aria-label={`${verdictLabel} — ${alert.motorId}`}
              className="mt-1 shrink-0"
            />
          )}
          <div className="flex-1 min-w-0 flex flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-2.5">
              <SeverityBadge severity={alert.severity} />
              <span className="font-mono text-xs text-muted-foreground px-2 py-0.5 bg-black/40 rounded border border-border">
                {alert.motorId}
              </span>
              <span className="font-bold text-foreground truncate">
                {verdictLabel}
              </span>
              <StageBadge stage={alert.stage} label={alert.stageLabel} />
              {alert.dismissed && (
                <Badge
                  variant="outline"
                  className="border-amber-500/40 bg-amber-500/10 text-amber-300"
                >
                  {t("alerts.dismissedBadge")}
                </Badge>
              )}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {alert.modelConfidence != null && (
                <span>
                  {t("v2.confidence")}{" "}
                  <span className="font-mono text-foreground/80">
                    {(alert.modelConfidence * 100).toFixed(1)}%
                  </span>
                </span>
              )}
              {alert.healthPercent != null && (
                <span>
                  {t("alerts.health")}{" "}
                  <span className="font-mono text-foreground/80">
                    {alert.healthPercent.toFixed(0)}%
                  </span>
                </span>
              )}
              {alert.thdPercentMax != null && (
                <span>
                  THD{" "}
                  <span className="font-mono text-foreground/80">
                    {alert.thdPercentMax.toFixed(1)}%
                  </span>
                </span>
              )}
              {alert.unbalancePercent != null && (
                <span>
                  {t("alerts.unbalance")}{" "}
                  <span className="font-mono text-foreground/80">
                    {alert.unbalancePercent.toFixed(1)}%
                  </span>
                </span>
              )}
            </div>
          </div>

          <div className="flex sm:flex-col items-center sm:items-end justify-between w-full sm:w-auto gap-3 sm:gap-2">
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              {alert.dismissedAt
                ? `${t("alerts.dismissedBadge")} ${relativeTime(new Date(alert.dismissedAt))}`
                : alert.recordedAt
                  ? relativeTime(new Date(alert.recordedAt))
                  : ""}
            </span>
            {alert.dismissed ? (
              <Button
                size="sm"
                variant="outline"
                className="border-amber-500/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20"
                onClick={onRestore}
                disabled={busy}
                title={t("alerts.restore")}
              >
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Undo2 className="h-4 w-4" />
                )}
                <span className="ml-1.5">{t("alerts.restore")}</span>
              </Button>
            ) : (
              <Button
                size="sm"
                variant="outline"
                className="border-destructive/40 bg-destructive/10 text-destructive hover:bg-destructive hover:text-destructive-foreground"
                onClick={onDismiss}
                disabled={busy}
                aria-label={t("alerts.dismiss")}
                title={t("alerts.dismiss")}
              >
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
                <span className="ml-1.5">{t("alerts.dismiss")}</span>
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

