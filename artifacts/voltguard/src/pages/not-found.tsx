import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Compass, LayoutDashboard } from "lucide-react";
import { useI18n } from "@/i18n";
import { usePageTitle } from "@/lib/use-page-title";
import { ROUTES } from "@/lib/routes";

/**
 * 404 — rendered inside the app layout when no route matches.
 * Dark-surface design consistent with the rest of the shell, with a
 * way out: a primary return-to-dashboard action (a dead end with no
 * escape route is the worst kind of 404). Bilingual via i18n.
 */
export default function NotFound() {
  const { t } = useI18n();
  usePageTitle(t("notFound.title"));

  return (
    <div className="flex min-h-[60vh] w-full items-center justify-center animate-in fade-in slide-in-from-bottom-4 duration-500">
      <Card className="mx-4 w-full max-w-md border-border bg-card">
        <CardContent className="pt-6 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full border border-emerald-400/30 bg-emerald-400/10">
            <Compass className="h-7 w-7 text-emerald-300" aria-hidden="true" />
          </div>
          <div className="font-mono text-5xl font-bold tracking-tight text-white">404</div>
          <h1 className="mt-3 text-xl font-semibold text-foreground">
            {t("notFound.title")}
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {t("notFound.description")}
          </p>
          <Button
            asChild
            className="mt-6 w-full bg-primary font-semibold text-primary-foreground hover:bg-primary/90"
          >
            <Link href={ROUTES.dashboard} className="flex items-center justify-center gap-2">
              <LayoutDashboard className="h-4 w-4" aria-hidden="true" />
              {t("notFound.return")}
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
