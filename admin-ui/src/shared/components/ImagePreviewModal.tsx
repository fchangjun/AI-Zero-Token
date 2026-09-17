import { Download } from "lucide-react";
import { Modal } from "./Modal";
import { useT } from "@/i18n";
import type { ModalImage } from "@/hooks/useAdminWorkspaceState";

export function ImagePreviewModal(props: { image: ModalImage; onClose: () => void }) {
  const t = useT();
  return (
    <Modal title={t("imagePreview.title")} onClose={props.onClose} wide>
      <div className="image-preview-stage">
        <img src={props.image.src} alt={t("imagePreview.defaultAlt")} />
      </div>
      <div className="preview-modal-meta">
        <span>{props.image.meta}</span>
        <a className="btn-secondary" href={props.image.src} download={props.image.filename || "generated-image.png"}>
          <Download size={16} />
          {t("imagePreview.download")}
        </a>
      </div>
    </Modal>
  );
}
