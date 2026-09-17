import { Modal } from "./Modal";
import wechatContact from "@/assets/wechat-contact.png";
import { useT } from "@/i18n";

export function ContactModal(props: { onClose: () => void }) {
  const t = useT();
  return (
    <Modal title={t("contact.title")} onClose={props.onClose}>
      <div className="contact-notes">
        <div className="contact-note">
          <strong>{t("contact.wechat")}</strong>
          <span>{t("contact.wechatBody")}</span>
        </div>
        <div className="contact-note">
          <strong>{t("contact.githubTitle")}</strong>
          <span>{t("contact.githubBody")}</span>
          <a href="https://github.com/fchangjun/AI-Zero-Token/issues" target="_blank" rel="noreferrer">
            https://github.com/fchangjun/AI-Zero-Token/issues
          </a>
        </div>
        <div className="contact-note">
          <strong>{t("contact.feedbackTitle")}</strong>
          <span>{t("contact.feedbackBody")}</span>
        </div>
        <div className="contact-qr">
          <img src={wechatContact} alt={t("contact.wechatQrAlt")} />
          <span>{t("contact.wechatQrHint")}</span>
        </div>
      </div>
    </Modal>
  );
}
