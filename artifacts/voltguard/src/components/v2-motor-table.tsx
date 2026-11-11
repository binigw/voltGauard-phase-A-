import { Activity, Edit2, Radio, RefreshCw, Trash2 } from "lucide-react";
import type { UseQueryResult } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiErrorState } from "@/components/api-error-state";
import { useI18n } from "@/i18n";
import {
  toBadgeStatus,
  type V2MotorsOverview,
} from "@/lib/sigmo-motors";
import type { MotorAsset } from "@/lib/sigmo-assets";
import { HealthScoreBadge, MotorStatusBadge, StageBadge } from "@/components/ui/badges";

/**
 * Live Machine Status Grid backed by GET /api/v2/motors.
 *
 * Enterprise presentation of the live per-motor overview: badge
 * status, health index, Stage, the persisted v6c verdict with its
 * confidence, and the freshness source — with clean skeletons while
 * loading and a professional empty state instead of error boxes.
 */
export function V2MotorTable({
  query,
  assets = [],
  title,
  onDelete,
  selectedIds,
  onToggleMotor,
  onToggleSelectAllMotors,
  description,
  emptyHint,
  compact = false,
  search,
  onEdit,
}: {
  query: UseQueryResult<V2MotorsOverview | null, Error>;
  /** Commissioned assets — motors without telemetry yet show as awaiting. */
  assets?: MotorAsset[];
  title?: string;
  description?: string;
  emptyHint?: string;
  compact?: boolean;
  /** Optional client-side filter on the motor id. */
  search?: string;
  /** Optional per-row edit (opens the commissioning form). */
  onEdit?: (motorId: string) => void;
  /** Optional per-row delete (decommission). Executive surface only. */
  onDelete?: (motorId: string) => void;
  /** Controlled row selection for bulk management (page-owned state). */
  selectedIds?: ReadonlySet<string>;
  /** Toggle one row's checkbox. */
  onToggleMotor?: (motorId: string) => void;
  /** Select-all toggle over the visible (filtered) rows. */
  onToggleSelectAllMotors?: (visibleIds: string[], allSelected: boolean) => void;
}) {
  const { t, fault, relativeTime } = useI18n();
  const liveMotors = query.data?.motors ?? [];
  const term = search?.trim().toLowerCase() ?? "";

  // Union: every motor with telemetry plus every commissioned asset.
  // Registered motors without telemetry yet render as "awaiting".
  const seen = new Set(liveMotors.map((motor) => motor.motor_id));
  const awaiting = assets
    .filter((asset) => !seen.has(asset.motor_id))
    .map(
      (asset): NonNullable<V2MotorsOverview["motors"]>[number] & {
        awaiting: boolean;
      } => ({
        motor_id: asset.motor_id,
        status: "AWAITING_TELEMETRY",
        predicted_class: null,
        model_confidence: null,
        health_percent: null,
        stage: 1,
        stage_label: "Commissioned — awaiting first telemetry window",
        is_fault: false,
        thd_percent_max: null,
        unbalance_percent: null,
        fundamental_hz: null,
        recorded_at: "",
        source: "registry",
        awaiting: true,
      }),
    );
  const motors = [
    ...liveMotors.map((motor) => ({ ...motor, awaiting: false })),
    ...awaiting,
  ].filter(
    (motor) =>
      term === "" || motor.motor_id.toLowerCase().includes(term),
  );

  // Bulk-management mode: only when management actions AND controlled
  // selection are provided (Machines page, Executive view).
  const manageMode = Boolean(
    onDelete && onToggleMotor && onToggleSelectAllMotors && selectedIds,
  );
  const visibleIds = motors.map((motor) => motor.motor_id);
  const allSelected =
    visibleIds.length > 0 &&
    visibleIds.every((id) => selectedIds?.has(id));
  const someSelected =
    visibleIds.some((id) => selectedIds?.has(id)) && !allSelected;

  return (
    <Card className="border-border bg-card">
      <CardHeader className="flex flex-row items-start justify-between border-b border-border/50 pb-4">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2 text-base">
            <Activity className="h-4 w-4 text-primary" />
            {title ?? t("dashboard.machineGrid")}
          </CardTitle>
          {description ? (
            <CardDescription>{description}</CardDescription>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {manageMode ? (
            <label className="flex cursor-pointer items-center gap-1.5 text-xs font-normal text-muted-foreground">
              <Checkbox
                checked={allSelected ? true : someSelected ? "indeterminate" : false}
                onCheckedChange={() =>
                  onToggleSelectAllMotors?.(visibleIds, allSelected)
                }
                aria-label={t("machines.selectAllA11y")}
                disabled={visibleIds.length === 0}
              />
              {t("machines.selectAllLabel")}
            </label>
          ) : null}
          {query.data ? (
            <Badge
              variant="outline"
              className="shrink-0 border-emerald-400/30 bg-emerald-400/10 font-mono text-[10px] text-emerald-300"
            >
              {motors.filter((motor) => !motor.awaiting).length} live
              {awaiting.length > 0 ? ` · ${awaiting.length} ${t("v2.awaiting")}` : ""}
            </Badge>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {query.isLoading ? (
          <div className="space-y-3 p-6">
            {[1, 2, 3, 4].map((row) => (
              <Skeleton key={row} className="h-12 w-full" />
            ))}
          </div>
        ) : query.isError ? (
          <div className="p-6">
            <ApiErrorState
              message={
                query.error instanceof Error
                  ? query.error.message
                  : undefined
              }
            />
          </div>
        ) : motors.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 p-10 text-center">
            <div className="rounded-full border border-border/60 bg-black/20 p-3">
              <Radio className="h-6 w-6 text-primary opacity-70" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">
                {t("v2.emptyTitle")}
              </p>
              <p className="mt-1 max-w-md text-xs text-muted-foreground">
                {emptyHint ?? t("v2.emptyBody")}
              </p>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border bg-black/20 text-xs uppercase text-muted-foreground">
                <tr>
                  {manageMode ? <th className="w-10 px-4 py-3" /> : null}
                  <th className="px-4 py-3 font-medium">
                    {t("dashboard.machine")}
                  </th>
                  <th className="px-4 py-3 font-medium">
                    {t("dashboard.status")}
                  </th>
                  <th className="px-4 py-3 font-medium">
                    {t("dashboard.healthScore")}
                  </th>
                  <th className="px-4 py-3 font-medium">
                    {t("v2.faultColumn")}
                  </th>
                  {!compact ? (
                    <>
                      <th className="px-4 py-3 font-medium">
                        {t("v2.riskLevel")}
                      </th>
                      <th className="px-4 py-3 font-medium">
                        {t("v2.lastUpdate")}
                      </th>
                    </>
                  ) : null}
                  {onEdit || onDelete ? (
                    <th className="px-4 py-3 font-medium">{t("machines.actions")}</th>
                  ) : null}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {motors.map((motor) => (
                  <tr
                    key={motor.motor_id}
                    className="transition-colors hover:bg-muted/30"
                  >
                    {manageMode ? (
                      <td className="px-4 py-3">
                        <Checkbox
                          checked={selectedIds?.has(motor.motor_id) ?? false}
                          onCheckedChange={() => onToggleMotor?.(motor.motor_id)}
                          aria-label={`${t("machines.selectMotorA11y")} ${motor.motor_id}`}
                        />
                      </td>
                    ) : null}
                    <td className="px-4 py-3">
                      <div className="font-mono font-semibold text-foreground">
                        {motor.motor_id}
                      </div>
                      <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                        <RefreshCw className="h-3 w-3" />
                        {motor.source === "live_runtime"
                          ? t("v2.liveSource")
                          : t("v2.dbSource")}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {motor.awaiting ? (
                        <Badge
                          variant="outline"
                          className="border-border/60 bg-muted/40 text-muted-foreground"
                        >
                          {t("v2.awaiting")}
                        </Badge>
                      ) : (
                        <MotorStatusBadge status={toBadgeStatus(motor)} />
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {motor.awaiting ? (
                        <span className="text-xs text-muted-foreground">—</span>
                      ) : (
                        <div className="flex items-center gap-2">
                          <Progress
                            value={motor.health_percent ?? 0}
                            className="h-2 w-16"
                            indicatorColor={
                              (motor.health_percent ?? 0) < 50
                                ? "bg-destructive"
                                : (motor.health_percent ?? 0) < 80
                                  ? "bg-[hsl(var(--chart-2))]"
                                  : "bg-primary"
                            }
                          />
                          <HealthScoreBadge
                            score={motor.health_percent ?? 0}
                          />
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {motor.predicted_class ? (
                        <div className="flex flex-col">
                          <span className="text-sm font-medium text-foreground">
                            {fault(motor.predicted_class) ?? motor.predicted_class}
                          </span>
                          {motor.model_confidence !== null ? (
                            <span className="text-[11px] text-muted-foreground">
                              {t("v2.confidence")}{" "}
                              {(motor.model_confidence * 100).toFixed(1)}%
                            </span>
                          ) : null}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    {!compact ? (
                      <>
                        <td className="px-4 py-3">
                          {/* Words first ("Moderate Risk"), Stage number
                              second — technicians read the risk level
                              instantly; full policy text on hover. */}
                          <StageBadge
                            stage={motor.stage}
                            label={motor.stage_label}
                          />
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">
                          {motor.awaiting
                            ? t("v2.registryOnly")
                            : relativeTime(new Date(motor.recorded_at))}
                        </td>
                      </>
                    ) : null}
                    {onEdit || onDelete ? (
                      <td className="px-4 py-3">
                        {/* Same action-button pattern as the Personnel
                            page: ghost icon-only buttons, always
                            visible (no hover reveal, no borders). */}
                        <div className="flex shrink-0 items-center gap-1">
                          {onEdit ? (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => onEdit(motor.motor_id)}
                              aria-label={t("v2.editAsset")}
                              title={t("v2.editAsset")}
                            >
                              <Edit2 className="h-4 w-4 text-muted-foreground" />
                            </Button>
                          ) : null}
                          {onDelete ? (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 hover:bg-destructive/10"
                              onClick={() => onDelete(motor.motor_id)}
                              aria-label={t("machines.deleteA11y")}
                              title={t("machines.deleteA11y")}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          ) : null}
                        </div>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
