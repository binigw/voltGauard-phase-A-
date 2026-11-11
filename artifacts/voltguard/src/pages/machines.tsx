import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListMotors,
  getListMotorsQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MotorStatusBadge, HealthScoreBadge } from "@/components/ui/badges";
import { Progress } from "@/components/ui/progress";
import { Search, MapPin, Cpu, Lock, Plus, Loader2, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { ApiErrorState } from "@/components/api-error-state";
import { V2MotorTable } from "@/components/v2-motor-table";
import { useI18n } from "@/i18n";
import { usePageTitle } from "@/lib/use-page-title";
import { useMotorsOverview } from "@/lib/sigmo-motors";
import { useMotorAssets, type MotorAsset } from "@/lib/sigmo-assets";
import { useRole } from "@/lib/role-context";
import { useToast } from "@/hooks/use-toast";
import { getSupabase } from "@/lib/supabase-client";

/**
 * Machine Registry.
 *
 * Technicians: strictly read-only (badge + lock note, no write affordance).
 * Executives (server-role admins in Executive mode): a "Register New
 * Motor" action opens the commissioning form.
 *
 * The registration call does NOT carry the admin API key — no
 * write-scope credential ever ships to the browser. It posts the
 * caller's Supabase session token to the /api/register-motor server
 * function, which verifies the session, requires the admin role in
 * public.user_roles (server-side, fail-closed), and only then writes
 * via the backend's admin endpoint with the server-held key.
 */
export function Machines() {
  const { t } = useI18n();
  const { role } = useRole();
  const isExecutive = role === "executive";
  usePageTitle(t("machines.title"));

  const { data: motors, isLoading, isError: isMotorsError } = useListMotors({
    query: { refetchInterval: 30000, queryKey: getListMotorsQueryKey() },
  });
  const [searchTerm, setSearchTerm] = useState("");
  const [isRegisterOpen, setIsRegisterOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [selectedMotorIds, setSelectedMotorIds] = useState<Set<string>>(
    new Set(),
  );
  const [bulkTargets, setBulkTargets] = useState<string[] | null>(null);
  const [editingMotorId, setEditingMotorId] = useState<string | null>(null);

  // Bulk selection is an Executive management tool — leaving Executive
  // mode must drop it (same hygiene as the Personnel page).
  useEffect(() => {
    if (!isExecutive) setSelectedMotorIds(new Set());
  }, [isExecutive]);

  const toggleMotor = (motorId: string) => {
    setSelectedMotorIds((current) => {
      const next = new Set(current);
      if (next.has(motorId)) next.delete(motorId);
      else next.add(motorId);
      return next;
    });
  };

  const toggleSelectAllMotors = (
    visibleIds: string[],
    allSelected: boolean,
  ) => {
    setSelectedMotorIds((current) => {
      const next = new Set(current);
      if (allSelected) visibleIds.forEach((id) => next.delete(id));
      else visibleIds.forEach((id) => next.add(id));
      return next;
    });
  };

  const motorRecords = Array.isArray(motors) ? motors : [];
  // Live V2 fallback: when the legacy registry backend is absent, the
  // page shows the live motor overview instead of an error box.
  const motorsOverviewQuery = useMotorsOverview();
  const assetsQuery = useMotorAssets();
  const useV2Fallback = motorRecords.length === 0;
  const editingAsset =
    (assetsQuery.data ?? []).find(
      (asset) => asset.motor_id === editingMotorId,
    ) ?? null;

  const filteredMotors = motorRecords.filter(
    (m) =>
      m.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      m.location.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  return (
    <div className="flex flex-col gap-6 h-full animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-3">
              <Cpu className="h-8 w-8 text-primary" />
              {t("machines.title")}
            </h1>
            {!isExecutive && (
              <Badge
                variant="outline"
                className="border-border bg-card text-xs font-normal text-muted-foreground"
              >
                {t("machines.readonlyBadge")}
              </Badge>
            )}
          </div>
          <p className="text-muted-foreground mt-2">
            {t("machines.subtitle")}
          </p>
          {!isExecutive && (
            <div className="mt-3 flex items-start gap-2 rounded-md border border-emerald-400/25 bg-emerald-400/10 px-3 py-2 text-xs leading-relaxed text-emerald-200">
              <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>{t("machines.readonlyNote")}</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          {isExecutive && selectedMotorIds.size > 0 && (
            <Button
              size="sm"
              variant="destructive"
              onClick={() => setBulkTargets([...selectedMotorIds])}
              aria-label={t("machines.bulkDeleteTitle")}
              title={t("machines.bulkDeleteTitle")}
              className="shrink-0"
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              {selectedMotorIds.size}
            </Button>
          )}
          {isExecutive && (
            <Button
              type="button"
              onClick={() => {
                setEditingMotorId(null);
                setIsRegisterOpen(true);
              }}
              className="shrink-0 bg-primary font-semibold text-primary-foreground hover:bg-primary/90"
            >
              <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
              {t("machines.registerButton")}
            </Button>
          )}
          <div className="relative flex-1 sm:w-[250px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              aria-label={t("machines.search")}
              placeholder={t("machines.search")}
              className="pl-9 bg-card border-border"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
      </div>

      <Card className="border-border bg-card overflow-hidden shadow-lg flex-1 min-h-0 flex flex-col">
        <CardContent className="p-0 flex-1 overflow-auto">
          {isLoading && !useV2Fallback ? (
            <div className="p-6 space-y-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : useV2Fallback ? (
            <div className="p-6">
              <V2MotorTable
                query={motorsOverviewQuery}
                assets={assetsQuery.data ?? []}
                search={searchTerm}
                title={t("dashboard.machineGrid")}
                description={t("v2.readonlyNote")}
                onDelete={isExecutive ? setDeleteTarget : undefined}
                onEdit={
                  isExecutive
                    ? (motorId) => {
                        setEditingMotorId(motorId);
                        setIsRegisterOpen(true);
                      }
                    : undefined
                }
                selectedIds={isExecutive ? selectedMotorIds : new Set()}
                onToggleMotor={isExecutive ? toggleMotor : undefined}
                onToggleSelectAllMotors={
                  isExecutive ? toggleSelectAllMotors : undefined
                }
              />
            </div>
          ) : isMotorsError ? (
            <ApiErrorState message="Unable to load the motor registry." />
          ) : (
            <div className="overflow-x-auto">
              <table
                aria-label={t("machines.title")}
                className="w-full text-sm text-left whitespace-nowrap"
              >
                <thead className="text-xs text-muted-foreground uppercase bg-black/40 border-b border-border sticky top-0 z-10">
                  <tr>
                    <th className="px-6 py-4 font-medium">{t("machines.idName")}</th>
                    <th className="px-6 py-4 font-medium">{t("machines.location")}</th>
                    <th className="px-6 py-4 font-medium">{t("machines.status")}</th>
                    <th className="px-6 py-4 font-medium">{t("machines.healthRisk")}</th>
                    <th className="px-6 py-4 font-medium">{t("machines.telemetryThd")}</th>
                    <th className="px-6 py-4 font-medium">{t("machines.installed")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {filteredMotors.map((motor) => (
                    <tr
                      key={motor.id}
                      className="hover:bg-muted/30 transition-colors"
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded bg-black/50 border border-border flex items-center justify-center shrink-0">
                            <Cpu
                              className={`h-5 w-5 ${
                                motor.status === "stopped"
                                  ? "text-destructive"
                                  : "text-muted-foreground"
                              }`}
                            />
                          </div>
                          <div>
                            <div className="font-bold text-foreground">
                              {motor.name}
                            </div>
                            <div className="text-xs text-muted-foreground font-mono">
                              ID: MTR-{motor.id.toString().padStart(4, "0")} |{" "}
                              {motor.motorType}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          <MapPin className="h-3.5 w-3.5" />
                          {motor.location}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <MotorStatusBadge status={motor.status} />
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col gap-1 w-32">
                          <div className="flex justify-between text-xs">
                            <span className="text-muted-foreground">
                              Health:{" "}
                              <HealthScoreBadge score={motor.healthScore} />
                            </span>
                          </div>
                          <Progress
                            value={motor.healthScore}
                            className="h-1.5"
                            indicatorColor={
                              motor.healthScore < 50
                                ? "bg-destructive"
                                : motor.healthScore < 80
                                  ? "bg-[hsl(var(--chart-2))]"
                                  : "bg-primary"
                            }
                          />
                          <div className="text-[10px] text-muted-foreground mt-1">
                            {t("machines.rulPending")}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col gap-1 text-xs font-mono">
                          <div className="flex items-center justify-between w-24">
                            <span className="text-muted-foreground">THD:</span>
                            <span
                              className={
                                motor.currentThd > 5
                                  ? "text-[hsl(var(--chart-2))]"
                                  : "text-foreground"
                              }
                            >
                              {typeof motor.currentThd === "number"
                                ? `${motor.currentThd.toFixed(1)}%`
                                : t("machines.unavailable")}
                            </span>
                          </div>
                          <div className="flex items-center justify-between w-24">
                            <span className="text-muted-foreground">VIB:</span>
                            <span
                              className={
                                motor.currentDb > 85
                                  ? "text-destructive"
                                  : "text-foreground"
                              }
                            >
                              {typeof motor.currentDb === "number"
                                ? `${motor.currentDb.toFixed(1)}dB`
                                : t("machines.unavailable")}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-xs text-muted-foreground">
                        {format(new Date(motor.installedAt), "MMM yyyy")}
                      </td>
                    </tr>
                  ))}
                  {motorRecords.length > 0 && filteredMotors.length === 0 && (
                    <tr>
                      <td
                        colSpan={6}
                        className="text-center py-12 text-muted-foreground"
                      >
                        {t("machines.noResults")}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <RegisterMotorDialog
        open={isRegisterOpen}
        onOpenChange={(next) => {
          setIsRegisterOpen(next);
          if (!next) setEditingMotorId(null);
        }}
        editingAsset={editingAsset}
      />

      <DeleteMotorDialog
        motorId={deleteTarget}
        onClose={() => setDeleteTarget(null)}
      />

      <BulkDeleteMotorsDialog
        motorIds={bulkTargets}
        onClose={() => setBulkTargets(null)}
      />
    </div>
  );
}

/**
 * Bulk decommission — one confirmation for the whole batch, then
 * honest per-motor accounting with Promise.allSettled: motors with
 * telemetry or fault history are refused by the backend (409) and
 * reported as kept, never silently dropped.
 */
function BulkDeleteMotorsDialog({
  motorIds,
  onClose,
}: {
  motorIds: string[] | null;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isDeleting, setIsDeleting] = useState(false);

  async function handleBulkDelete() {
    if (!motorIds || motorIds.length === 0) return;
    let sessionToken: string | null = null;
    try {
      const { data: sessionData } = await getSupabase().auth.getSession();
      sessionToken = sessionData.session?.access_token ?? null;
    } catch {
      sessionToken = null;
    }
    if (!sessionToken) {
      toast({
        title: t("machines.deleteFailedTitle"),
        description: t("machines.registerNoSession"),
        variant: "destructive",
      });
      return;
    }

    setIsDeleting(true);
    const results = await Promise.allSettled(
      motorIds.map(async (motorId) => {
        const response = await fetch("/api/delete-motor", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${sessionToken}`,
          },
          body: JSON.stringify({ motorId }),
        });
        if (!response.ok) throw new Error(String(response.status));
        return motorId;
      }),
    );
    const deleted = results.filter(
      (result): result is PromiseFulfilledResult<string> =>
        result.status === "fulfilled",
    ).length;
    const failed = motorIds.length - deleted;

    toast({
      title: t("machines.deleteSuccessTitle"),
      description: t("machines.bulkResult")
        .replace("{deleted}", String(deleted))
        .replace("{failed}", String(failed)),
    });

    void queryClient.invalidateQueries({
      queryKey: ["sigmo-v2", "motor-assets"],
    });
    void queryClient.invalidateQueries({
      queryKey: ["sigmo-v2", "motors-overview"],
    });
    setIsDeleting(false);
    onClose();
  }

  return (
    <Dialog open={motorIds !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("machines.bulkDeleteTitle")}</DialogTitle>
          <DialogDescription>
            {t("machines.bulkDeleteBody").replace(
              "{n}",
              String(motorIds?.length ?? 0),
            )}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={isDeleting}
            onClick={onClose}
          >
            {t("personnel.cancel")}
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={isDeleting}
            onClick={() => void handleBulkDelete()}
          >
            {isDeleting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />
            )}
            {t("machines.deleteCta")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Decommission confirmation — destructive action, explicit confirm.
 * The delete call carries no admin key: it posts the caller's session
 * token to /api/delete-motor, which verifies the ADMIN role
 * server-side before forwarding to the backend. Motors with telemetry
 * or fault history are refused by the backend (immutable audit trail)
 * and the UI surfaces that honestly.
 */
function DeleteMotorDialog({
  motorId,
  onClose,
}: {
  motorId: string | null;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isDeleting, setIsDeleting] = useState(false);

  async function handleDelete() {
    if (!motorId) return;
    let sessionToken: string | null = null;
    try {
      const { data: sessionData } = await getSupabase().auth.getSession();
      sessionToken = sessionData.session?.access_token ?? null;
    } catch {
      sessionToken = null;
    }
    if (!sessionToken) {
      toast({
        title: t("machines.deleteFailedTitle"),
        description: t("machines.registerNoSession"),
        variant: "destructive",
      });
      return;
    }

    setIsDeleting(true);
    try {
      const response = await fetch("/api/delete-motor", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sessionToken}`,
        },
        body: JSON.stringify({ motorId }),
      });
      if (response.status === 409) {
        toast({
          title: t("machines.deleteFailedTitle"),
          description: t("machines.deleteHasHistory"),
          variant: "destructive",
        });
        return;
      }
      if (!response.ok) {
        toast({
          title: t("machines.deleteFailedTitle"),
          variant: "destructive",
        });
        return;
      }
      toast({
        title: t("machines.deleteSuccessTitle"),
        description: t("machines.deleteSuccessBody").replace("{id}", motorId),
      });
      onClose();
      void queryClient.invalidateQueries({
        queryKey: ["sigmo-v2", "motor-assets"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["sigmo-v2", "motors-overview"],
      });
    } catch {
      toast({
        title: t("machines.deleteFailedTitle"),
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <Dialog open={motorId !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("machines.deleteTitle")}</DialogTitle>
          <DialogDescription>
            {t("machines.deleteBody").replace("{id}", motorId ?? "")}
          </DialogDescription>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">
          {t("machines.deleteHistoryNote")}
        </p>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={isDeleting}
            onClick={onClose}
          >
            {t("personnel.cancel")}
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={isDeleting}
            onClick={() => void handleDelete()}
          >
            {isDeleting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />
            )}
            {t("machines.deleteCta")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface RegisterFormState {
  motorId: string;
  mccPanelId: string;
  cabinetNumber: string;
  lineZoneId: string;
  nameplateKw: string;
  ratedRpm: string;
  driveType: string;
  assetTag: string;
  bearingPartNumber: string;
  spareCapacitorSpec: string;
  downtimeCostEtbPerHour: string;
}

const EMPTY_FORM: RegisterFormState = {
  motorId: "",
  mccPanelId: "",
  cabinetNumber: "",
  lineZoneId: "",
  nameplateKw: "",
  ratedRpm: "",
  driveType: "",
  assetTag: "",
  bearingPartNumber: "",
  spareCapacitorSpec: "",
  downtimeCostEtbPerHour: "",
};

const MOTOR_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

function RegisterMotorDialog({
  open,
  onOpenChange,
  editingAsset = null,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When set, the dialog runs in EDIT mode: prefilled, motor id locked. */
  editingAsset?: MotorAsset | null;
}) {
  const { t } = useI18n();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<RegisterFormState>(EMPTY_FORM);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isEditing = editingAsset !== null;

  // Prefill on open: existing values in edit mode, blank in create mode.
  // The PUT endpoint is a full-row upsert, so editing re-registers the
  // same motor_id with the updated fields.
  useEffect(() => {
    if (!open) return;
    if (editingAsset) {
      setForm({
        motorId: editingAsset.motor_id,
        mccPanelId: editingAsset.mcc_panel_id ?? "",
        cabinetNumber: editingAsset.cabinet_number ?? "",
        lineZoneId: editingAsset.line_zone_id ?? "",
        nameplateKw:
          editingAsset.nameplate_kw != null
            ? String(editingAsset.nameplate_kw)
            : "",
        ratedRpm:
          editingAsset.rated_rpm != null ? String(editingAsset.rated_rpm) : "",
        driveType: editingAsset.drive_type ?? "",
        assetTag: editingAsset.asset_tag ?? "",
        bearingPartNumber: editingAsset.bearing_part_number ?? "",
        spareCapacitorSpec: editingAsset.spare_capacitor_spec ?? "",
        downtimeCostEtbPerHour:
          editingAsset.downtime_cost_etb_per_hour != null
            ? String(editingAsset.downtime_cost_etb_per_hour)
            : "",
      });
    } else {
      setForm(EMPTY_FORM);
    }
    setValidationError(null);
  }, [open, editingAsset]);

  const set = (key: keyof RegisterFormState) => (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    setForm((current) => ({ ...current, [key]: event.target.value }));
  };

  function validate(): string | null {
    if (!MOTOR_ID_PATTERN.test(form.motorId.trim())) {
      return t("machines.motorIdHint");
    }
    if (!form.mccPanelId.trim() || !form.cabinetNumber.trim() || !form.lineZoneId.trim()) {
      return t("machines.validationRequired");
    }
    const kw = Number(form.nameplateKw);
    if (!Number.isFinite(kw) || kw <= 0) {
      return t("machines.validationPositive");
    }
    const rpm = Number(form.ratedRpm);
    if (!Number.isInteger(rpm) || rpm <= 0) {
      return t("machines.validationPositive");
    }
    if (!form.driveType) {
      return t("machines.validationRequired");
    }
    if (form.downtimeCostEtbPerHour.trim() !== "") {
      const cost = Number(form.downtimeCostEtbPerHour);
      if (!Number.isFinite(cost) || cost <= 0) {
        return t("machines.validationPositive");
      }
    }
    return null;
  }

  async function handleSubmit() {
    const error = validate();
    if (error) {
      setValidationError(error);
      return;
    }
    setValidationError(null);

    // The caller's own session token — the server function verifies it
    // and requires the admin role before touching the admin API.
    let sessionToken: string | null = null;
    try {
      const { data: sessionData } = await getSupabase().auth.getSession();
      sessionToken = sessionData.session?.access_token ?? null;
    } catch {
      sessionToken = null;
    }
    if (!sessionToken) {
      setValidationError(t("machines.registerNoSession"));
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/register-motor", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sessionToken}`,
        },
        body: JSON.stringify({
          motorId: form.motorId.trim(),
          mccPanelId: form.mccPanelId.trim(),
          cabinetNumber: form.cabinetNumber.trim(),
          lineZoneId: form.lineZoneId.trim(),
          nameplateKw: Number(form.nameplateKw),
          ratedRpm: Number(form.ratedRpm),
          driveType: form.driveType,
          assetTag: form.assetTag.trim(),
          bearingPartNumber: form.bearingPartNumber.trim(),
          spareCapacitorSpec: form.spareCapacitorSpec.trim(),
          downtimeCostEtbPerHour: form.downtimeCostEtbPerHour.trim()
            ? Number(form.downtimeCostEtbPerHour)
            : null,
        }),
      });

      if (response.status === 401) {
        setValidationError(t("machines.registerNoSession"));
        return;
      }
      if (!response.ok) {
        const detail = await response
          .json()
          .then((body) => (body && body.error ? body.error : null))
          .catch(() => null);
        toast({
          title: t("machines.registerFailedTitle"),
          description: detail ?? undefined,
          variant: "destructive",
        });
        return;
      }

      const result = await response.json().catch(() => ({}));
      toast({
        title: isEditing
          ? t("machines.editSuccessTitle")
          : t("machines.registerSuccessTitle"),
        description: (isEditing
          ? t("machines.editSuccessBody")
          : t("machines.registerSuccessBody")
        ).replace("{id}", result.motor_id ?? form.motorId.trim()),
      });
      setForm(EMPTY_FORM);
      onOpenChange(false);
      // The new motor has no telemetry yet, so the live overview will
      // not change — but the registry read must refresh immediately so
      // it appears as an "Awaiting telemetry" row right away.
      void queryClient.invalidateQueries({
        queryKey: ["sigmo-v2", "motor-assets"],
      });
    } catch {
      toast({
        title: t("machines.registerFailedTitle"),
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? t("machines.editTitle") : t("machines.registerTitle")}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? t("machines.editDesc")
              : t("machines.registerDesc")}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="motor-id">{t("machines.motorId")} *</Label>
            <Input
              id="motor-id"
              aria-label={t("machines.motorId")}
              placeholder="MTR-PROD-02"
              className="font-mono bg-card border-border"
              value={form.motorId}
              onChange={set("motorId")}
              readOnly={isEditing}
              disabled={isEditing}
            />
            <p className="text-xs text-muted-foreground">
              {isEditing
                ? t("machines.motorIdLocked")
                : t("machines.motorIdHint")}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="mcc-panel">{t("machines.mccPanel")} *</Label>
            <Input
              id="mcc-panel"
              aria-label={t("machines.mccPanel")}
              className="bg-card border-border"
              value={form.mccPanelId}
              onChange={set("mccPanelId")}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cabinet">{t("machines.cabinet")} *</Label>
            <Input
              id="cabinet"
              aria-label={t("machines.cabinet")}
              className="bg-card border-border"
              value={form.cabinetNumber}
              onChange={set("cabinetNumber")}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="line-zone">{t("machines.lineZone")} *</Label>
            <Input
              id="line-zone"
              aria-label={t("machines.lineZone")}
              className="bg-card border-border"
              value={form.lineZoneId}
              onChange={set("lineZoneId")}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="drive-type">{t("machines.driveType")} *</Label>
            <Select
              value={form.driveType}
              onValueChange={(value) =>
                setForm((current) => ({ ...current, driveType: value }))
              }
            >
              <SelectTrigger
                id="drive-type"
                aria-label={t("machines.driveType")}
                className="bg-card border-border"
              >
                <SelectValue placeholder={t("machines.driveType")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="DOL">{t("machines.driveDOL")}</SelectItem>
                <SelectItem value="SOFT_STARTER">
                  {t("machines.driveSoftStarter")}
                </SelectItem>
                <SelectItem value="VFD">{t("machines.driveVfd")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="nameplate-kw">{t("machines.nameplateKw")} *</Label>
            <Input
              id="nameplate-kw"
              aria-label={t("machines.nameplateKw")}
              type="number"
              min="0"
              step="0.1"
              inputMode="decimal"
              className="bg-card border-border"
              value={form.nameplateKw}
              onChange={set("nameplateKw")}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="rated-rpm">{t("machines.ratedRpm")} *</Label>
            <Input
              id="rated-rpm"
              aria-label={t("machines.ratedRpm")}
              type="number"
              min="0"
              step="1"
              inputMode="numeric"
              className="bg-card border-border"
              value={form.ratedRpm}
              onChange={set("ratedRpm")}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="asset-tag">{t("machines.assetTag")}</Label>
            <Input
              id="asset-tag"
              aria-label={t("machines.assetTag")}
              className="bg-card border-border"
              value={form.assetTag}
              onChange={set("assetTag")}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="bearing">{t("machines.bearing")}</Label>
            <Input
              id="bearing"
              aria-label={t("machines.bearing")}
              className="bg-card border-border"
              value={form.bearingPartNumber}
              onChange={set("bearingPartNumber")}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="spare-capacitor">{t("machines.spareCapacitor")}</Label>
            <Input
              id="spare-capacitor"
              aria-label={t("machines.spareCapacitor")}
              className="bg-card border-border"
              value={form.spareCapacitorSpec}
              onChange={set("spareCapacitorSpec")}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="downtime-cost">{t("machines.downtimeCost")}</Label>
            <Input
              id="downtime-cost"
              aria-label={t("machines.downtimeCost")}
              type="number"
              min="0"
              step="1"
              inputMode="decimal"
              className="bg-card border-border"
              value={form.downtimeCostEtbPerHour}
              onChange={set("downtimeCostEtbPerHour")}
            />
          </div>
        </div>

        <p className="text-xs text-muted-foreground">{t("machines.optionalHint")}</p>

        {validationError && (
          <p className="text-sm text-destructive" role="alert">
            {validationError}
          </p>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={isSubmitting}
            onClick={() => onOpenChange(false)}
          >
            {t("personnel.cancel")}
          </Button>
          <Button
            type="button"
            disabled={isSubmitting}
            onClick={() => void handleSubmit()}
            className="bg-primary font-semibold text-primary-foreground hover:bg-primary/90"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                {t("machines.registering")}
              </>
            ) : isEditing ? (
              t("machines.editCta")
            ) : (
              t("machines.registerCta")
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
