import type { UseAdminWorkspaceResult } from "@/hooks/useAdminWorkspace";
import type { AppRoute } from "@/routes/routes";

const pageKickers: Partial<Record<AppRoute, string>> = {
  "image-bed": "个人工具",
};

export function AppTopbar({ workspace }: { workspace: UseAdminWorkspaceResult }) {
  const { activeRoute, activeRouteMeta, pageDescriptions } = workspace;

  return (
    <header className="topbar">
      <div className="page-title">
        <span className="page-kicker">{pageKickers[activeRoute] || activeRouteMeta.label}</span>
        <h1>{activeRoute === "launch" ? "启动页" : activeRouteMeta.label}</h1>
        <p>{pageDescriptions[activeRoute]}</p>
      </div>
    </header>
  );
}
