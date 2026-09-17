import { CheckCircle2, ChevronDown, Copy, Link2, Loader2, Pencil, Trash2, Upload } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { fetchJson } from "@/shared/api";
import type { BusyAction } from "@/shared/lib/app-types";
import { copyText, errorMessage, readFileAsDataUrl } from "@/shared/lib/app-utils";
import { formatFileSize, formatFullTime } from "@/shared/lib/format";
import { useT, useLocaleValue } from "@/i18n";
import type { Translator } from "@/shared/lib/profiles";

type GithubImageBedConfig = {
  hasToken: boolean;
  repository: string;
  pathPrefix: string;
  defaultBranch: string;
};

type GithubImageBedConnection = {
  ok: boolean;
  owner: string;
  repository: string;
  repositoryUrl: string;
  branch: string;
  publicUrl: string;
  createdRepository: boolean;
};

type GithubImageBedUploadResult = {
  filename: string;
  path: string;
  url: string;
  htmlUrl: string;
  downloadUrl: string;
  owner: string;
  repository: string;
  branch: string;
  size: number;
  mimeType: string;
  sha?: string;
};

type GithubImageBedHistoryItem = {
  id: string;
  createdAt: number;
  filename: string;
  path: string;
  url: string;
  htmlUrl: string;
  downloadUrl: string;
  owner: string;
  repository: string;
  branch: string;
  size: number;
  mimeType: string;
  previewUrl: string;
  sha?: string;
};

type UploadProgress = {
  phase: "reading" | "uploading";
  fileName: string;
  fileIndex: number;
  totalFiles: number;
  percent: number;
};

function buildConnectionLabel(connection: GithubImageBedConnection | null, config: GithubImageBedConfig | null, t: Translator): string {
  if (connection) {
    return `${connection.owner}/${connection.repository} · ${connection.branch}`;
  }
  if (!config?.hasToken) {
    return t("imageBed.connection.notSaved");
  }
  return t("imageBed.connection.savedAwaiting");
}

function parseJsonError(text: string, fallback: string): string {
  if (!text) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(text) as { error?: { message?: unknown } };
    if (typeof parsed.error?.message === "string" && parsed.error.message.trim()) {
      return parsed.error.message;
    }
  } catch {
    // ignore
  }

  return text || fallback;
}

async function uploadFileWithProgress(
  file: File,
  onProgress: (percent: number) => void,
): Promise<GithubImageBedUploadResult> {
  const dataUrl = await readFileAsDataUrl(file);
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/_gateway/image-bed/upload");
    xhr.setRequestHeader("Content-Type", "application/json");
    xhr.responseType = "text";
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        onProgress((event.loaded / event.total) * 100);
      }
    };
    xhr.onerror = () => reject(new Error("Upload request failed."));
    xhr.onload = () => {
      const bodyText = xhr.responseText || "";
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new Error(parseJsonError(bodyText, `HTTP ${xhr.status}`)));
        return;
      }

      try {
        const parsed = JSON.parse(bodyText) as GithubImageBedUploadResult;
        resolve(parsed);
      } catch {
        reject(new Error("Upload response parse failed."));
      }
    };
    xhr.send(
      JSON.stringify({
        filename: file.name,
        dataUrl,
      }),
    );
  });
}

export function ImageBedPage(props: { busy: BusyAction; setBusy: (value: BusyAction) => void; setStatus: (value: string) => void }) {
  const [config, setConfig] = useState<GithubImageBedConfig | null>(null);
  const [tokenDraft, setTokenDraft] = useState("");
  const [tokenEditing, setTokenEditing] = useState(true);
  const [connection, setConnection] = useState<GithubImageBedConnection | null>(null);
  const [history, setHistory] = useState<GithubImageBedHistoryItem[]>([]);
  const [visibleHistoryCount, setVisibleHistoryCount] = useState(12);
  const [message, setMessage] = useState("");
  const t = useT();
  const locale = useLocaleValue();
  const intlLocale = locale === "en" ? "en-US" : "zh-CN";
  const [dragging, setDragging] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null);
  const [deletingHistoryId, setDeletingHistoryId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const connectionLabel = useMemo(() => buildConnectionLabel(connection, config, t), [connection, config, t]);
  const visibleHistory = useMemo(() => history.slice(0, visibleHistoryCount), [history, visibleHistoryCount]);

  useEffect(() => {
    let active = true;
    async function bootstrap() {
      try {
        const next = await fetchJson<GithubImageBedConfig>("/_gateway/image-bed/config");
        if (!active) {
          return;
        }
        setConfig(next);
        setTokenEditing(!next.hasToken);
        setMessage(next.hasToken ? t("imageBed.tokenSavedValidating") : t("imageBed.pleaseFillToken"));
        if (next.hasToken) {
          await validateConnection(false);
        }
      } catch (error) {
        if (!active) {
          return;
        }
        setMessage(errorMessage(error));
      }

      try {
        const nextHistory = await fetchJson<{ items: GithubImageBedHistoryItem[] }>("/_gateway/image-bed/history?limit=100");
        if (!active) {
          return;
        }
        setHistory(nextHistory.items);
      } catch (error) {
        if (!active) {
          return;
        }
        setMessage((current) => `${current} ${errorMessage(error)}`);
      }
    }

    void bootstrap();
    return () => {
      active = false;
    };
  }, []);

  async function refreshHistory() {
    const nextHistory = await fetchJson<{ items: GithubImageBedHistoryItem[] }>("/_gateway/image-bed/history?limit=100");
    setHistory(nextHistory.items);
  }

  async function validateConnection(showBusy = true) {
    if (showBusy) {
      props.setBusy("image-bed-save");
    }
    try {
      const result = await fetchJson<GithubImageBedConnection>("/_gateway/image-bed/validate", {
        method: "POST",
      });
      setConnection(result);
      setMessage(t("imageBed.connectOk", { owner: result.owner, repo: result.repository, branch: result.branch }));
      props.setStatus(t("imageBed.connectOkStatus", { owner: result.owner, repo: result.repository }));
      return result;
    } catch (error) {
      const text = errorMessage(error);
      setConnection(null);
      setMessage(t("imageBed.connectFailed", { error: text }));
      props.setStatus(text);
      throw error;
    } finally {
      if (showBusy) {
        props.setBusy(null);
      }
    }
  }

  async function saveToken() {
    const token = tokenDraft.trim();
    if (!token) {
      setMessage(t("imageBed.pleaseFillToken"));
      return;
    }

    props.setBusy("image-bed-save");
    try {
      const next = await fetchJson<GithubImageBedConfig>("/_gateway/image-bed/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      setConfig(next);
      setTokenDraft("");
      setTokenEditing(false);
      setMessage(t("imageBed.tokenSavedValidating"));
      props.setStatus(t("imageBed.tokenSaved"));
      try {
        await validateConnection(false);
        setMessage(t("imageBed.tokenSavedAndVerified"));
      } catch (error) {
        setTokenEditing(true);
        setMessage(t("imageBed.tokenSavedButVerifyFailed", { error: errorMessage(error) }));
      }
    } catch (error) {
      const text = errorMessage(error);
      setMessage(t("imageBed.saveFailed", { error: text }));
      props.setStatus(text);
    } finally {
      props.setBusy(null);
    }
  }

  async function clearToken() {
    props.setBusy("image-bed-save");
    try {
      const next = await fetchJson<GithubImageBedConfig>("/_gateway/image-bed/config", {
        method: "DELETE",
      });
      setConfig(next);
      setConnection(null);
      setTokenDraft("");
      setTokenEditing(true);
      setMessage(t("imageBed.tokenCleared"));
      props.setStatus(t("imageBed.tokenCleared"));
    } catch (error) {
      const text = errorMessage(error);
      setMessage(t("imageBed.clearFailed", { error: text }));
      props.setStatus(text);
    } finally {
      props.setBusy(null);
    }
  }

  async function startEditing() {
    setTokenEditing(true);
    setTokenDraft("");
  }

  async function uploadFile(file: File, progressCb: (percent: number) => void) {
    if (!file.type.startsWith("image/")) {
      throw new Error(t("imageBed.notImage", { name: file.name }));
    }

    return uploadFileWithProgress(file, progressCb);
  }

  async function handleFiles(fileList: FileList | File[]) {
    const files = Array.from(fileList).filter((file) => file.type.startsWith("image/"));
    if (files.length === 0) {
      setMessage(t("imageBed.pleaseSelectImage"));
      return;
    }
    if (!config?.hasToken) {
      setMessage(t("imageBed.pleaseSaveTokenFirst"));
      return;
    }

    props.setBusy("image-bed-upload");
    try {
      const nextHistory: GithubImageBedHistoryItem[] = [];
      for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        setUploadProgress({
          phase: "reading",
          fileName: file.name,
          fileIndex: index + 1,
          totalFiles: files.length,
          percent: (index / files.length) * 100,
        });
        setMessage(t("imageBed.readingStatus", { index: index + 1, total: files.length, name: file.name }));
        props.setStatus(t("imageBed.readingStatus", { index: index + 1, total: files.length, name: file.name }));
        const uploaded = await uploadFile(file, (percent) => {
          setUploadProgress({
            phase: "uploading",
            fileName: file.name,
            fileIndex: index + 1,
            totalFiles: files.length,
            percent: ((index + percent / 100) / files.length) * 100,
          });
        });
        const historyItem: GithubImageBedHistoryItem = {
          id: uploaded.path,
          createdAt: Date.now(),
          filename: uploaded.filename,
          path: uploaded.path,
          url: uploaded.url,
          htmlUrl: uploaded.htmlUrl,
          downloadUrl: uploaded.downloadUrl,
          owner: uploaded.owner,
          repository: uploaded.repository,
          branch: uploaded.branch,
          size: uploaded.size,
          mimeType: uploaded.mimeType,
          previewUrl: uploaded.url,
          sha: uploaded.sha,
        };
        nextHistory.unshift(historyItem);
        setHistory((current) => [historyItem, ...current.filter((item) => item.id !== historyItem.id)].slice(0, 100));
      }
      setVisibleHistoryCount((current) => Math.max(current, Math.min(12, history.length + nextHistory.length)));
      setMessage(t("imageBed.uploadCountStatus", { count: files.length }));
      props.setStatus(t("imageBed.uploadCountStatus", { count: files.length }));
      await refreshHistory();
    } catch (error) {
      const text = errorMessage(error);
      setMessage(t("imageBed.uploadFailed", { error: text }));
      props.setStatus(text);
    } finally {
      setUploadProgress(null);
      props.setBusy(null);
    }
  }

  async function copyUrl(url: string) {
    const ok = await copyText(url);
    const text = ok ? t("imageBed.linkCopied") : t("imageBed.linkCopyFailed");
    setMessage(text);
    props.setStatus(text);
  }

  function handlePickFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.currentTarget.files || []);
    event.currentTarget.value = "";
    if (files.length === 0) {
      return;
    }
    void handleFiles(files);
  }

  async function clearHistory() {
    await fetchJson("/_gateway/image-bed/history", { method: "DELETE" });
    setHistory([]);
    setVisibleHistoryCount(12);
    setMessage(t("imageBed.historyCleared"));
    props.setStatus(t("imageBed.historyCleared"));
  }

  async function deleteHistoryItem(item: GithubImageBedHistoryItem) {
    const confirmed = window.confirm(t("imageBed.deleteConfirm", { name: item.filename }));
    if (!confirmed) {
      return;
    }

    setDeletingHistoryId(item.id);
    props.setBusy("image-bed-delete");
    try {
      const nextHistory = await fetchJson<{ items: GithubImageBedHistoryItem[] }>(`/_gateway/image-bed/history/${encodeURIComponent(item.id)}`, {
        method: "DELETE",
      });
      setHistory(nextHistory.items);
      setMessage(t("imageBed.deletedFromHistory", { name: item.filename }));
      props.setStatus(t("imageBed.deletedFromBed", { name: item.filename }));
    } catch (error) {
      const text = errorMessage(error);
      setMessage(t("imageBed.deleteFailed", { error: text }));
      props.setStatus(text);
    } finally {
      setDeletingHistoryId(null);
      props.setBusy(null);
    }
  }

  const activeBusy = props.busy === "image-bed-save" || props.busy === "image-bed-upload" || props.busy === "image-bed-delete";
  const latestHistory = history[0];

  return (
    <section className="image-bed-page">
      <div className="image-bed-workbench">
        <section className={`image-bed-upload-panel ${dragging ? "is-dragging" : ""}`}>
          <div className="image-bed-upload-copy">
            <span>{config?.hasToken ? t("imageBed.titleReady") : t("imageBed.titleSetup")}</span>
            <h2>{t("imageBed.subtitle")}</h2>
            <p>{t("imageBed.description", { repo: config?.repository || t("imageBed.defaultRepo"), path: config?.pathPrefix || t("imageBed.defaultPath") })}</p>
          </div>

          <div
            className={`upload-dropzone ${dragging ? "is-dragging" : ""} ${config?.hasToken ? "" : "is-disabled"}`}
            role="button"
            tabIndex={0}
            onClick={() => {
              if (!config?.hasToken) {
                setMessage(t("imageBed.pleaseSaveTokenFirst"));
                return;
              }
              if (fileInputRef.current) {
                fileInputRef.current.value = "";
                fileInputRef.current.click();
              }
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                if (!config?.hasToken) {
                  setMessage(t("imageBed.pleaseSaveTokenFirst"));
                  return;
                }
                if (fileInputRef.current) {
                  fileInputRef.current.value = "";
                  fileInputRef.current.click();
                }
              }
            }}
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              void handleFiles(event.dataTransfer.files);
            }}
          >
            <input ref={fileInputRef} className="upload-dropzone-input" type="file" accept="image/*" multiple onChange={handlePickFiles} />
            <div className="upload-dropzone-icon">
              <Upload size={22} />
            </div>
            <strong>{t("imageBed.dropzoneTitle")}</strong>
            <span>{config?.hasToken ? t("imageBed.dropzoneReady") : t("imageBed.dropzoneDisabled")}</span>
          </div>

          {uploadProgress ? (
            <div className="upload-progress-block" aria-live="polite">
              <div className="upload-progress-head">
                <strong>{uploadProgress.phase === "reading" ? t("imageBed.progress.reading") : t("imageBed.progress.uploading")}</strong>
                <span>
                  {uploadProgress.fileIndex}/{uploadProgress.totalFiles} · {uploadProgress.fileName}
                </span>
              </div>
              <div className="upload-progress-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(uploadProgress.percent)}>
                <div className="upload-progress-fill" style={{ width: `${Math.max(4, Math.min(100, uploadProgress.percent))}%` }} />
              </div>
            </div>
          ) : latestHistory ? (
            <div className="image-bed-latest">
              <button type="button" className="image-bed-latest-preview" onClick={() => void copyUrl(latestHistory.url)} title={t("imageBed.copyTitle")}>
                <img loading="lazy" decoding="async" src={latestHistory.previewUrl} alt={latestHistory.filename} />
              </button>
              <div className="image-bed-latest-info">
                <span>{t("imageBed.latest")}</span>
                <strong>{latestHistory.filename}</strong>
                <code>{latestHistory.url}</code>
              </div>
              <button className="btn-primary" type="button" onClick={() => void copyUrl(latestHistory.url)}>
                <Copy size={16} />
                {t("imageBed.copyLink")}
              </button>
            </div>
          ) : (
            <div className="image-bed-upload-note">{message}</div>
          )}
        </section>

        <aside className="image-bed-side-stack">
          <section className="image-bed-side-card">
            <div className="image-bed-section-head">
              <h4>{t("imageBed.connection.title")}</h4>
              <span className={`image-bed-status-dot ${connection ? "is-ok" : config?.hasToken ? "is-warn" : ""}`} />
            </div>
            <strong className="image-bed-connection-label">{connectionLabel}</strong>
            <p>{message}</p>
          </section>

          <section className="image-bed-side-card">
            <div className="image-bed-section-head">
              <h4>{t("imageBed.tokenSection.title")}</h4>
              {!tokenEditing && config?.hasToken && (
                <button className="image-bed-link-button" type="button" onClick={() => void startEditing()}>
                  {t("imageBed.tokenSection.edit")}
                </button>
              )}
            </div>
            {tokenEditing || !config?.hasToken ? (
              <>
                <label className="field">
                  <span>{t("imageBed.tokenSection.tokenName")}</span>
                  <input
                    className="input"
                    value={tokenDraft}
                    onChange={(event) => setTokenDraft(event.target.value)}
                    placeholder={t("imageBed.tokenSection.placeholder")}
                    spellCheck={false}
                    autoComplete="off"
                  />
                  <p className="image-bed-token-hint">{t("imageBed.tokenSection.hint", { repo: config?.repository || t("imageBed.defaultRepo") })}</p>
                </label>
                <div className="image-bed-token-actions">
                  <button className="btn-primary" type="button" onClick={() => void saveToken()} disabled={activeBusy || !tokenDraft.trim()}>
                    {props.busy === "image-bed-save" ? <Loader2 className="spin" size={16} /> : <CheckCircle2 size={16} />}
                    {t("imageBed.tokenSection.saveAndVerify")}
                  </button>
                  <button className="btn-secondary" type="button" onClick={clearToken} disabled={!config?.hasToken}>
                    <Trash2 size={16} />
                    {t("imageBed.tokenSection.clear")}
                  </button>
                </div>
              </>
            ) : (
              <div className="image-bed-token-summary">
                <div>
                  <span>{t("imageBed.tokenSection.savedLabel")}</span>
                  <strong>{t("imageBed.tokenSection.tokenName")}</strong>
                </div>
                <button className="btn-secondary icon-only" type="button" onClick={clearToken} title={t("imageBed.tokenSection.clearTitle")}>
                  <Trash2 size={16} />
                </button>
              </div>
            )}
          </section>

          <section className="image-bed-side-card image-bed-target-card">
            <h4>{t("imageBed.target.title")}</h4>
            <div className="image-bed-target-list">
              <div>
                <span>{t("imageBed.target.repo")}</span>
                <strong>{config?.repository || t("imageBed.defaultRepo")}</strong>
              </div>
              <div>
                <span>{t("imageBed.target.branch")}</span>
                <strong>{config?.defaultBranch || t("imageBed.target.defaultBranch")}</strong>
              </div>
              <div>
                <span>{t("imageBed.target.path")}</span>
                <strong>{config?.pathPrefix || t("imageBed.defaultPath")}</strong>
              </div>
            </div>
          </section>
        </aside>
      </div>

      <section className="image-bed-gallery-section">
        <div className="image-bed-section-head">
          <div>
            <h4>{t("imageBed.gallery.title")}</h4>
            <p>{t("imageBed.gallery.description")}</p>
          </div>
          <button className="btn-secondary icon-only" type="button" onClick={() => void clearHistory()} disabled={history.length === 0} title={t("imageBed.gallery.clearTitle")}>
            <Trash2 size={16} />
          </button>
        </div>
        {history.length === 0 ? (
          <div className="image-bed-empty">{t("imageBed.gallery.empty")}</div>
        ) : (
          <div className="image-bed-results-grid">
            {visibleHistory.map((item) => (
              <figure className="image-bed-result-card" key={item.path}>
                <button type="button" className="image-bed-preview-button" onClick={() => void copyUrl(item.url)} title={t("imageBed.copyTitle")}>
                  <img loading="lazy" decoding="async" src={item.previewUrl} alt={item.filename} />
                </button>
                <figcaption>
                  <strong>{item.filename}</strong>
                  <span>
                    {formatFileSize(item.size)} · {item.mimeType}
                  </span>
                  <code>{formatFullTime(item.createdAt, locale)}</code>
                </figcaption>
                <div className="image-bed-result-actions">
                  <button className="image-bed-card-action" type="button" onClick={() => void copyUrl(item.url)} title={t("imageBed.gallery.copyLinkTitle")} aria-label={t("imageBed.gallery.copyLinkAria")}>
                    <Copy size={15} />
                  </button>
                  <a className="image-bed-card-action" href={item.url} target="_blank" rel="noreferrer" title={t("imageBed.gallery.openOriginalTitle")} aria-label={t("imageBed.gallery.openOriginalAria")}>
                    <Link2 size={15} />
                  </a>
                  <button
                    className="image-bed-card-action is-danger"
                    type="button"
                    onClick={() => void deleteHistoryItem(item)}
                    title={t("imageBed.gallery.deleteTitle")}
                    aria-label={t("imageBed.gallery.deleteAria")}
                    disabled={deletingHistoryId === item.id}
                  >
                    {deletingHistoryId === item.id ? <Loader2 className="spin" size={15} /> : <Trash2 size={15} />}
                  </button>
                </div>
              </figure>
            ))}
          </div>
        )}
        {history.length > visibleHistoryCount && (
          <button className="btn-secondary image-bed-load-more" type="button" onClick={() => setVisibleHistoryCount((current) => Math.min(current + 12, history.length))}>
            <ChevronDown size={16} />
            {t("imageBed.gallery.loadMore")}
          </button>
        )}
      </section>

      <details className="image-bed-help-section">
        <summary>{t("imageBed.help.summary")}</summary>
        <p className="image-bed-help-intro">
          {t("imageBed.help.intro", { repo: t("imageBed.defaultRepo"), path: t("imageBed.defaultPath") })}
        </p>
        <ol className="image-bed-steps">
          <li>
            <strong>{t("imageBed.help.step1Title")}</strong> {t("imageBed.help.step1Body", { repo: t("imageBed.defaultRepo") })}
          </li>
          <li>
            <strong>{t("imageBed.help.step2Title")}</strong> {t("imageBed.help.step2BodyPrefix")}<a href="https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens" target="_blank" rel="noreferrer">{t("imageBed.help.step2LinkText")}</a>{t("imageBed.help.step2BodySuffix")}
          </li>
          <li>
            <strong>{t("imageBed.help.step3Title")}</strong> {t("imageBed.help.step3Body", { tokenName: t("imageBed.help.tokenName"), repo: t("imageBed.defaultRepo") })}
          </li>
          <li>
            <strong>{t("imageBed.help.step4Title")}</strong> {t("imageBed.help.step4Body")}
          </li>
          <li>
            <strong>{t("imageBed.help.step5Title")}</strong> {t("imageBed.help.step5Body")}
          </li>
        </ol>
        <dl className="image-bed-help-facts">
          <div>
            <dt>{t("imageBed.help.factTokenTitle")}</dt>
            <dd>{t("imageBed.help.factTokenBody")}</dd>
          </div>
          <div>
            <dt>{t("imageBed.help.factVerifyTitle")}</dt>
            <dd>{t("imageBed.help.factVerifyBody", { repo: t("imageBed.defaultRepo") })}</dd>
          </div>
        </dl>
        <p className="hint">{t("imageBed.help.hint")}</p>
      </details>
    </section>
  );
}
