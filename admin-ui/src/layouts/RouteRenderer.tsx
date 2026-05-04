import launchVisual from "@/assets/launch-visual.svg";
import { AccountsPage } from "@/pages/accounts";
import { LogsPage } from "@/pages/logs";
import { OverviewPage } from "@/pages/overview";
import { DocsPage } from "@/pages/docs";
import { NetworkDetectPage } from "@/pages/network-detect";
import { TesterPage } from "@/pages/tester";
import { LaunchPage } from "@/pages/launch";
import { SettingsPage } from "@/pages/settings";
import type { UseAdminWorkspaceResult } from "@/hooks/useAdminWorkspace";

export function RouteRenderer({ workspace }: { workspace: UseAdminWorkspaceResult }) {
  const { activeRoute, busy, config, refreshConfig } = workspace;
  const page =
    activeRoute === "launch" ? (
      <LaunchPage
        config={config}
        visualSrc={launchVisual}
        status={workspace.status}
        showEmails={workspace.showEmails}
        activeProfile={workspace.activeProfile}
        onRoute={workspace.goRoute}
      />
    ) : activeRoute === "overview" ? (
      <OverviewPage
        config={config}
        activeProfile={workspace.activeProfile}
        codexProfile={workspace.codexProfile}
        codexAccountId={workspace.codexAccountId}
        codexEmail={config?.codex?.email}
        showEmails={workspace.showEmails}
        requestLogs={workspace.requestLogs}
      />
    ) : activeRoute === "docs" ? (
      <DocsPage config={config} onRoute={workspace.goRoute} copyBaseUrl={workspace.copyBaseUrl} setStatus={workspace.setStatus} />
    ) : activeRoute === "accounts" ? (
      <AccountsPage
        config={config}
        showEmails={workspace.showEmails}
        busy={busy}
        activeProfile={workspace.activeProfile}
        codexAccountId={workspace.codexAccountId}
        setAccountModalOpen={workspace.setAccountModalOpen}
        setBusy={workspace.setBusy}
        setConfig={workspace.setConfig}
        setStatus={workspace.setStatus}
        refreshConfig={refreshConfig}
        logout={workspace.logout}
      />
    ) : activeRoute === "tester" ? (
      <TesterPage
        config={config}
        status={workspace.status}
        busy={busy}
        showEmails={workspace.showEmails}
        capability={workspace.capability}
        setBusy={workspace.setBusy}
        setStatus={workspace.setStatus}
        setRequestLogs={workspace.setRequestLogs}
        refreshConfig={refreshConfig}
        setPreviewImage={workspace.setPreviewImage}
      />
    ) : activeRoute === "network" ? (
      <NetworkDetectPage />
    ) : activeRoute === "settings" ? (
      <SettingsPage
        showEmails={workspace.showEmails}
        setShowEmails={workspace.setShowEmails}
        config={config}
        busy={busy}
        status={workspace.status}
        setBusy={workspace.setBusy}
        setConfig={workspace.setConfig}
        setStatus={workspace.setStatus}
        refreshConfig={refreshConfig}
      />
    ) : (
      <LogsPage logs={workspace.requestLogs} />
    );
  return page;
}
