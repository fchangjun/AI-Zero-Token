import { Loader2 } from "lucide-react";
import { ContactModal } from "@/shared/components/ContactModal";
import { ImagePreviewModal } from "@/shared/components/ImagePreviewModal";
import { AccountModal } from "@/pages/accounts/components/AccountModal";
import type { UseAdminWorkspaceResult } from "@/hooks/useAdminWorkspace";

export function AppOverlays({ workspace }: { workspace: UseAdminWorkspaceResult }) {
  return (
    <>
      {workspace.isLoading && (
        <div className="loading-cover">
          <Loader2 className="spin" size={28} />
          <span>正在加载本地网关...</span>
        </div>
      )}

      {workspace.accountModalOpen && (
        <AccountModal
          busy={workspace.busy}
          login={workspace.login}
          setBusy={workspace.setBusy}
          setConfig={workspace.setConfig}
          setStatus={workspace.setStatus}
          setAccountModalOpen={workspace.setAccountModalOpen}
        />
      )}

      {workspace.contactOpen && <ContactModal onClose={() => workspace.setContactOpen(false)} />}
      {workspace.previewImage && <ImagePreviewModal image={workspace.previewImage} onClose={() => workspace.setPreviewImage(null)} />}
    </>
  );
}
