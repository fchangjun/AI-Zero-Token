import { BarChart3, BookOpenText, Boxes, Home, ImageUp, LayoutDashboard, ListChecks, Settings, ShieldCheck, Wifi, Wrench, type LucideIcon } from "lucide-react";
import { useT } from "@/i18n";

export type AppRoute = "launch" | "overview" | "accounts" | "providers" | "usage" | "tester" | "image-bed" | "tools" | "docs" | "network" | "logs" | "settings";

export type NavRoute = {
  id: AppRoute;
  label: string;
  icon: LucideIcon;
};

export function buildRoutes(t: (key: string) => string): NavRoute[] {
  return [
    { id: "launch", label: t("routes.launch"), icon: Home },
    { id: "overview", label: t("routes.overview"), icon: LayoutDashboard },
    { id: "providers", label: t("routes.providers"), icon: Boxes },
    { id: "usage", label: t("routes.usage"), icon: BarChart3 },
    { id: "tester", label: t("routes.tester"), icon: ShieldCheck },
    { id: "image-bed", label: t("routes.image-bed"), icon: ImageUp },
    { id: "tools", label: t("routes.tools"), icon: Wrench },
    { id: "docs", label: t("routes.docs"), icon: BookOpenText },
    { id: "network", label: t("routes.network"), icon: Wifi },
    { id: "logs", label: t("routes.logs"), icon: ListChecks },
    { id: "settings", label: t("routes.settings"), icon: Settings },
  ];
}

export function readRouteFromHash(): AppRoute {
  const value = window.location.hash.replace(/^#\/?/, "").split("/")[0];
  if (value === "accounts") return "providers";
  const supported: AppRoute[] = ["launch", "overview", "accounts", "providers", "usage", "tester", "image-bed", "tools", "docs", "network", "logs", "settings"];
  return supported.includes(value as AppRoute) ? (value as AppRoute) : "overview";
}

export function useNavRoutes() {
  const t = useT();
  return buildRoutes(t);
}
