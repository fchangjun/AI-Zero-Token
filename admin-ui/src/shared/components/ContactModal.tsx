import { Modal } from "./Modal";
import wechatContact from "@/assets/wechat-contact.png";

export function ContactModal(props: { onClose: () => void }) {
  return (
    <Modal title="交流反馈" onClose={props.onClose}>
      <div className="contact-notes">
        <div className="contact-note">
          <strong>作者微信</strong>
          <span>扫码备注 AI-Zero-Token，可反馈安装问题、账号切换、生图异常和接口兼容需求。</span>
        </div>
        <div className="contact-note">
          <strong>GitHub Issues</strong>
          <span>更适合提交可复现的问题、日志片段和功能建议。</span>
          <a href="https://github.com/fchangjun/AI-Zero-Token/issues" target="_blank" rel="noreferrer">
            https://github.com/fchangjun/AI-Zero-Token/issues
          </a>
        </div>
        <div className="contact-note">
          <strong>反馈入口</strong>
          <span>当前本地管理页、CLI 与桌面端共用同一套账号池，反馈时建议附上管理页状态和接口路径。</span>
        </div>
        <div className="contact-qr">
          <img src={wechatContact} alt="作者微信二维码" />
          <span>微信二维码仅用于交流反馈；代码问题优先建议走 GitHub Issues，便于追踪。</span>
        </div>
      </div>
    </Modal>
  );
}
