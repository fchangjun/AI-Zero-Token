import type { UseAdminWorkspaceResult } from "@/hooks/useAdminWorkspace";

export function AppTopbar({ workspace }: { workspace: UseAdminWorkspaceResult }) {
  const { activeRoute, activeRouteMeta, pageDescriptions } = workspace;

  return (
    <header className="topbar">
      <div className="page-title">
        <span className="page-kicker">{activeRouteMeta.label}</span>
        <h1>{activeRoute === "launch" ? "启动页" : activeRouteMeta.label}</h1>
        <p>{pageDescriptions[activeRoute]}</p>
      </div>
    </header>
  );
}
