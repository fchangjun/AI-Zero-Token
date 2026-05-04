import { useCallback } from "react";
import { fetchJson } from "@/shared/api";
import type { AdminConfig } from "@/shared/types";
import { errorMessage } from "@/shared/lib/app-utils";
import type { AppRoute } from "@/routes/routes";
import type { WorkspaceState } from "./useAdminWorkspaceState";

export type WorkspaceActions = {
  login: () => Promise<void>;
  logout: () => Promise<void>;
  goRoute: (route: AppRoute) => void;
  copyBaseUrl: () => void;
};

export function useAdminWorkspaceActions(state: WorkspaceState): WorkspaceActions {
  const login = useCallback(async () => {
    state.setBusy("login");
    state.setStatus("正在打开 OAuth 登录...");
    try {
      const next = await fetchJson<AdminConfig>("/_gateway/admin/login", { method: "POST" });
      state.setConfig(next);
      state.setAccountModalOpen(false);
      state.setStatus("登录完成，账号状态已同步。");
    } catch (error) {
      state.setStatus(errorMessage(error));
    } finally {
      state.setBusy(null);
    }
  }, [state]);

  const logout = useCallback(async () => {
    if (!window.confirm("确认清空本地保存的所有账号？")) {
      return;
    }
    state.setBusy("logout");
    state.setStatus("正在清空账号...");
    try {
      const next = await fetchJson<AdminConfig>("/_gateway/admin/logout", { method: "POST" });
      state.setConfig(next);
      state.setRequestLogs([]);
      state.setStatus("账号已清空。");
    } catch (error) {
      state.setStatus(errorMessage(error));
    } finally {
      state.setBusy(null);
    }
  }, [state]);

  const goRoute = useCallback((route: AppRoute) => {
    const nextHash = `#${route}`;
    state.setActiveRoute(route);
    if (window.location.hash !== nextHash) {
      window.location.hash = route;
    }
  }, [state]);

  const copyBaseUrl = useCallback(() => {
    const value = state.config?.baseUrl || "http://127.0.0.1:8787/v1";
    navigator.clipboard.writeText(value).then(
      () => state.setStatus("Base URL 已复制。"),
      () => state.setStatus(value),
    );
  }, [state]);

  return {
    login,
    logout,
    goRoute,
    copyBaseUrl,
  };
}
