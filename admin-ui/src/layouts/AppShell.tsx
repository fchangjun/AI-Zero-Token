import { AppSidebar } from "./AppSidebar";
import { AppTopbar } from "./AppTopbar";
import { AppOverlays } from "./AppOverlays";
import { RouteRenderer } from "./RouteRenderer";
import type { UseAdminWorkspaceResult } from "@/hooks/useAdminWorkspace";
import { useT } from "@/i18n";
import { Download, Package, Sparkles } from "lucide-react";

const DESKTOP_RELEASES_URL = "https://github.com/fchangjun/AI-Zero-Token/releases";
const NPM_UPDATE_COMMAND = "npm install -g ai-zero-token";

export function AppShell({ workspace }: { workspace: UseAdminWorkspaceResult }) {
  const t = useT();
  const versionStatus = workspace.config?.versionStatus;
  const desktopNeedsUpdate = versionStatus?.desktop.status === "update-available";
  const npmNeedsUpdate = versionStatus?.npm.status === "update-available";
  const updateTitle = desktopNeedsUpdate && npmNeedsUpdate
    ? t("update.titleBoth")
    : desktopNeedsUpdate
      ? t("update.titleDesktop")
      : t("update.titleNpm");
  const updateBody = desktopNeedsUpdate && npmNeedsUpdate
    ? t("update.bodyBoth", { command: NPM_UPDATE_COMMAND })
    : desktopNeedsUpdate
      ? t("update.bodyDesktop")
      : t("update.bodyNpm", { command: NPM_UPDATE_COMMAND });
  const versionSummary = [
    desktopNeedsUpdate ? `${t("update.desktopLabel")} ${versionStatus?.desktop.currentVersion} → ${versionStatus?.desktop.latestVersion}` : null,
    npmNeedsUpdate ? `${t("update.npmLabel")} ${versionStatus?.npm.currentVersion} → ${versionStatus?.npm.latestVersion}` : null,
  ].filter(Boolean).join(" · ");

  return (
    <div className="app-shell">
      <AppSidebar workspace={workspace} />

      <main className="main">
        {(desktopNeedsUpdate || npmNeedsUpdate) && (
          <section className="update-panel strong-update-panel">
            <div className="update-mark">
              <Sparkles size={18} />
            </div>
            <div className="update-copy">
              <div className="update-title-row">
                <strong>{updateTitle}</strong>
                <span>{versionSummary}</span>
              </div>
              <p>{updateBody}</p>
            </div>
            <div className="update-actions">
              {desktopNeedsUpdate && (
                <a className="btn-primary" href={versionStatus?.desktop.downloadUrl || versionStatus?.desktop.releaseUrl || DESKTOP_RELEASES_URL} target="_blank" rel="noreferrer">
                  <Download size={15} />
                  {t("update.desktopUpdate")}
                </a>
              )}
              {npmNeedsUpdate && (
                <button
                  className="btn-secondary"
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(NPM_UPDATE_COMMAND).then(
                      () => workspace.setStatus(t("update.copiedStatus")),
                      () => workspace.setStatus(NPM_UPDATE_COMMAND),
                    );
                  }}
                >
                  <Package size={15} />
                  {t("update.copyNpmCommand")}
                </button>
              )}
            </div>
          </section>
        )}
        <AppTopbar workspace={workspace} />
        <RouteRenderer workspace={workspace} />
      </main>

      <AppOverlays workspace={workspace} />
    </div>
  );
}
