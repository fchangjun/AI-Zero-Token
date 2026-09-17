import { useMemo } from "react";
import type { ProfileSummary } from "@/shared/types";
import { getPlanType, imageCapability, isCodexActiveProfile, profileLabel } from "@/shared/lib/profiles";
import { buildRoutes, type AppRoute, type NavRoute } from "@/routes/routes";
import { useT } from "@/i18n";
import type { WorkspaceState } from "./useAdminWorkspaceState";

export type WorkspaceDerived = {
  routes: NavRoute[];
  activeRouteMeta: NavRoute;
  pageDescriptions: Record<AppRoute, string>;
  activeProfile: ProfileSummary | null;
  codexProfile: ProfileSummary | null;
  codexAccountId?: string;
  capability: { ok: boolean; detail: string };
  isLoading: boolean;
};

type DerivedSource = Pick<WorkspaceState, "config" | "activeRoute" | "showEmails" | "busy">;

export function useAdminWorkspaceDerived(state: DerivedSource): WorkspaceDerived {
  const t = useT();
  const activeProfile = state.config?.profile || null;
  const capability = imageCapability(activeProfile, t);
  const codexAccountId = state.config?.codex?.accountId;
  const codexProfile = useMemo(
    () => state.config?.profiles.find((profile) => isCodexActiveProfile(profile, codexAccountId)) || null,
    [codexAccountId, state.config?.profiles],
  );

  const routes = useMemo(() => buildRoutes(t), [t]);
  const activeRouteMeta = routes.find((route) => route.id === state.activeRoute) || routes[0];
  const pageDescriptions: Record<AppRoute, string> = {
    launch: t("pageDescriptions.launch"),
    overview: activeProfile
      ? t("pageDescriptions.overviewActive", { profile: profileLabel(activeProfile, state.showEmails), plan: getPlanType(activeProfile) })
      : t("pageDescriptions.overviewEmpty"),
    accounts: t("pageDescriptions.accounts"),
    usage: t("pageDescriptions.usage"),
    tester: t("pageDescriptions.tester"),
    "image-bed": t("pageDescriptions.image-bed"),
    docs: t("pageDescriptions.docs"),
    network: t("pageDescriptions.network"),
    logs: t("pageDescriptions.logs"),
    settings: t("pageDescriptions.settings"),
  };

  return {
    routes,
    activeRouteMeta,
    pageDescriptions,
    activeProfile,
    codexProfile,
    codexAccountId,
    capability,
    isLoading: state.busy === "initial" && !state.config,
  };
}
