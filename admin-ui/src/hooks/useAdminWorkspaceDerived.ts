import { useMemo } from "react";
import type { ProfileSummary } from "@/shared/types";
import { getPlanType, imageCapability, profileLabel } from "@/shared/lib/profiles";
import { routes, type AppRoute } from "@/routes/routes";
import type { WorkspaceState } from "./useAdminWorkspaceState";

export type WorkspaceDerived = {
  routes: typeof routes;
  activeRouteMeta: (typeof routes)[number];
  pageDescriptions: Record<AppRoute, string>;
  activeProfile: ProfileSummary | null;
  codexProfile: ProfileSummary | null;
  codexAccountId?: string;
  capability: { ok: boolean; detail: string };
  isLoading: boolean;
};

type DerivedSource = Pick<WorkspaceState, "config" | "activeRoute" | "showEmails" | "busy">;

export function useAdminWorkspaceDerived(state: DerivedSource): WorkspaceDerived {
  const activeProfile = state.config?.profile || null;
  const capability = imageCapability(activeProfile);
  const codexAccountId = state.config?.codex?.accountId;
  const codexProfile = useMemo(
    () => state.config?.profiles.find((profile) => codexAccountId && profile.accountId === codexAccountId) || null,
    [codexAccountId, state.config?.profiles],
  );

  const activeRouteMeta = routes.find((route) => route.id === state.activeRoute) || routes[0];
  const pageDescriptions: Record<AppRoute, string> = {
    launch: "面向桌面端的启动入口，聚合服务状态、快捷操作和产品视觉。",
    overview: activeProfile
      ? `当前账号为 ${profileLabel(activeProfile, state.showEmails)}，套餐 ${getPlanType(activeProfile)}，可查看网关状态和运行摘要。`
      : "还没有激活账号。你可以新增账号、导入账号 JSON，或先查看本地 API 信息。",
    accounts: "账号池、额度、套餐、Codex 应用状态集中管理，适合横向比较多个账号。",
    tester: "独立接口测试工作区，支持 Chat、Responses、Models 和 gpt-image-2 图片接口。",
    docs: "查看 AI-Zero-Token Skill.md，复制 Base URL、下载文档，并按步骤接入本地网关。",
    network: "单页总览 IPv4、IPv6、DNS、WebRTC、常用平台和版本状态。",
    logs: "查看本页快速测试产生的最近请求，包含接口、模型、状态和耗时。",
    settings: "调整本地网关、默认模型、代理和自动切换策略的桌面设置页。",
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
