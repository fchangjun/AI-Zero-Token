import { Suspense, lazy } from "react";
import type { UseAdminWorkspaceResult } from "@/hooks/useAdminWorkspace";

const LaunchPage = lazy(() => import("@/pages/launch").then((module) => ({ default: module.LaunchPage })));
const OverviewPage = lazy(() => import("@/pages/overview").then((module) => ({ default: module.OverviewPage })));
const DocsPage = lazy(() => import("@/pages/docs").then((module) => ({ default: module.DocsPage })));
const AccountsPage = lazy(() => import("@/pages/accounts").then((module) => ({ default: module.AccountsPage })));
const TesterPage = lazy(() => import("@/pages/tester").then((module) => ({ default: module.TesterPage })));
const ImageBedPage = lazy(() => import("@/pages/image-bed").then((module) => ({ default: module.ImageBedPage })));
const NetworkDetectPage = lazy(() => import("@/pages/network-detect").then((module) => ({ default: module.NetworkDetectPage })));
const SettingsPage = lazy(() => import("@/pages/settings").then((module) => ({ default: module.SettingsPage })));
const LogsPage = lazy(() => import("@/pages/logs").then((module) => ({ default: module.LogsPage })));

function RouteLoading() {
  return (
    <section className="route-loading">
      <div className="route-loading-card">
        <div className="route-loading-bar" />
        <div>
          <strong>正在加载页面</strong>
          <p>请稍候。</p>
        </div>
      </div>
    </section>
  );
}

export function RouteRenderer({ workspace }: { workspace: UseAdminWorkspaceResult }) {
  const { activeRoute, busy, config, refreshConfig } = workspace;
  const page =
    activeRoute === "launch" ? (
      <LaunchPage
        config={config}
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
    ) : activeRoute === "image-bed" ? (
      <ImageBedPage busy={busy} setBusy={workspace.setBusy} setStatus={workspace.setStatus} />
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
  return <Suspense fallback={<RouteLoading />}>{page}</Suspense>;
}
