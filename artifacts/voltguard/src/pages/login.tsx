import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import {
  Activity,
  AlertTriangle,
  Eye,
  EyeOff,
  Loader2,
  LogIn,
  ShieldAlert,
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
import { Label } from "@/components/ui/label";
import { useI18n } from "@/i18n";
import { useAuth, type AuthErrorCode } from "@/lib/auth-context";
import { usePageTitle } from "@/lib/use-page-title";
import { ROUTES } from "@/lib/routes";

/**
 * Login — the ONLY public page of the dashboard.
 *
 * Email + password, no registration, no password reset (accounts are
 * created exclusively by the administrator via Supabase invites).
 * Renders an honest configuration panel when the Supabase env vars
 * are missing, and bounces straight to the dashboard when a valid
 * session already exists.
 */
export function Login() {
  const { t, language, setLanguage } = useI18n();
  const { configured, ready, session, signIn } = useAuth();
  const [, navigate] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [pending, setPending] = useState(false);
  const [errorCode, setErrorCode] = useState<AuthErrorCode | null>(null);

  usePageTitle(t("auth.signInTitle"));

  // Already signed in → straight to the dashboard.
  useEffect(() => {
    if (ready && session) {
      navigate(ROUTES.dashboard, { replace: true });
    }
  }, [ready, session, navigate]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (pending || !email.trim() || !password) return;
    setPending(true);
    setErrorCode(null);
    const code = await signIn(email.trim(), password);
    setPending(false);
    if (code) {
      setErrorCode(code);
      return;
    }
    // Success: the session lands in the auth context and the effect
    // above navigates to the dashboard.
  };

  const errorText =
    errorCode === "invalid_credentials"
      ? t("auth.invalidCredentials")
      : errorCode === "email_not_confirmed"
        ? t("auth.emailNotConfirmed")
        : errorCode === "network"
          ? t("auth.networkError")
          : errorCode
            ? t("auth.unknownError")
            : null;

  const canSubmit = email.trim().length > 3 && password.length > 0 && !pending;

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-background p-4">
      {/* Ambient glow — consistent with the dashboard's dark theme */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(26,214,104,0.08),transparent_60%)]"
      />

      {/* Language toggle */}
      <div className="absolute right-4 top-4 flex items-center gap-1 rounded-full border border-border bg-black/40 px-1 py-1">
        {(["en", "am"] as const).map((code) => (
          <button
            key={code}
            type="button"
            onClick={() => setLanguage(code)}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
              language === code
                ? "bg-emerald-400/15 text-emerald-300"
                : "text-muted-foreground hover:text-foreground"
            }`}
            aria-pressed={language === code}
          >
            {code === "en" ? "EN" : "አማ"}
          </button>
        ))}
      </div>

      <Card className="w-full max-w-md border-border bg-card shadow-2xl">
        <CardHeader className="pb-4">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl border border-primary/30 bg-primary/10">
            <Activity className="h-6 w-6 text-primary" aria-hidden="true" />
          </div>
          <CardTitle className="text-2xl font-bold tracking-tight text-foreground">
            {t("auth.signInTitle")}
          </CardTitle>
          <CardDescription>{t("auth.subtitle")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Auth not configured — honest state, mirrors the AI card */}
          {!configured ? (
            <div className="flex flex-col gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4">
              <div className="flex items-start gap-3">
                <ShieldAlert
                  className="mt-0.5 h-5 w-5 shrink-0 text-amber-300"
                  aria-hidden="true"
                />
                <div>
                  <p className="text-sm font-semibold text-amber-100">
                    {t("auth.notConfiguredTitle")}
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-amber-100/80">
                    {t("auth.notConfiguredBody")}
                  </p>
                  <code className="mt-2 block w-fit rounded bg-black/40 px-2 py-1 font-mono text-[11px] text-amber-200">
                    VITE_SUPABASE_URL · VITE_SUPABASE_ANON_KEY
                  </code>
                </div>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              {errorText ? (
                <div
                  role="alert"
                  className="flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/10 p-3"
                >
                  <AlertTriangle
                    className="mt-0.5 h-4 w-4 shrink-0 text-destructive"
                    aria-hidden="true"
                  />
                  <p className="text-sm text-destructive">{errorText}</p>
                </div>
              ) : null}

              <div className="space-y-2">
                <Label htmlFor="login-email">{t("auth.email")}</Label>
                <Input
                  id="login-email"
                  type="email"
                  autoComplete="email"
                  autoFocus
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="name@company.com"
                  className="border-border bg-background"
                  aria-invalid={errorCode === "invalid_credentials"}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="login-password">{t("auth.password")}</Label>
                <div className="relative">
                  <Input
                    id="login-password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className="border-border bg-background pr-10"
                    aria-invalid={errorCode === "invalid_credentials"}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((value) => !value)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground transition-colors hover:text-foreground"
                    aria-label={t("auth.togglePassword")}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" aria-hidden="true" />
                    ) : (
                      <Eye className="h-4 w-4" aria-hidden="true" />
                    )}
                  </button>
                </div>
              </div>

              <Button
                type="submit"
                disabled={!canSubmit}
                className="w-full bg-primary font-semibold text-primary-foreground hover:bg-primary/90"
              >
                {pending ? (
                  <>
                    <Loader2
                      className="mr-2 h-4 w-4 animate-spin"
                      aria-hidden="true"
                    />
                    {t("auth.signingIn")}
                  </>
                ) : (
                  <>
                    <LogIn className="mr-2 h-4 w-4" aria-hidden="true" />
                    {t("auth.signInButton")}
                  </>
                )}
              </Button>
            </form>
          )}

          <p className="text-center text-xs leading-relaxed text-muted-foreground">
            {t("auth.inviteNote")}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
