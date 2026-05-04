import { Copy, Loader2, RotateCcw, Upload, Zap } from "lucide-react";
import { ChangeEvent } from "react";
import type { AdminConfig, SupportedEndpoint } from "@/shared/types";
import type { BusyAction, PreviewImage, ResultTab } from "@/shared/lib/app-types";
import { endpointOrder, tabLabels } from "@/shared/lib/endpoints";

export function TesterPanel(props: {
  config: AdminConfig | null;
  endpoints: SupportedEndpoint[];
  activeEndpoint: SupportedEndpoint;
  endpoint: string;
  requestBody: string;
  responseBody: string;
  timingBody: string;
  resultTab: ResultTab;
  status: string;
  busy: BusyAction;
  previewImages: PreviewImage[];
  capability: { ok: boolean; detail: string };
  onEndpoint: (endpoint: string) => void;
  onRequestBody: (value: string) => void;
  onResultTab: (tab: ResultTab) => void;
  onRun: () => void;
  onResetExample: () => void;
  onCopyRequest: () => void;
  onCopyResponse: () => void;
  onCopyTiming: () => void;
  onPreview: (value: { src: string; meta: string; filename?: string }) => void;
  onImageUpload: (file: File) => Promise<void>;
}) {
  const isImageEndpoint = props.endpoint.startsWith("/v1/images/");
  function handleImageUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    props.onImageUpload(file).catch(() => undefined);
  }

  return (
    <section className="card tester-card" id="tester">
      <div className="section-head compact">
        <div>
          <h2>快速测试</h2>
          <p>页面直接调用当前网关暴露的 OpenAI 风格接口。</p>
        </div>
        <span className="badge brand">{props.busy === "test" ? "请求中" : "准备就绪"}</span>
      </div>

      <div className="tester-tabs">
        {props.endpoints.map((item) => (
          <button className={`tab-btn ${props.endpoint === item.path ? "is-active" : ""}`} key={item.path} type="button" onClick={() => props.onEndpoint(item.path)}>
            {tabLabels[item.path] || item.path}
          </button>
        ))}
      </div>

      <div className="tester-workbench">
        <div className="tester-pane tester-request-pane">
          <label className="field">
            <span>接口</span>
            <select className="control" value={props.endpoint} onChange={(event) => props.onEndpoint(event.target.value)}>
              {props.endpoints.map((item) => (
                <option key={item.path} value={item.path}>
                  {item.method} {item.path}
                </option>
              ))}
            </select>
          </label>

          <div className="tester-copy-row tester-copy-row-top">
            <button className="btn-secondary" type="button" onClick={props.onCopyRequest}>
              <Copy size={16} />
              复制请求
            </button>
            <button className="btn-secondary" type="button" onClick={props.onCopyResponse}>
              <Copy size={16} />
              复制响应
            </button>
            <button className="btn-secondary" type="button" onClick={props.onCopyTiming}>
              <Copy size={16} />
              复制日志
            </button>
            <button className="btn-secondary" type="button" onClick={props.onResetExample}>
              <RotateCcw size={16} />
              重置示例
            </button>
          </div>

          <label className="field tester-body-field">
            <span>请求体 JSON</span>
            <textarea className="textarea tester-textarea" value={props.requestBody} onChange={(event) => props.onRequestBody(event.target.value)} disabled={props.activeEndpoint.method === "GET"} spellCheck={false} />
          </label>
          {props.endpoint === "/v1/images/edits" && (
            <div className="edit-upload-row">
              <label className="btn-secondary upload-btn" title="上传图片并写入 images[0].image_url">
                <Upload size={16} />
                上传图片写入 Body
                <input type="file" accept="image/*" onChange={handleImageUpload} />
              </label>
              <span>目标字段：images[0].image_url</span>
            </div>
          )}
          <p className="hint">{isImageEndpoint ? props.capability.detail : props.activeEndpoint.description || "GET /v1/models 无需请求体。"}</p>

          <div className="tester-actions-bar">
            <div className="tester-actions-group">
              <div className="example-row">
                {endpointOrder.map((path) => (
                  <button className="btn-secondary" key={path} type="button" onClick={() => props.onEndpoint(path)} disabled={!props.endpoints.some((item) => item.path === path)}>
                    示例 {tabLabels[path] || path}
                  </button>
                ))}
              </div>
            </div>
            <button className="btn-primary" type="button" onClick={props.onRun} disabled={props.busy === "test" || (isImageEndpoint && !props.config?.profile)}>
              {props.busy === "test" ? <Loader2 className="spin" size={16} /> : <Zap size={16} />}
              发送请求
            </button>
          </div>
        </div>

        <div className="tester-pane tester-response-pane">
          <div className="tester-result-head">
            <div className="tester-result-tabs">
              <button className={`tab-btn ${props.resultTab === "response" ? "is-active" : ""}`} type="button" onClick={() => props.onResultTab("response")}>
                响应 JSON
              </button>
              <button className={`tab-btn ${props.resultTab === "timing" ? "is-active" : ""}`} type="button" onClick={() => props.onResultTab("timing")}>
                耗时日志
              </button>
              <button className={`tab-btn ${props.resultTab === "preview" ? "is-active" : ""}`} type="button" onClick={() => props.onResultTab("preview")}>
                图片预览
              </button>
            </div>
            <p className="status-inline">{props.status}</p>
          </div>

          {props.resultTab === "response" && <pre className="pre">{props.responseBody}</pre>}
          {props.resultTab === "timing" && <pre className="pre">{props.timingBody}</pre>}
          {props.resultTab === "preview" && (
            <div className="preview-panel">
              {props.previewImages.length === 0 ? (
                <div className="preview-empty">图片结果会显示在这里。点击缩略图可查看大图。</div>
              ) : (
                <div className="preview-grid">
                  {props.previewImages.map((image) => (
                    <figure className="preview-card" key={image.filename}>
                      <button type="button" onClick={() => props.onPreview({ src: image.src, meta: image.meta, filename: image.filename })}>
                        <img src={image.src} alt={image.meta} />
                      </button>
                      <figcaption>{image.meta}</figcaption>
                      <div className="preview-actions">
                        <a href={image.src} download={image.filename}>
                          下载
                        </a>
                      </div>
                    </figure>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
