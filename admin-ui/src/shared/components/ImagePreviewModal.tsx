import { Download } from "lucide-react";
import { Modal } from "./Modal";
import type { ModalImage } from "@/hooks/useAdminWorkspace";

export function ImagePreviewModal(props: { image: ModalImage; onClose: () => void }) {
  return (
    <Modal title="图片预览" onClose={props.onClose} wide>
      <div className="image-preview-stage">
        <img src={props.image.src} alt="生成图片预览" />
      </div>
      <div className="preview-modal-meta">
        <span>{props.image.meta}</span>
        <a className="btn-secondary" href={props.image.src} download={props.image.filename || "generated-image.png"}>
          <Download size={16} />
          下载图片
        </a>
      </div>
    </Modal>
  );
}
