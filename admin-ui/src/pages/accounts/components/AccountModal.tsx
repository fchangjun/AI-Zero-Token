import { useState, type Dispatch, type SetStateAction } from "react";
import { Loader2, LogIn } from "lucide-react";
import { fetchJson } from "@/shared/api";
import type { AdminConfig } from "@/shared/types";
import type { BusyAction } from "@/shared/lib/app-types";
import { errorMessage } from "@/shared/lib/app-utils";
import { formatJson } from "@/shared/lib/format";
import { Modal } from "@/shared/components/Modal";

export function AccountModal(props: {
  busy: BusyAction;
  login: () => Promise<void>;
  setBusy: Dispatch<SetStateAction<BusyAction>>;
  setConfig: Dispatch<SetStateAction<AdminConfig | null>>;
  setStatus: Dispatch<SetStateAction<string>>;
  setAccountModalOpen: Dispatch<SetStateAction<boolean>>;
}) {
  const [importText, setImportText] = useState("");

  async function importProfile() {
    props.setBusy("import");
    props.setStatus("正在导入账号...");
    try {
      const profile = JSON.parse(importText);
      const result = await fetchJson<AdminConfig & { importedProfileCount?: number }>("/_gateway/admin/profiles/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: formatJson({ profile }),
      });
      props.setConfig(result);
      setImportText("");
      props.setAccountModalOpen(false);
      props.setStatus(`已导入 ${result.importedProfileCount || 1} 个账号。`);
    } catch (error) {
      props.setStatus(errorMessage(error));
    } finally {
      props.setBusy(null);
    }
  }

  async function loadImportTemplate() {
    props.setBusy("template");
    try {
      const result = await fetchJson<{ profile: unknown }>("/_gateway/admin/profiles/import-template");
      setImportText(formatJson(result.profile));
      props.setStatus("已填入参考格式。");
    } catch (error) {
      props.setStatus(errorMessage(error));
    } finally {
      props.setBusy(null);
    }
  }

  return (
    <Modal title="新增账号" onClose={() => props.setAccountModalOpen(false)}>
      <div className="modal-grid">
        <section className="modal-section">
          <h4>OAuth 登录</h4>
          <p>使用浏览器完成 Codex OAuth 授权，完成后会自动写入本地账号池。</p>
          <button className="btn-primary" type="button" onClick={props.login} disabled={props.busy === "login"}>
            {props.busy === "login" ? <Loader2 className="spin" size={16} /> : <LogIn size={16} />}
            登录
          </button>
        </section>
        <section className="modal-section">
          <h4>导入账号 JSON</h4>
          <p>支持单个对象、对象数组，或包含 profiles 数组的对象。导入后最后一个账号会成为当前账号。</p>
          <div className="button-row">
            <button className="btn-secondary" type="button" onClick={loadImportTemplate} disabled={props.busy === "template"}>
              填入参考格式
            </button>
            <button className="btn-primary" type="button" onClick={importProfile} disabled={props.busy === "import" || !importText.trim()}>
              导入
            </button>
          </div>
          <textarea className="textarea import-textarea" value={importText} onChange={(event) => setImportText(event.target.value)} placeholder='粘贴账号 JSON，支持 { "profiles": [...] } 批量导入' spellCheck={false} />
        </section>
      </div>
    </Modal>
  );
}
