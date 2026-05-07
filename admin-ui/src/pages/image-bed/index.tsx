import { CheckCircle2, ChevronDown, Copy, Link2, Loader2, Pencil, Trash2, Upload } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { fetchJson } from "@/shared/api";
import type { BusyAction } from "@/shared/lib/app-types";
import { copyText, errorMessage, readFileAsDataUrl } from "@/shared/lib/app-utils";
import { formatFileSize, formatFullTime } from "@/shared/lib/format";

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

function buildConnectionLabel(connection: GithubImageBedConnection | null, config: GithubImageBedConfig | null): string {
  if (connection) {
    return `${connection.owner}/${connection.repository} · ${connection.branch}`;
  }
  if (!config?.hasToken) {
    return "尚未保存 token";
  }
  return "已保存，待验证";
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
    xhr.onerror = () => reject(new Error("上传请求失败。"));
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
        reject(new Error("上传响应解析失败。"));
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
  const [message, setMessage] = useState("正在读取图床配置...");
  const [dragging, setDragging] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null);
  const [deletingHistoryId, setDeletingHistoryId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const connectionLabel = useMemo(() => buildConnectionLabel(connection, config), [connection, config]);
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
        setMessage(next.hasToken ? "GitHub token 已保存，正在验证连接..." : "请先保存一个 GitHub token。");
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
      setMessage(`已连接到 ${result.owner}/${result.repository}，默认分支 ${result.branch}。`);
      props.setStatus(`图床连接正常：${result.owner}/${result.repository}`);
      return result;
    } catch (error) {
      const text = errorMessage(error);
      setConnection(null);
      setMessage(`连接失败: ${text}`);
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
      setMessage("请先填写 GitHub token。");
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
      setMessage("GitHub token 已保存，正在验证...");
      props.setStatus("GitHub token 已保存。");
      try {
        await validateConnection(false);
        setMessage("GitHub token 已保存并验证。");
      } catch (error) {
        setTokenEditing(true);
        setMessage(`已保存，但验证失败: ${errorMessage(error)}`);
      }
    } catch (error) {
      const text = errorMessage(error);
      setMessage(`保存失败: ${text}`);
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
      setMessage("GitHub token 已清除。");
      props.setStatus("GitHub token 已清除。");
    } catch (error) {
      const text = errorMessage(error);
      setMessage(`清除失败: ${text}`);
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
      throw new Error(`文件 ${file.name} 不是图片。`);
    }

    return uploadFileWithProgress(file, progressCb);
  }

  async function handleFiles(fileList: FileList | File[]) {
    const files = Array.from(fileList).filter((file) => file.type.startsWith("image/"));
    if (files.length === 0) {
      setMessage("请选择图片文件。");
      return;
    }
    if (!config?.hasToken) {
      setMessage("请先保存 GitHub token，再上传图片。");
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
        setMessage(`正在读取 ${index + 1}/${files.length}: ${file.name}`);
        props.setStatus(`正在读取 ${index + 1}/${files.length}: ${file.name}`);
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
      setMessage(`已上传 ${files.length} 张图片。`);
      props.setStatus(`已上传 ${files.length} 张图片。`);
      await refreshHistory();
    } catch (error) {
      const text = errorMessage(error);
      setMessage(`上传失败: ${text}`);
      props.setStatus(text);
    } finally {
      setUploadProgress(null);
      props.setBusy(null);
    }
  }

  async function copyUrl(url: string) {
    const ok = await copyText(url);
    const text = ok ? "链接已复制。" : "链接复制失败。";
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
    setMessage("历史记录已清空。");
    props.setStatus("历史记录已清空。");
  }

  async function deleteHistoryItem(item: GithubImageBedHistoryItem) {
    const confirmed = window.confirm(`确认从 GitHub 仓库删除 ${item.filename} 吗？删除后原链接会失效。`);
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
      setMessage(`已删除 ${item.filename}。`);
      props.setStatus(`已从图床删除 ${item.filename}。`);
    } catch (error) {
      const text = errorMessage(error);
      setMessage(`删除失败: ${text}`);
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
            <span>{config?.hasToken ? "GitHub 图床已准备" : "先配置 GitHub token"}</span>
            <h2>拖入图片，直接拿公网链接</h2>
            <p>文件会写入公开仓库 <strong>{config?.repository || "azt-img-bed"}</strong> 的 <strong>{config?.pathPrefix || "images"}</strong> 目录，上传结果会保存在本机历史里。</p>
          </div>

          <div
            className={`upload-dropzone ${dragging ? "is-dragging" : ""} ${config?.hasToken ? "" : "is-disabled"}`}
            role="button"
            tabIndex={0}
            onClick={() => {
              if (!config?.hasToken) {
                setMessage("请先保存 GitHub token，再上传图片。");
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
                  setMessage("请先保存 GitHub token，再上传图片。");
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
            <strong>选择图片或拖拽到这里</strong>
            <span>{config?.hasToken ? "支持批量上传，完成后自动生成可访问链接。" : "保存并验证 token 后即可上传。"}</span>
          </div>

          {uploadProgress ? (
            <div className="upload-progress-block" aria-live="polite">
              <div className="upload-progress-head">
                <strong>{uploadProgress.phase === "reading" ? "正在读取" : "正在上传"}</strong>
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
              <button type="button" className="image-bed-latest-preview" onClick={() => void copyUrl(latestHistory.url)} title="点击复制链接">
                <img loading="lazy" decoding="async" src={latestHistory.previewUrl} alt={latestHistory.filename} />
              </button>
              <div className="image-bed-latest-info">
                <span>最近上传</span>
                <strong>{latestHistory.filename}</strong>
                <code>{latestHistory.url}</code>
              </div>
              <button className="btn-primary" type="button" onClick={() => void copyUrl(latestHistory.url)}>
                <Copy size={16} />
                复制链接
              </button>
            </div>
          ) : (
            <div className="image-bed-upload-note">{message}</div>
          )}
        </section>

        <aside className="image-bed-side-stack">
          <section className="image-bed-side-card">
            <div className="image-bed-section-head">
              <h4>连接</h4>
              <span className={`image-bed-status-dot ${connection ? "is-ok" : config?.hasToken ? "is-warn" : ""}`} />
            </div>
            <strong className="image-bed-connection-label">{connectionLabel}</strong>
            <p>{message}</p>
          </section>

          <section className="image-bed-side-card">
            <div className="image-bed-section-head">
              <h4>Token</h4>
              {!tokenEditing && config?.hasToken && (
                <button className="image-bed-link-button" type="button" onClick={() => void startEditing()}>
                  修改
                </button>
              )}
            </div>
            {tokenEditing || !config?.hasToken ? (
              <>
                <label className="field">
                  <span>GitHub token</span>
                  <input
                    className="input"
                    value={tokenDraft}
                    onChange={(event) => setTokenDraft(event.target.value)}
                    placeholder="github_pat_..."
                    spellCheck={false}
                    autoComplete="off"
                  />
                  <p className="image-bed-token-hint">推荐使用 fine-grained token，只给公开仓库 <code>azt-img-bed</code> 的 Contents 读写权限。</p>
                </label>
                <div className="image-bed-token-actions">
                  <button className="btn-primary" type="button" onClick={() => void saveToken()} disabled={activeBusy || !tokenDraft.trim()}>
                    {props.busy === "image-bed-save" ? <Loader2 className="spin" size={16} /> : <CheckCircle2 size={16} />}
                    保存并验证
                  </button>
                  <button className="btn-secondary" type="button" onClick={clearToken} disabled={!config?.hasToken}>
                    <Trash2 size={16} />
                    清除
                  </button>
                </div>
              </>
            ) : (
              <div className="image-bed-token-summary">
                <div>
                  <span>已保存到本机</span>
                  <strong>GitHub token</strong>
                </div>
                <button className="btn-secondary icon-only" type="button" onClick={clearToken} title="清除 Token">
                  <Trash2 size={16} />
                </button>
              </div>
            )}
          </section>

          <section className="image-bed-side-card image-bed-target-card">
            <h4>目标</h4>
            <div className="image-bed-target-list">
              <div>
                <span>仓库</span>
                <strong>{config?.repository || "azt-img-bed"}</strong>
              </div>
              <div>
                <span>分支</span>
                <strong>{config?.defaultBranch || "auto"}</strong>
              </div>
              <div>
                <span>目录</span>
                <strong>{config?.pathPrefix || "images"}</strong>
              </div>
            </div>
          </section>
        </aside>
      </div>

      <section className="image-bed-gallery-section">
        <div className="image-bed-section-head">
          <div>
            <h4>上传历史</h4>
            <p>本机保存最近 100 条，只加载当前可见缩略图。</p>
          </div>
          <button className="btn-secondary icon-only" type="button" onClick={() => void clearHistory()} disabled={history.length === 0} title="清空历史">
            <Trash2 size={16} />
          </button>
        </div>
        {history.length === 0 ? (
          <div className="image-bed-empty">还没有上传记录。上传完成后，这里会以图库形式展示预览和链接。</div>
        ) : (
          <div className="image-bed-results-grid">
            {visibleHistory.map((item) => (
              <figure className="image-bed-result-card" key={item.path}>
                <button type="button" className="image-bed-preview-button" onClick={() => void copyUrl(item.url)} title="点击复制链接">
                  <img loading="lazy" decoding="async" src={item.previewUrl} alt={item.filename} />
                </button>
                <figcaption>
                  <strong>{item.filename}</strong>
                  <span>
                    {formatFileSize(item.size)} · {item.mimeType}
                  </span>
                  <code>{formatFullTime(item.createdAt)}</code>
                </figcaption>
                <div className="image-bed-result-actions">
                  <button className="image-bed-card-action" type="button" onClick={() => void copyUrl(item.url)} title="复制链接" aria-label="复制链接">
                    <Copy size={15} />
                  </button>
                  <a className="image-bed-card-action" href={item.url} target="_blank" rel="noreferrer" title="打开原图" aria-label="打开原图">
                    <Link2 size={15} />
                  </a>
                  <button
                    className="image-bed-card-action is-danger"
                    type="button"
                    onClick={() => void deleteHistoryItem(item)}
                    title="删除图床文件"
                    aria-label="删除图床文件"
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
            加载更多
          </button>
        )}
      </section>

      <details className="image-bed-help-section">
        <summary>GitHub token 创建说明</summary>
        <p className="image-bed-help-intro">
          这个图床固定使用当前 GitHub 账号下的公开仓库 <code>azt-img-bed</code>，图片会写入 <code>images</code> 目录并返回 raw.githubusercontent.com 原图链接。
        </p>
        <ol className="image-bed-steps">
          <li>
            <strong>先建公开仓库。</strong> 在 GitHub 新建仓库 <code>azt-img-bed</code>，Visibility 选 <strong>Public</strong>。如果仓库已经存在，确认它属于这个 token 对应的个人账号，并且不是 Private。
          </li>
          <li>
            <strong>创建 fine-grained token。</strong> 打开 GitHub 的 <a href="https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens" target="_blank" rel="noreferrer">Personal access tokens</a> 页面，选择 <strong>Fine-grained tokens</strong>，点 <strong>Generate new token</strong>。
          </li>
          <li>
            <strong>限制仓库范围。</strong> Token name 可填 <code>AI Zero Token image bed</code>，Expiration 按需设置，Resource owner 选自己的账号；Repository access 选择 <strong>Only select repositories</strong>，只勾选 <code>azt-img-bed</code>。
          </li>
          <li>
            <strong>给最小权限。</strong> 在 Repository permissions 里把 <strong>Contents</strong> 设置为 <strong>Read and write</strong>；<strong>Metadata</strong> 保持默认 Read-only 即可，其它权限不需要打开。
          </li>
          <li>
            <strong>复制并验证。</strong> GitHub 只会展示一次生成后的 token，复制后回到这里粘贴，点击 <strong>保存并验证</strong>。验证通过后就可以拖图上传。
          </li>
        </ol>
        <dl className="image-bed-help-facts">
          <div>
            <dt>Token 格式</dt>
            <dd>fine-grained token 通常以 <code>github_pat_</code> 开头。</dd>
          </div>
          <div>
            <dt>验证失败</dt>
            <dd>如果提示未找到仓库，优先检查仓库名是否为 <code>azt-img-bed</code>、仓库是否 Public、Repository access 是否选中了这个仓库。</dd>
          </div>
        </dl>
        <p className="hint">Token 要像密码一样保管，不要发给别人。这个页面只会把它保存到你本机状态目录。</p>
      </details>
    </section>
  );
}
