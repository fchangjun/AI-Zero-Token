import { useState, type ChangeEvent, type Dispatch, type SetStateAction } from "react";
import { FileArchive, Loader2, LogIn } from "lucide-react";
import { unzipSync, strFromU8 } from "fflate";
import { fetchJson } from "@/shared/api";
import type { AdminConfig } from "@/shared/types";
import type { BusyAction } from "@/shared/lib/app-types";
import { errorMessage } from "@/shared/lib/app-utils";
import { formatJson } from "@/shared/lib/format";
import { Modal } from "@/shared/components/Modal";

type ZipImportPreview = {
  fileName: string;
  jsonCount: number;
  profileCount: number;
  profiles: unknown[];
  errors: string[];
};

function isImportableJsonPath(path: string) {
  const normalized = path.replace(/\\/g, "/");
  const filename = normalized.split("/").pop() || "";
  return normalized.toLowerCase().endsWith(".json") && !normalized.includes("__MACOSX/") && !filename.startsWith("._");
}

async function readZipProfiles(file: File): Promise<ZipImportPreview> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const entries = unzipSync(bytes);
  const profiles: unknown[] = [];
  const errors: string[] = [];
  let jsonCount = 0;

  for (const [path, content] of Object.entries(entries)) {
    if (!isImportableJsonPath(path)) {
      continue;
    }

    jsonCount += 1;
    try {
      profiles.push(JSON.parse(strFromU8(content)));
    } catch (error) {
      errors.push(`${path}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (jsonCount === 0) {
    errors.push("压缩包里没有找到可导入的 .json 文件。");
  }

  return {
    fileName: file.name,
    jsonCount,
    profileCount: profiles.length,
    profiles,
    errors,
  };
}

export function AccountModal(props: {
  busy: BusyAction;
  login: () => Promise<void>;
  setBusy: Dispatch<SetStateAction<BusyAction>>;
  setConfig: Dispatch<SetStateAction<AdminConfig | null>>;
  setStatus: Dispatch<SetStateAction<string>>;
  setAccountModalOpen: Dispatch<SetStateAction<boolean>>;
}) {
  const [importText, setImportText] = useState("");
  const [zipPreview, setZipPreview] = useState<ZipImportPreview | null>(null);

  async function importProfile(profileInput?: unknown, successMessage?: (count: number) => string) {
    props.setBusy("import");
    props.setStatus("正在导入账号...");
    try {
      const profile = profileInput ?? JSON.parse(importText);
      const result = await fetchJson<AdminConfig & { importedProfileCount?: number }>("/_gateway/admin/profiles/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: formatJson({ profile }),
      });
      props.setConfig(result);
      setImportText("");
      setZipPreview(null);
      props.setAccountModalOpen(false);
      const importedCount = result.importedProfileCount || 1;
      props.setStatus(successMessage ? successMessage(importedCount) : `已导入 ${importedCount} 个账号。`);
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

  async function validateZipImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    setZipPreview(null);
    if (!file) {
      return;
    }

    if (!file.name.toLowerCase().endsWith(".zip")) {
      props.setStatus("请上传 .zip 压缩包；RAR 暂不支持直接导入。");
      return;
    }

    props.setBusy("import");
    props.setStatus("正在检查压缩包内的 JSON...");
    let preview: ZipImportPreview | null = null;
    try {
      preview = await readZipProfiles(file);
      if (preview.errors.length > 0) {
        setZipPreview(preview);
        props.setStatus(`压缩包校验失败: ${preview.errors[0]}`);
        return;
      }

      const result = await fetchJson<{ valid: true; profileCount: number }>("/_gateway/admin/profiles/import/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: formatJson({ profile: { profiles: preview.profiles } }),
      });
      const validatedPreview = { ...preview, profileCount: result.profileCount };
      setZipPreview(validatedPreview);
      props.setStatus(`压缩包校验通过，发现 ${preview.jsonCount} 个 JSON 文件，可导入 ${result.profileCount} 个账号。`);
    } catch (error) {
      const message = errorMessage(error);
      if (preview) {
        setZipPreview({ ...preview, errors: [message] });
      }
      props.setStatus(`压缩包校验失败: ${message}`);
    } finally {
      props.setBusy(null);
    }
  }

  function importZipProfiles() {
    if (!zipPreview || zipPreview.errors.length > 0 || zipPreview.profiles.length === 0) {
      props.setStatus("请先选择并通过校验一个 ZIP 压缩包。");
      return;
    }

    importProfile({ profiles: zipPreview.profiles }, (count) => `已从 ${zipPreview.fileName} 批量导入 ${count} 个账号。`).catch((error) => props.setStatus(errorMessage(error)));
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
          <p>支持粘贴单个对象、对象数组、profiles 对象，也支持上传包含多个 JSON 的 ZIP 压缩包。导入前会先校验格式。</p>
          <div className="button-row">
            <button className="btn-secondary" type="button" onClick={loadImportTemplate} disabled={props.busy === "template"}>
              填入参考格式
            </button>
            <button className="btn-primary" type="button" onClick={() => importProfile()} disabled={props.busy === "import" || !importText.trim()}>
              导入
            </button>
          </div>
          <textarea className="textarea import-textarea" value={importText} onChange={(event) => setImportText(event.target.value)} placeholder='粘贴账号 JSON，支持 { "profiles": [...] } 批量导入' spellCheck={false} />
          <div className="zip-import-box">
            <div>
              <strong>批量导入 ZIP</strong>
              <p>自动忽略目录、__MACOSX 和 ._ 元数据文件，只读取压缩包内的 .json 文件。</p>
            </div>
            <label className="btn-secondary zip-import-trigger">
              <FileArchive size={16} />
              选择 ZIP 校验
              <input type="file" accept=".zip,application/zip" onChange={validateZipImport} disabled={props.busy === "import"} />
            </label>
          </div>
          {zipPreview ? (
            <div className={`zip-import-preview ${zipPreview.errors.length > 0 ? "error" : "ready"}`}>
              <strong>{zipPreview.fileName}</strong>
              <span>
                识别到 {zipPreview.jsonCount} 个 JSON，{zipPreview.errors.length > 0 ? `${zipPreview.errors.length} 个错误` : "校验通过"}
              </span>
              {zipPreview.errors.length > 0 ? <p>{zipPreview.errors.slice(0, 3).join("；")}</p> : null}
              <button className="btn-primary" type="button" onClick={importZipProfiles} disabled={props.busy === "import" || zipPreview.errors.length > 0 || zipPreview.profiles.length === 0}>
                批量导入 {zipPreview.profileCount} 个账号
              </button>
            </div>
          ) : null}
        </section>
      </div>
    </Modal>
  );
}
