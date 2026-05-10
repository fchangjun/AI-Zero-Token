import { startTransition, useCallback, useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { fetchJson } from "@/shared/api";
import type { AdminConfig, RequestLog } from "@/shared/types";
import type { BusyAction } from "@/shared/lib/app-types";
import { errorMessage } from "@/shared/lib/app-utils";
import { readRouteFromHash, type AppRoute } from "@/routes/routes";

export type ModalImage = { src: string; meta: string; filename?: string };

export type WorkspaceState = {
  config: AdminConfig | null;
  setConfig: Dispatch<SetStateAction<AdminConfig | null>>;
  busy: BusyAction;
  setBusy: Dispatch<SetStateAction<BusyAction>>;
  status: string;
  setStatus: Dispatch<SetStateAction<string>>;
  showEmails: boolean;
  setShowEmails: Dispatch<SetStateAction<boolean>>;
  accountModalOpen: boolean;
  setAccountModalOpen: Dispatch<SetStateAction<boolean>>;
  contactOpen: boolean;
  setContactOpen: Dispatch<SetStateAction<boolean>>;
  previewImage: ModalImage | null;
  setPreviewImage: Dispatch<SetStateAction<ModalImage | null>>;
  activeRoute: AppRoute;
  setActiveRoute: Dispatch<SetStateAction<AppRoute>>;
  requestLogs: RequestLog[];
  setRequestLogs: Dispatch<SetStateAction<RequestLog[]>>;
  refreshConfig: (options?: { runtime?: boolean; silent?: boolean }) => Promise<AdminConfig>;
};

const ACTIVE_PROFILE_REFRESH_MS = 15 * 1000;
const REQUEST_LOGS_REFRESH_MS = 5 * 1000;
const SHOW_EMAILS_STORAGE_KEY = "azt:settings:show-emails";

function readStoredShowEmails(): boolean {
  try {
    return window.localStorage.getItem(SHOW_EMAILS_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

export function useAdminWorkspaceState(): WorkspaceState {
  const [config, setConfig] = useState<AdminConfig | null>(null);
  const [busy, setBusy] = useState<BusyAction>("initial");
  const [status, setStatus] = useState("正在读取本地网关状态...");
  const [showEmails, setShowEmails] = useState(readStoredShowEmails);
  const [accountModalOpen, setAccountModalOpen] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  const [previewImage, setPreviewImage] = useState<ModalImage | null>(null);
  const [activeRoute, setActiveRoute] = useState<AppRoute>(() => readRouteFromHash());
  const [requestLogs, setRequestLogs] = useState<RequestLog[]>([]);

  const refreshConfig = useCallback(async (options?: { runtime?: boolean; silent?: boolean }) => {
    if (!options?.silent) {
      setBusy(options?.runtime ? "runtime-refresh" : "refresh");
    }
    try {
      const next = await fetchJson<AdminConfig & { quotaSync?: { total: number; synced: number; failed: number; skipped?: number } }>(
        options?.runtime ? "/_gateway/admin/runtime-refresh" : "/_gateway/admin/config",
        options?.runtime
          ? {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ staleOnly: Boolean(options.silent) }),
            }
          : undefined,
      );
      setConfig(next);
      const sync = next.quotaSync;
      setStatus(
        options?.runtime && sync
          ? `状态和额度已刷新：${sync.synced}/${sync.total} 个账号成功${sync.failed ? `，${sync.failed} 个失败` : ""}${sync.skipped ? `，${sync.skipped} 个跳过` : ""}。`
          : options?.runtime
            ? "状态和额度已刷新。"
            : "网关状态已同步。",
      );
      return next;
    } catch (error) {
      setStatus(errorMessage(error));
      throw error;
    } finally {
      if (!options?.silent) {
        setBusy(null);
      }
    }
  }, []);

  const refreshRequestLogs = useCallback(async () => {
    try {
      const next = await fetchJson<{ data: RequestLog[] }>("/_gateway/admin/request-logs");
      setRequestLogs(next.data);
    } catch {
      // Request logs are diagnostic only; keep the rest of the console usable.
    }
  }, []);

  useEffect(() => {
    refreshConfig().catch(() => undefined);
    refreshRequestLogs().catch(() => undefined);
    const timer = window.setInterval(() => {
      refreshConfig({ silent: true }).catch(() => undefined);
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [refreshConfig, refreshRequestLogs]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (!document.hidden) {
        refreshRequestLogs().catch(() => undefined);
      }
    }, REQUEST_LOGS_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [refreshRequestLogs]);

  useEffect(() => {
    try {
      window.localStorage.setItem(SHOW_EMAILS_STORAGE_KEY, String(showEmails));
    } catch {
      // Ignore storage failures; the runtime state still updates.
    }
  }, [showEmails]);

  useEffect(() => {
    const handleHashChange = () => {
      const route = readRouteFromHash();
      startTransition(() => {
        setActiveRoute((current) => (current === route ? current : route));
      });
    };
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (!document.hidden && config?.settings.autoSwitch.enabled) {
        refreshConfig({ silent: true }).catch(() => undefined);
      }
    }, ACTIVE_PROFILE_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [config?.settings.autoSwitch.enabled, refreshConfig]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }
      setPreviewImage(null);
      setContactOpen(false);
      setAccountModalOpen(false);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  return {
    config,
    setConfig,
    busy,
    setBusy,
    status,
    setStatus,
    showEmails,
    setShowEmails,
    accountModalOpen,
    setAccountModalOpen,
    contactOpen,
    setContactOpen,
    previewImage,
    setPreviewImage,
    activeRoute,
    setActiveRoute,
    requestLogs,
    setRequestLogs,
    refreshConfig,
  };
}
