import { startTransition, useCallback } from "react";
import { fetchJson } from "@/shared/api";
import type { AdminConfig } from "@/shared/types";
import { errorMessage } from "@/shared/lib/app-utils";
import type { AppRoute } from "@/routes/routes";
import type { WorkspaceState } from "./useAdminWorkspaceState";
import { useT } from "@/i18n";

export type WorkspaceActions = {
  login: () => Promise<void>;
  submitManualLogin: (input: string) => Promise<void>;
  cancelManualLogin: () => Promise<void>;
  logout: () => Promise<void>;
  goRoute: (route: AppRoute) => void;
  copyBaseUrl: () => void;
};

type ManualLoginResult = {
  login: {
    status: "manual_required";
    loginId: string;
    message: string;
  };
  config: AdminConfig;
};

function isManualLoginResult(value: AdminConfig | ManualLoginResult): value is ManualLoginResult {
  return "login" in value && value.login.status === "manual_required";
}

export function useAdminWorkspaceActions(state: WorkspaceState): WorkspaceActions {
  const t = useT();
  const login = useCallback(async () => {
    state.setBusy("login");
    state.setStatus(t("workspace.openingOauth"));
    try {
      const result = await fetchJson<AdminConfig | ManualLoginResult>("/_gateway/admin/login", { method: "POST" });
      if (isManualLoginResult(result)) {
        state.setConfig(result.config);
        state.setManualLogin({
          loginId: result.login.loginId,
          message: result.login.message,
        });
        state.setAccountModalOpen(true);
        state.setStatus(result.login.message);
        return;
      }

      const next = result;
      state.setConfig(next);
      state.setAccountModalOpen(false);
      state.setStatus(t("workspace.loginDone"));
    } catch (error) {
      state.setStatus(errorMessage(error));
    } finally {
      state.setBusy(null);
    }
  }, [state]);

  const submitManualLogin = useCallback(async (input: string) => {
    const pending = state.manualLogin;
    const manualInput = input.trim();
    if (!pending) {
      state.setStatus(t("workspace.noPendingOauth"));
      return;
    }
    if (!manualInput) {
      state.setStatus(t("workspace.manualInputRequired"));
      return;
    }

    state.setBusy("login-manual");
    state.setStatus(t("workspace.submittingManual"));
    try {
      const next = await fetchJson<AdminConfig>("/_gateway/admin/login/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ loginId: pending.loginId, input: manualInput }),
      });
      state.setConfig(next);
      state.setManualLogin(null);
      state.setAccountModalOpen(false);
      state.setStatus(t("workspace.loginDone"));
    } catch (error) {
      state.setStatus(errorMessage(error));
    } finally {
      state.setBusy(null);
    }
  }, [state]);

  const cancelManualLogin = useCallback(async () => {
    const pending = state.manualLogin;
    if (!pending) {
      state.setManualLogin(null);
      return;
    }

    state.setBusy("login-manual");
    try {
      const next = await fetchJson<AdminConfig>("/_gateway/admin/login/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ loginId: pending.loginId }),
      });
      state.setConfig(next);
      state.setManualLogin(null);
      state.setStatus(t("workspace.oauthCancelled"));
    } catch (error) {
      state.setStatus(errorMessage(error));
    } finally {
      state.setBusy(null);
    }
  }, [state]);

  const logout = useCallback(async () => {
    if (!window.confirm(t("workspace.clearAccountsConfirm"))) {
      return;
    }
    state.setBusy("logout");
    state.setStatus(t("workspace.clearingAccounts"));
    try {
      const next = await fetchJson<AdminConfig>("/_gateway/admin/logout", { method: "POST" });
      state.setConfig(next);
      state.setRequestLogs([]);
      state.setStatus(t("workspace.accountsCleared"));
    } catch (error) {
      state.setStatus(errorMessage(error));
    } finally {
      state.setBusy(null);
    }
  }, [state]);

  const goRoute = useCallback((route: AppRoute) => {
    const nextHash = `#${route}`;
    startTransition(() => {
      state.setActiveRoute(route);
    });
    if (window.location.hash !== nextHash) {
      window.location.hash = route;
    }
  }, [state]);

  const copyBaseUrl = useCallback(() => {
    const value = state.config?.baseUrl || "http://127.0.0.1:8787/v1";
    navigator.clipboard.writeText(value).then(
      () => state.setStatus(t("workspace.baseUrlCopied")),
      () => state.setStatus(value),
    );
  }, [state]);

  return {
    login,
    submitManualLogin,
    cancelManualLogin,
    logout,
    goRoute,
    copyBaseUrl,
  };
}
