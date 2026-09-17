import type { UseAdminWorkspaceResult } from "@/hooks/useAdminWorkspace";
import type { AppRoute } from "@/routes/routes";
import { useT } from "@/i18n";

const pageKickers: Partial<Record<AppRoute, string>> = {
  "image-bed": "topbar.kickerImageBed",
};

export function AppTopbar({ workspace }: { workspace: UseAdminWorkspaceResult }) {
  const t = useT();
  const { activeRoute, activeRouteMeta, pageDescriptions } = workspace;
  const kickerKey = pageKickers[activeRoute];
  const kicker = kickerKey ? t(kickerKey) : activeRouteMeta.label;
  const heading = activeRoute === "launch" ? t("topbar.launchHeading") : activeRouteMeta.label;

  return (
    <header className="topbar">
      <div className="page-title">
        <span className="page-kicker">{kicker}</span>
        <h1>{heading}</h1>
        <p>{pageDescriptions[activeRoute]}</p>
      </div>
    </header>
  );
}
