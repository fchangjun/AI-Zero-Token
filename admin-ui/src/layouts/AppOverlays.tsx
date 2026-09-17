import { Loader2 } from "lucide-react";
import { ContactModal } from "@/shared/components/ContactModal";
import { ImagePreviewModal } from "@/shared/components/ImagePreviewModal";
import { AccountModal } from "@/pages/accounts/components/AccountModal";
import type { UseAdminWorkspaceResult } from "@/hooks/useAdminWorkspace";
import { useT } from "@/i18n";

export function AppOverlays({ workspace }: { workspace: UseAdminWorkspaceResult }) {
  const t = useT();
  return (
    <>
      {workspace.isLoading && (
        <div className="loading-cover">
          <Loader2 className="spin" size={28} />
          <span>{t("common.loading")}</span>
        </div>
      )}

      {workspace.accountModalOpen && (
        <AccountModal
          busy={workspace.busy}
          login={workspace.login}
          manualLogin={workspace.manualLogin}
          submitManualLogin={workspace.submitManualLogin}
          cancelManualLogin={workspace.cancelManualLogin}
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
