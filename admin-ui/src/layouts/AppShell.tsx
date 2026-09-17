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

  return (
    <div className="app-shell">
      <AppSidebar workspace={workspace} />

      <main className="main">
        {versionStatus?.status === "update-available" && (
          <section className="update-panel strong-update-panel">
            <div className="update-mark">
              <Sparkles size={18} />
            </div>
            <div className="update-copy">
              <div className="update-title-row">
                <strong>{t("update.title")}</strong>
                <span>{versionStatus.currentVersion} → {versionStatus.latestVersion}</span>
              </div>
              <p>
                {t("update.body", { command: NPM_UPDATE_COMMAND })}
              </p>
            </div>
            <div className="update-actions">
              <a className="btn-primary" href={DESKTOP_RELEASES_URL} target="_blank" rel="noreferrer">
                <Download size={15} />
                {t("update.desktopUpdate")}
              </a>
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
