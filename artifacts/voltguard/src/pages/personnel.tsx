import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  Edit2,
  HardHat,
  Mail,
  MailPlus,
  Phone,
  Plus,
  Search,
  Trash2,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ApiErrorState } from "@/components/api-error-state";
import { useI18n } from "@/i18n";
import { usePageTitle } from "@/lib/use-page-title";
import { getSupabase, isSupabaseAuthConfigured } from "@/lib/supabase-client";
import { useAuth } from "@/lib/auth-context";
import {
  inviteTechnician,
  InviteError,
  type InviteErrorCode,
} from "@/lib/sigmo-api";

/**
 * Personnel — the technician directory, stored in the project's
 * Supabase database (public.personnel). This is an Admin-only function:
 * public.user_roles is enforced by the route, Supabase RLS, and mutation
 * controls. Executive/Technician is only an Admin view preference and never
 * grants or removes Personnel permissions.
 */

interface TechnicianRecord {
  id: string;
  full_name: string;
  specialty: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  created_at: string;
}

const EMPTY_DRAFT = {
  full_name: "",
  specialty: "",
  phone: "",
  email: "",
  notes: "",
};

export function Personnel() {
  const { t } = useI18n();
  const { session, dbRole } = useAuth();
  const isAdmin = dbRole === "admin";
  usePageTitle(t("personnel.title"));

  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<TechnicianRecord | null>(
    null,
  );
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isBulkDialogOpen, setIsBulkDialogOpen] = useState(false);

  // ---- Invite Technician (login account) — admin-only, sends a
  // Supabase invitation email via the backend; the technician sets
  // their own password. New accounts default to the Technician role. */
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [isInviting, setIsInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  // Defense in depth: route and RLS already require Admin, while every
  // management affordance below also keys off the database-backed role.
  // View mode is deliberately irrelevant.
  useEffect(() => {
    if (!isAdmin) {
      setSelectedIds(new Set());
      setIsBulkDialogOpen(false);
    }
  }, [isAdmin]);
  const [draft, setDraft] = useState(EMPTY_DRAFT);

  const personnelQuery = useQuery({
    queryKey: ["supabase", "personnel"],
    queryFn: async (): Promise<TechnicianRecord[]> => {
      const { data, error } = await getSupabase()
        .from("personnel")
        .select("*")
        .order("full_name");
      if (error) throw error;
      return (data ?? []) as TechnicianRecord[];
    },
    enabled: isSupabaseAuthConfigured,
    refetchInterval: 60000,
  });

  const technicians = useMemo(() => {
    const list = personnelQuery.data ?? [];
    const term = searchTerm.trim().toLowerCase();
    if (!term) return list;
    return list.filter((person) =>
      [person.full_name, person.specialty, person.email, person.phone]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term)),
    );
  }, [personnelQuery.data, searchTerm]);

  // ---- Bulk selection (over the visible / filtered list) ----
  const visibleIds = technicians.map((person) => person.id);
  const allSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));
  const someSelected = selectedIds.size > 0 && !allSelected;

  const toggleSelected = (id: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (allSelected) visibleIds.forEach((id) => next.delete(id));
      else visibleIds.forEach((id) => next.add(id));
      return next;
    });
  };

  const nameError =
    isFormOpen && draft.full_name.trim() === "" ? t("personnel.errName") : null;

  const handleOpenCreate = () => {
    setEditingId(null);
    setDraft(EMPTY_DRAFT);
    setIsFormOpen(true);
  };

  const handleOpenEdit = (person: TechnicianRecord) => {
    setEditingId(person.id);
    setDraft({
      full_name: person.full_name,
      specialty: person.specialty ?? "",
      phone: person.phone ?? "",
      email: person.email ?? "",
      notes: person.notes ?? "",
    });
    setIsFormOpen(true);
  };

  const handleSave = async () => {
    if (draft.full_name.trim() === "" || isSaving) return;
    setIsSaving(true);
    try {
      const payload = {
        full_name: draft.full_name.trim(),
        specialty: draft.specialty.trim() || null,
        phone: draft.phone.trim() || null,
        email: draft.email.trim() || null,
        notes: draft.notes.trim() || null,
      };
      const supabase = getSupabase();
      const { error } = editingId
        ? await supabase
            .from("personnel")
            .update(payload)
            .eq("id", editingId)
        : await supabase.from("personnel").insert(payload);
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ["supabase", "personnel"] });
      setIsFormOpen(false);
      toast({
        title: editingId ? t("personnel.updatedTitle") : t("personnel.addedTitle"),
        description: draft.full_name.trim(),
      });
    } catch (error) {
      toast({
        title: t("personnel.saveFailed"),
        description:
          error instanceof Error ? error.message : t("personnel.saveFailed"),
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget || isSaving) return;
    setIsSaving(true);
    try {
      const { error } = await getSupabase()
        .from("personnel")
        .delete()
        .eq("id", deleteTarget.id);
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ["supabase", "personnel"] });
      toast({
        title: t("personnel.deletedTitle"),
        description: deleteTarget.full_name,
      });
      setDeleteTarget(null);
    } catch (error) {
      toast({
        title: t("personnel.saveFailed"),
        description:
          error instanceof Error ? error.message : t("personnel.saveFailed"),
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleBulkDelete = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0 || isSaving) return;
    setIsSaving(true);
    try {
      const results = await Promise.allSettled(
        ids.map((id) => getSupabase().from("personnel").delete().eq("id", id)),
      );
      let failed = 0;
      for (const result of results) {
        if (result.status === "rejected" || result.value.error) failed += 1;
      }
      await queryClient.invalidateQueries({ queryKey: ["supabase", "personnel"] });
      setSelectedIds(new Set());
      setIsBulkDialogOpen(false);
      toast({
        title:
          failed > 0
            ? t("personnel.bulkPartialTitle")
            : t("personnel.deletedTitle"),
        description:
          failed > 0
            ? `${ids.length - failed} ✓ · ${failed} ✗`
            : t("personnel.bulkDeletedBody").replace(
                "{count}",
                String(ids.length),
              ),
        variant: failed > 0 ? "destructive" : undefined,
      });
    } catch (error) {
      toast({
        title: t("personnel.saveFailed"),
        description:
          error instanceof Error ? error.message : t("personnel.saveFailed"),
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const inviteMessageFor = (code: InviteErrorCode): string => {
    switch (code) {
      case "invalid_email":
        return t("personnel.inviteErrEmail");
      case "already_registered":
        return t("personnel.inviteErrAlready");
      case "email_rate_limited":
        return t("personnel.inviteErrRate");
      case "invite_not_configured":
        return t("personnel.inviteErrConfig");
      case "not_admin":
        return t("personnel.inviteErrForbidden");
      case "missing_session":
      case "invalid_session":
        return t("personnel.inviteErrSession");
      case "network":
      case "supabase_unreachable":
        return t("personnel.inviteErrNetwork");
      default:
        return t("personnel.inviteErrUnknown");
    }
  };

  const handleInvite = async () => {
    const email = inviteEmail.trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      setInviteError(t("personnel.inviteErrEmail"));
      return;
    }
    const token = session?.access_token;
    if (!token) {
      setInviteError(t("personnel.inviteErrSession"));
      return;
    }
    setIsInviting(true);
    setInviteError(null);
    try {
      const result = await inviteTechnician(email, token);
      toast({
        title:
          result.status === "resent"
            ? t("personnel.inviteResentTitle")
            : t("personnel.inviteSuccessTitle"),
        description: t("personnel.inviteSuccessBody").replace(
          "{email}",
          result.email,
        ),
      });
      setIsInviteOpen(false);
      setInviteEmail("");
    } catch (error) {
      const code = error instanceof InviteError ? error.code : "unknown";
      setInviteError(inviteMessageFor(code));
    } finally {
      setIsInviting(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 h-full animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-3">
            <Users className="h-8 w-8 text-emerald-300" />
            {t("personnel.title")}
          </h1>
          <p className="text-muted-foreground mt-2">{t("personnel.subtitle")}</p>
        </div>
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-[240px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={t("personnel.search")}
              className="pl-9 bg-card border-border"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          {isAdmin && selectedIds.size > 0 ? (
            <Button
              variant="destructive"
              size="sm"
              className="h-9 gap-1.5 font-semibold"
              onClick={() => setIsBulkDialogOpen(true)}
              disabled={isSaving}
              title={t("personnel.bulkDeleteTitle")}
              aria-label={t("personnel.bulkDeleteTitle")}
            >
              <Trash2 className="h-4 w-4" />
              {selectedIds.size}
            </Button>
          ) : null}
          {isAdmin ? (
            <Button
              onClick={() => {
                setIsInviteOpen(true);
                setInviteError(null);
              }}
              variant="ghost"
              className="h-10 shrink-0 border border-primary bg-primary/20 font-semibold text-emerald-200 shadow-[0_0_12px_rgba(26,214,104,0.25)] hover:border-primary hover:bg-primary/30"
              title={t("personnel.inviteTitle")}
            >
              <MailPlus className="h-4 w-4 mr-2" />
              <span className="hidden sm:inline">{t("personnel.invite")}</span>
            </Button>
          ) : null}
          {isAdmin ? (
            <Button
              onClick={handleOpenCreate}
              className="bg-primary text-primary-foreground hover:bg-primary/90 font-semibold shadow-[0_0_15px_rgba(26,214,104,0.3)]"
            >
              <Plus className="h-4 w-4 mr-2" />
              {t("personnel.add")}
            </Button>
          ) : null}
        </div>
      </div>

      {/* List */}
      <Card className="border-border bg-card overflow-hidden shadow-lg flex-1 min-h-0 flex flex-col">
        <CardHeader className="border-b border-border/50 pb-3">
          <CardTitle className="flex flex-wrap items-center gap-2 text-base">
            <HardHat className="h-4 w-4 text-emerald-300" />
            {t("personnel.listTitle")}
            {isAdmin ? (
              <label className="ml-1 flex cursor-pointer items-center gap-1.5 text-xs font-normal text-muted-foreground">
                <Checkbox
                  checked={allSelected ? true : someSelected ? "indeterminate" : false}
                  onCheckedChange={toggleSelectAll}
                  aria-label={t("personnel.selectAll")}
                  disabled={visibleIds.length === 0}
                />
                {t("personnel.selectAll")}
              </label>
            ) : (
              <Badge
                variant="outline"
                className="border-border bg-card text-xs font-normal text-muted-foreground"
              >
                {t("personnel.readonlyBadge")}
              </Badge>
            )}
            {personnelQuery.data ? (
              <Badge variant="outline" className="ml-auto font-mono text-[10px] text-emerald-300 border-emerald-400/40">
                {personnelQuery.data.length} {t("personnel.countUnit")}
              </Badge>
            ) : null}
          </CardTitle>
          <CardDescription>{t("personnel.listDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="p-0 flex-1 overflow-auto">
          {!isSupabaseAuthConfigured ? (
            <div className="p-6">
              <ApiErrorState message={t("personnel.errNotConfigured")} />
            </div>
          ) : personnelQuery.isLoading ? (
            <div className="p-6 space-y-4">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : personnelQuery.isError ? (
            <div className="p-6">
              <ApiErrorState
                message={
                  personnelQuery.error instanceof Error
                    ? personnelQuery.error.message
                    : undefined
                }
              />
            </div>
          ) : technicians.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-10 text-center">
              <div className="rounded-full border border-border/60 bg-black/20 p-3">
                <HardHat className="h-6 w-6 text-emerald-300 opacity-80" />
              </div>
              <p className="mt-3 text-sm font-medium text-foreground">
                {searchTerm.trim()
                  ? t("personnel.emptySearchTitle")
                  : t("personnel.emptyTitle")}
              </p>
              <p className="mt-1 max-w-md text-xs text-muted-foreground">
                {searchTerm.trim()
                  ? t("personnel.emptySearchBody")
                  : t("personnel.emptyBody")}
              </p>
              {!searchTerm.trim() && isAdmin ? (
                <Button
                  onClick={handleOpenCreate}
                  variant="outline"
                  className="mt-4 border-emerald-400/40 text-emerald-200 hover:bg-emerald-400/15"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  {t("personnel.add")}
                </Button>
              ) : null}
            </div>
          ) : (
            <div className="divide-y divide-border/50">
              {technicians.map((person) => (
                <div
                  key={person.id}
                  className="flex items-center gap-4 p-4 transition-colors hover:bg-muted/30"
                >
                  {isAdmin ? (
                    <Checkbox
                      checked={selectedIds.has(person.id)}
                      onCheckedChange={() => toggleSelected(person.id)}
                      aria-label={t("personnel.selectOne").replace(
                        "{name}",
                        person.full_name,
                      )}
                      className="shrink-0"
                    />
                  ) : null}
                  <Avatar className="h-10 w-10 shrink-0">
                    <AvatarFallback className="bg-emerald-400/15 text-sm font-bold text-emerald-200">
                      {person.full_name.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-foreground">
                        {person.full_name}
                      </span>
                      {person.specialty ? (
                        <Badge
                          variant="outline"
                          className="border-emerald-400/40 bg-emerald-400/15 text-emerald-200"
                        >
                          {person.specialty}
                        </Badge>
                      ) : null}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      {person.phone ? (
                        <span className="flex items-center gap-1.5">
                          <Phone className="h-3 w-3" />
                          {person.phone}
                        </span>
                      ) : null}
                      {person.email ? (
                        <span className="flex items-center gap-1.5">
                          <Mail className="h-3 w-3" />
                          {person.email}
                        </span>
                      ) : null}
                      {person.notes ? (
                        <span className="max-w-xs truncate">· {person.notes}</span>
                      ) : null}
                    </div>
                  </div>
                  {/* Management actions — Executive (admin) only. In
                      Technician mode this is a read-only directory. */}
                  {isAdmin ? (
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => handleOpenEdit(person)}
                        aria-label={t("personnel.edit")}
                        title={t("personnel.edit")}
                      >
                        <Edit2 className="h-4 w-4 text-muted-foreground" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 hover:bg-destructive/10"
                        onClick={() => setDeleteTarget(person)}
                        aria-label={t("personnel.remove")}
                        title={t("personnel.remove")}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add / Edit dialog */}
      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent className="sm:max-w-[480px] bg-card border-border">
          <DialogHeader>
            <DialogTitle>
              {editingId ? t("personnel.editTitle") : t("personnel.addTitle")}
            </DialogTitle>
            <DialogDescription>{t("personnel.formDesc")}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="personnel-name" className={nameError ? "text-destructive" : undefined}>
                {t("personnel.name")} *
              </Label>
              <Input
                id="personnel-name"
                value={draft.full_name}
                autoFocus
                onChange={(e) => setDraft({ ...draft, full_name: e.target.value })}
                aria-invalid={Boolean(nameError)}
                className="bg-background border-border aria-invalid:border-destructive"
                placeholder={t("personnel.namePlaceholder")}
              />
              {nameError ? (
                <p className="text-[11px] font-medium text-destructive" role="alert">
                  {nameError}
                </p>
              ) : null}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label htmlFor="personnel-specialty">{t("personnel.specialty")}</Label>
                <Input
                  id="personnel-specialty"
                  value={draft.specialty}
                  onChange={(e) => setDraft({ ...draft, specialty: e.target.value })}
                  className="bg-background border-border"
                  placeholder={t("personnel.specialtyPlaceholder")}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="personnel-phone">{t("personnel.phone")}</Label>
                <Input
                  id="personnel-phone"
                  value={draft.phone}
                  onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
                  className="bg-background border-border"
                  placeholder="+251 9.. .. .. .."
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="personnel-email">{t("personnel.email")}</Label>
              <Input
                id="personnel-email"
                type="email"
                value={draft.email}
                onChange={(e) => setDraft({ ...draft, email: e.target.value })}
                className="bg-background border-border"
                placeholder="name@company.com"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="personnel-notes">{t("personnel.notes")}</Label>
              <Input
                id="personnel-notes"
                value={draft.notes}
                onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                className="bg-background border-border"
                placeholder={t("personnel.notesPlaceholder")}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsFormOpen(false)}
              className="border-border"
            >
              {t("personnel.cancel")}
            </Button>
            <Button
              onClick={handleSave}
              disabled={isSaving || draft.full_name.trim() === ""}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {isSaving ? t("personnel.saving") : t("personnel.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Invite Technician (login account) dialog — admin only */}
      <Dialog
        open={isInviteOpen}
        onOpenChange={(open) => {
          setIsInviteOpen(open);
          if (!open) setInviteError(null);
        }}
      >
        <DialogContent className="sm:max-w-[460px] bg-card border-border">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MailPlus className="h-4 w-4 text-primary" />
              {t("personnel.inviteTitle")}
            </DialogTitle>
            <DialogDescription>{t("personnel.inviteDesc")}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 py-2">
            <Label
              htmlFor="personnel-invite-email"
              className={inviteError ? "text-destructive" : undefined}
            >
              {t("personnel.email")} *
            </Label>
            <Input
              id="personnel-invite-email"
              type="email"
              inputMode="email"
              autoFocus
              value={inviteEmail}
              onChange={(e) => {
                setInviteEmail(e.target.value);
                setInviteError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !isInviting) void handleInvite();
              }}
              aria-invalid={Boolean(inviteError)}
              className="bg-background border-border aria-invalid:border-destructive"
              placeholder={t("personnel.inviteEmailPlaceholder")}
            />
            {inviteError ? (
              <p className="text-[11px] font-medium text-destructive" role="alert">
                {inviteError}
              </p>
            ) : (
              <p className="text-[11px] text-muted-foreground">
                {t("personnel.inviteNote")}
              </p>
            )}
          </div>
          <DialogFooter className="mt-2">
            <Button
              variant="outline"
              onClick={() => setIsInviteOpen(false)}
              className="border-border"
              disabled={isInviting}
            >
              {t("personnel.cancel")}
            </Button>
            <Button
              onClick={handleInvite}
              disabled={isInviting || inviteEmail.trim() === ""}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {isInviting ? t("personnel.inviting") : t("personnel.inviteCta")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-[425px] bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-destructive">
              {t("personnel.deleteTitle")}
            </DialogTitle>
            <DialogDescription>
              {t("personnel.deleteBody").replace("{name}", deleteTarget?.full_name ?? "")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-2">
            <Button
              variant="outline"
              onClick={() => setDeleteTarget(null)}
              className="border-border"
            >
              {t("personnel.cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={isSaving}
            >
              {isSaving ? t("personnel.saving") : t("personnel.deleteCta")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk delete confirm */}
      <Dialog open={isBulkDialogOpen} onOpenChange={setIsBulkDialogOpen}>
        <DialogContent className="sm:max-w-[425px] bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-destructive">
              {t("personnel.bulkDeleteTitle")}
            </DialogTitle>
            <DialogDescription>
              {t("personnel.bulkDeleteBody").replace(
                "{count}",
                String(selectedIds.size),
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-2">
            <Button
              variant="outline"
              onClick={() => setIsBulkDialogOpen(false)}
              className="border-border"
            >
              {t("personnel.cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={handleBulkDelete}
              disabled={isSaving || selectedIds.size === 0}
            >
              {isSaving
                ? t("personnel.saving")
                : t("personnel.bulkDeleteCta")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Honest footer note */}
      <p className="flex items-start gap-2 text-[11px] text-muted-foreground">
        <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0" />
        {isAdmin
          ? t("personnel.footerNote")
          : t("personnel.readonlyNote")}
      </p>
    </div>
  );
}
