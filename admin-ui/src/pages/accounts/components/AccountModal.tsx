import { useEffect, useState, type ChangeEvent, type Dispatch, type FormEvent, type SetStateAction } from "react";
import { FileArchive, Loader2, LogIn, Send } from "lucide-react";
import { unzipSync, strFromU8 } from "fflate";
import { fetchJson } from "@/shared/api";
import type { AdminConfig } from "@/shared/types";
import type { BusyAction } from "@/shared/lib/app-types";
import { errorMessage } from "@/shared/lib/app-utils";
import { formatJson } from "@/shared/lib/format";
import { Modal } from "@/shared/components/Modal";
import type { ManualLoginState } from "@/hooks/useAdminWorkspaceState";
import { useT } from "@/i18n";

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

async function readZipProfiles(file: File, noJsonMessage: string): Promise<ZipImportPreview> {
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
    errors.push(noJsonMessage);
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
  manualLogin: ManualLoginState;
  submitManualLogin: (input: string) => Promise<void>;
  cancelManualLogin: () => Promise<void>;
  setBusy: Dispatch<SetStateAction<BusyAction>>;
  setConfig: Dispatch<SetStateAction<AdminConfig | null>>;
  setStatus: Dispatch<SetStateAction<string>>;
  setAccountModalOpen: Dispatch<SetStateAction<boolean>>;
}) {
  const t = useT();
  const [importText, setImportText] = useState("");
  const [manualInput, setManualInput] = useState("");
  const [zipPreview, setZipPreview] = useState<ZipImportPreview | null>(null);

  useEffect(() => {
    if (!props.manualLogin) {
      setManualInput("");
    }
  }, [props.manualLogin]);

  function closeModal() {
    if (props.manualLogin) {
      props.cancelManualLogin().catch((error) => props.setStatus(errorMessage(error)));
    }
    props.setAccountModalOpen(false);
  }

  function handleManualSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    props.submitManualLogin(manualInput).catch((error) => props.setStatus(errorMessage(error)));
  }

  async function importProfile(profileInput?: unknown, successMessage?: (count: number) => string) {
    props.setBusy("import");
    props.setStatus(t("accountModal.statusImporting"));
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
      props.setStatus(successMessage ? successMessage(importedCount) : t("accountModal.importedCount", { count: importedCount }));
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
      props.setStatus(t("accountModal.templateLoaded"));
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
      props.setStatus(t("accountModal.zipNotSupported"));
      return;
    }

    props.setBusy("import");
    props.setStatus(t("accountModal.statusCheckingZip"));
    let preview: ZipImportPreview | null = null;
    try {
      preview = await readZipProfiles(file, t("accountModal.zipNoJson"));
      if (preview.errors.length > 0) {
        setZipPreview(preview);
        props.setStatus(t("accountModal.zipCheckFailedWithReason", { reason: preview.errors[0] }));
        return;
      }

      props.setStatus(t("accountModal.statusValidatingZip"));
      const result = await fetchJson<{ profileCount: number }>("/_gateway/admin/profiles/import-zip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: formatJson({ profiles: preview.profiles }),
      });
      const validatedPreview = { ...preview, profileCount: result.profileCount };
      setZipPreview(validatedPreview);
      props.setStatus(t("accountModal.zipCheckPassed", { jsonCount: preview.jsonCount, profileCount: result.profileCount }));
    } catch (error) {
      const message = errorMessage(error);
      if (preview) {
        setZipPreview({ ...preview, errors: [message] });
      }
      props.setStatus(t("accountModal.zipCheckFailedWithReason", { reason: message }));
    } finally {
      props.setBusy(null);
    }
  }

  function importZipProfiles() {
    if (!zipPreview || zipPreview.errors.length > 0 || zipPreview.profiles.length === 0) {
      props.setStatus(t("accountModal.zipPleaseValidateFirst"));
      return;
    }

    importProfile({ profiles: zipPreview.profiles }, (count) => t("accountModal.zipImported", { fileName: zipPreview.fileName, count })).catch((error) => props.setStatus(errorMessage(error)));
  }

  return (
    <Modal title={t("accountModal.title")} onClose={closeModal}>
      <div className="modal-grid">
        <section className="modal-section">
          <h4>{t("accountModal.oauthTitle")}</h4>
          <p>{t("accountModal.oauthDescription")}</p>
          <button className="btn-primary" type="button" onClick={props.login} disabled={props.busy === "login"}>
            {props.busy === "login" ? <Loader2 className="spin" size={16} /> : <LogIn size={16} />}
            {t("accountModal.login")}
          </button>
          {props.manualLogin ? (
            <form className="manual-login-panel" onSubmit={handleManualSubmit}>
              <div>
                <strong>{t("accountModal.manualTitle")}</strong>
                <p>{props.manualLogin.message}</p>
              </div>
              <textarea
                className="textarea manual-login-textarea"
                value={manualInput}
                onChange={(event) => setManualInput(event.target.value)}
                placeholder={t("accountModal.manualPlaceholder")}
                autoFocus
                spellCheck={false}
              />
              <div className="button-row">
                <button className="btn-secondary" type="button" onClick={props.cancelManualLogin} disabled={props.busy === "login-manual"}>
                  {t("accountModal.manualCancel")}
                </button>
                <button className="btn-primary" type="submit" disabled={props.busy === "login-manual" || !manualInput.trim()}>
                  {props.busy === "login-manual" ? <Loader2 className="spin" size={16} /> : <Send size={16} />}
                  {t("accountModal.manualSubmit")}
                </button>
              </div>
            </form>
          ) : null}
        </section>
        <section className="modal-section">
          <h4>{t("accountModal.importTitle")}</h4>
          <p>{t("accountModal.importDescription")}</p>
          <div className="button-row">
            <button className="btn-secondary" type="button" onClick={loadImportTemplate} disabled={props.busy === "template"}>
              {t("accountModal.loadTemplate")}
            </button>
            <button className="btn-primary" type="button" onClick={() => importProfile()} disabled={props.busy === "import" || !importText.trim()}>
              {t("accountModal.import")}
            </button>
          </div>
          <textarea className="textarea import-textarea" value={importText} onChange={(event) => setImportText(event.target.value)} placeholder={t("accountModal.importPlaceholder")} spellCheck={false} />
          <div className="zip-import-box">
            <div>
              <strong>{t("accountModal.zipBoxTitle")}</strong>
              <p>{t("accountModal.zipBoxDescription")}</p>
            </div>
            <label className="btn-secondary zip-import-trigger">
              <FileArchive size={16} />
              {t("accountModal.zipChoose")}
              <input type="file" accept=".zip,application/zip" onChange={validateZipImport} disabled={props.busy === "import"} />
            </label>
          </div>
          {zipPreview ? (
            <div className={`zip-import-preview ${zipPreview.errors.length > 0 ? "error" : "ready"}`}>
              <strong>{zipPreview.fileName}</strong>
              <span>
                {zipPreview.errors.length > 0
                  ? t("accountModal.zipPreviewWithErrors", { jsonCount: zipPreview.jsonCount, errorCount: zipPreview.errors.length })
                  : t("accountModal.zipPreviewOk", { jsonCount: zipPreview.jsonCount })}
              </span>
              {zipPreview.errors.length > 0 ? <p>{zipPreview.errors.slice(0, 3).join(t("accountModal.listSeparator"))}</p> : null}
              <button className="btn-primary" type="button" onClick={importZipProfiles} disabled={props.busy === "import" || zipPreview.errors.length > 0 || zipPreview.profiles.length === 0}>
                {t("accountModal.zipImportButton", { count: zipPreview.profileCount })}
              </button>
            </div>
          ) : null}
        </section>
      </div>
    </Modal>
  );
}
