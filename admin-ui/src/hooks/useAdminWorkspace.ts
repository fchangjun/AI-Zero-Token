import type { AdminConfig } from "@/shared/types";
import type { AppRoute } from "@/routes/routes";
import { useAdminWorkspaceActions, type WorkspaceActions } from "./useAdminWorkspaceActions";
import { useAdminWorkspaceDerived, type WorkspaceDerived } from "./useAdminWorkspaceDerived";
import { useAdminWorkspaceState, type ModalImage, type WorkspaceState } from "./useAdminWorkspaceState";

export type UseAdminWorkspaceResult = WorkspaceState & WorkspaceDerived & WorkspaceActions & {
  activeRoute: AppRoute;
  refreshConfig: (options?: { runtime?: boolean; silent?: boolean }) => Promise<AdminConfig>;
};

export { ModalImage };

export function useAdminWorkspace(): UseAdminWorkspaceResult {
  const state = useAdminWorkspaceState();
  const derived = useAdminWorkspaceDerived({
    config: state.config,
    busy: state.busy,
    activeRoute: state.activeRoute,
    showEmails: state.showEmails,
  });
  const actions = useAdminWorkspaceActions(state);
  return { ...state, ...derived, ...actions };
}
