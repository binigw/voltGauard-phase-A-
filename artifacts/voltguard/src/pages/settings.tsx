import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Activity, Globe, LogOut, Server, ShieldCheck, User } from "lucide-react";
import { useI18n } from "@/i18n";
import { usePageTitle } from "@/lib/use-page-title";
import { useAuth } from "@/lib/auth-context";
import { fetchV2Health } from "@/lib/sigmo-api";

/**
 * Settings — honest, read-only account & system information.
 *
 * The previous version embedded a push-notifications panel wired to
 * legacy /api/notifications* and /api/personnel endpoints that do not
 * exist on the V2 backend (every request 404'd), so the panel could
 * never function. It was removed rather than translated. What remains
 * is real: the signed-in Supabase account, the server-assigned role,
 * the interface language, and live backend health from /api/v2/health.
 */
export function Settings() {
  const { t, language, setLanguage } = useI18n();
  const { user, dbRole, signOut } = useAuth();
  usePageTitle(t("settings.title"));

  const healthQuery = useQuery({
    queryKey: ["sigmo-v2", "health"],
    queryFn: ({ signal }) => fetchV2Health(signal),
    refetchInterval: 30000,
  });

  const userEmail = user?.email ?? t("role.profile");
  const initials = userEmail.slice(0, 2).toUpperCase();
  const health = healthQuery.data ?? null;

  return (
    <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t("settings.title")}</h1>
        <p className="text-muted-foreground mt-2">{t("settings.subtitle")}</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Account */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <User className="h-5 w-5 text-primary" aria-hidden="true" />
              <CardTitle>{t("settings.account")}</CardTitle>
            </div>
            <CardDescription>{t("settings.accountDesc")}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <Avatar className="h-11 w-11">
                <AvatarFallback className="bg-emerald-400/15 text-sm font-bold text-emerald-300">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-foreground" title={userEmail}>
                  {userEmail}
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground">{t("settings.email")}</div>
              </div>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <div className="flex items-center gap-2 text-sm">
                <ShieldCheck className="h-4 w-4 text-emerald-300" aria-hidden="true" />
                {t("settings.serverRole")}
              </div>
              <Badge
                variant="outline"
                className={
                  dbRole === "admin"
                    ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-300"
                    : "border-border bg-card text-muted-foreground"
                }
              >
                {dbRole === "admin"
                  ? t("settings.roleAdmin")
                  : t("settings.roleTechnician")}
              </Badge>
            </div>
            <Button
              type="button"
              variant="outline"
              className="w-full sm:w-auto border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => {
                void signOut();
              }}
            >
              <LogOut className="mr-2 h-4 w-4" aria-hidden="true" />
              {t("settings.signOut")}
            </Button>
          </CardContent>
        </Card>

        {/* Language */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Globe className="h-5 w-5 text-primary" aria-hidden="true" />
              <CardTitle>{t("settings.languageTitle")}</CardTitle>
            </div>
            <CardDescription>{t("settings.languageDesc")}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            {(["en", "am"] as const).map((code) => (
              <button
                key={code}
                type="button"
                onClick={() => setLanguage(code)}
                aria-pressed={language === code}
                className={`rounded-full px-5 py-2 text-sm font-semibold transition-colors ${
                  language === code
                    ? "bg-emerald-400/15 text-emerald-300"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {code === "en" ? t("language.english") : t("language.amharic")}
              </button>
            ))}
          </CardContent>
        </Card>

        {/* System status — read-only, live from /api/v2/health */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Server className="h-5 w-5 text-primary" aria-hidden="true" />
              <CardTitle>{t("settings.systemTitle")}</CardTitle>
            </div>
            <CardDescription>{t("settings.systemDesc")}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <SummaryRow
                icon={<Activity className="h-4 w-4" aria-hidden="true" />}
                label={t("settings.backendService")}
                value={
                  healthQuery.isLoading
                    ? t("settings.checking")
                    : health
                      ? t("settings.online")
                      : t("settings.offline")
                }
                ok={health != null}
              />
              <SummaryRow
                icon={<Server className="h-4 w-4" aria-hidden="true" />}
                label={t("reports.rowDbConnected")}
                value={
                  healthQuery.isLoading
                    ? t("settings.checking")
                    : health == null
                      ? "—"
                      : health.database_connected
                        ? t("reports.dbConnected")
                        : t("reports.dbDisconnected")
                }
                ok={health?.database_connected === true}
              />
              <SummaryRow
                icon={<Activity className="h-4 w-4" aria-hidden="true" />}
                label={t("reports.rowStreaming")}
                value={
                  healthQuery.isLoading
                    ? t("settings.checking")
                    : health == null || health.motors_streaming == null
                      ? "—"
                      : String(health.motors_streaming)
                }
                ok={(health?.motors_streaming ?? 0) > 0}
              />
            </div>
            <p className="text-xs text-muted-foreground">{t("settings.readonlyNote")}</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center justify-center rounded-lg border border-dashed border-border bg-card/50 p-6 text-center">
        <div className="max-w-md">
          <h2 className="text-base font-semibold">{t("settings.comingSoon")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("settings.comingSoonDescription")}</p>
        </div>
      </div>
    </div>
  );
}

function SummaryRow({
  icon,
  label,
  value,
  ok,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  ok: boolean;
}) {
  return (
    <div className="rounded-md border border-border/60 bg-black/20 p-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {icon}
        {label}
      </div>
      <div
        className={`mt-1 font-mono text-sm font-semibold ${
          ok ? "text-emerald-300" : "text-foreground"
        }`}
      >
        {value}
      </div>
    </div>
  );
}
