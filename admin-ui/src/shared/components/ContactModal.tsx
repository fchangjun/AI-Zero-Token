import { useEffect, useRef } from "react";
import { Modal } from "./Modal";
import wechatContact from "@/assets/wechat-contact.png";
import { useT } from "@/i18n";

export function ContactModal(props: { onClose: () => void; purpose?: "subscription" }) {
  const t = useT();
  const body = useRef<HTMLDivElement>(null);
  const onClose = useRef(props.onClose);
  onClose.current = props.onClose;
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = body.current?.closest(".modal-card");
    dialog?.querySelector<HTMLButtonElement>("button")?.focus();
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); onClose.current(); }
      if (event.key === "Tab" && dialog) {
        const focusable = [...dialog.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input, textarea, [tabindex="0"]')];
        const first = focusable[0], last = focusable.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener("keydown", close);
    return () => { document.removeEventListener("keydown", close); previous?.focus(); };
  }, []);
  return (
    <Modal title={t(props.purpose === "subscription" ? "intelStation.subscriptionButton" : "contact.title")} onClose={props.onClose}>
      <div className="contact-notes" ref={body}>
        {props.purpose === "subscription" ? <div className="contact-note"><strong>{t("intelStation.subscriptionTitle")}</strong><span>{t("intelStation.subscriptionHint")}</span></div> : <><div className="contact-note">
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
        </div></>}
        <div className="contact-qr">
          <img src={wechatContact} alt={t("contact.wechatQrAlt")} />
          <span>{t(props.purpose === "subscription" ? "intelStation.subscriptionQrHint" : "contact.wechatQrHint")}</span>
        </div>
      </div>
    </Modal>
  );
}
