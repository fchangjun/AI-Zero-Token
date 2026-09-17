import { Copy, Loader2, RotateCcw, Upload, Zap } from "lucide-react";
import { ChangeEvent } from "react";
import type { AdminConfig, SupportedEndpoint } from "@/shared/types";
import type { BusyAction, PreviewImage, ResultTab } from "@/shared/lib/app-types";
import { endpointOrder, tabLabels } from "@/shared/lib/endpoints";
import type { EditImageUploadMode } from "../index";
import { useT } from "@/i18n";

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
  imageUploadMode: EditImageUploadMode;
  onEndpoint: (endpoint: string) => void;
  onRequestBody: (value: string) => void;
  onResultTab: (tab: ResultTab) => void;
  onRun: () => void;
  onResetExample: () => void;
  onCopyRequest: () => void;
  onCopyResponse: () => void;
  onCopyTiming: () => void;
  onImageUploadMode: (mode: EditImageUploadMode) => void;
  onPreview: (value: { src: string; meta: string; filename?: string }) => void;
  onImageUpload: (file: File, mode: EditImageUploadMode) => Promise<void>;
}) {
  const t = useT();
  const isImageEndpoint = props.endpoint.startsWith("/v1/images/");
  function handleImageUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    props.onImageUpload(file, props.imageUploadMode).catch(() => undefined);
  }

  return (
    <section className="card tester-card" id="tester">
      <div className="section-head compact">
        <div>
          <h2>{t("testerPanel.title")}</h2>
          <p>{t("testerPanel.description")}</p>
        </div>
        <span className="badge brand">{props.busy === "test" ? t("testerPanel.badgeBusy") : t("testerPanel.badgeReady")}</span>
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
            <span>{t("testerPanel.endpointLabel")}</span>
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
              {t("testerPanel.copyRequest")}
            </button>
            <button className="btn-secondary" type="button" onClick={props.onCopyResponse}>
              <Copy size={16} />
              {t("testerPanel.copyResponse")}
            </button>
            <button className="btn-secondary" type="button" onClick={props.onCopyTiming}>
              <Copy size={16} />
              {t("testerPanel.copyTiming")}
            </button>
            <button className="btn-secondary" type="button" onClick={props.onResetExample}>
              <RotateCcw size={16} />
              {t("testerPanel.resetExample")}
            </button>
          </div>

          <label className="field tester-body-field">
            <span>{t("testerPanel.requestBodyLabel")}</span>
            <textarea className="textarea tester-textarea" value={props.requestBody} onChange={(event) => props.onRequestBody(event.target.value)} disabled={props.activeEndpoint.method === "GET"} spellCheck={false} />
          </label>
          {props.endpoint === "/v1/images/edits" && (
            <div className="edit-upload-row">
              <div className="edit-upload-mode" role="group" aria-label={t("testerPanel.uploadModeAria")}>
                <span>{t("testerPanel.uploadModeLabel")}</span>
                <div className="edit-upload-toggle">
                  <button className={`tab-btn ${props.imageUploadMode === "base64" ? "is-active" : ""}`} type="button" onClick={() => props.onImageUploadMode("base64")}>
                    Base64
                  </button>
                  <button className={`tab-btn ${props.imageUploadMode === "image-bed" ? "is-active" : ""}`} type="button" onClick={() => props.onImageUploadMode("image-bed")}>
                    {t("testerPanel.uploadModeImageBed")}
                  </button>
                </div>
              </div>
              <label className="btn-secondary upload-btn" title={props.imageUploadMode === "base64" ? t("testerPanel.uploadBase64Title") : t("testerPanel.uploadImageBedTitle")}>
                {props.imageUploadMode === "image-bed" && props.busy === "image-bed-upload" ? <Loader2 className="spin" size={16} /> : <Upload size={16} />}
                {props.imageUploadMode === "base64" ? t("testerPanel.uploadBase64") : t("testerPanel.uploadImageBed")}
                <input type="file" accept="image/*" onChange={handleImageUpload} />
              </label>
              <span>{t("testerPanel.targetField")} · {props.imageUploadMode === "base64" ? t("testerPanel.targetBase64") : t("testerPanel.targetImageBed")}</span>
            </div>
          )}
          <p className="hint">{isImageEndpoint ? props.capability.detail : props.activeEndpoint.description || t("testerPanel.getModelsNoBody")}</p>

          <div className="tester-actions-bar">
            <div className="tester-actions-group">
              <div className="example-row">
                {endpointOrder.map((path) => (
                  <button className="btn-secondary" key={path} type="button" onClick={() => props.onEndpoint(path)} disabled={!props.endpoints.some((item) => item.path === path)}>
                    {t("testerPanel.examplePrefix")} {tabLabels[path] || path}
                  </button>
                ))}
              </div>
            </div>
            <button className="btn-primary" type="button" onClick={props.onRun} disabled={props.busy === "test" || (isImageEndpoint && !props.config?.profile)}>
              {props.busy === "test" ? <Loader2 className="spin" size={16} /> : <Zap size={16} />}
              {t("testerPanel.run")}
            </button>
          </div>
        </div>

        <div className="tester-pane tester-response-pane">
          <div className="tester-result-head">
            <div className="tester-result-tabs">
              <button className={`tab-btn ${props.resultTab === "response" ? "is-active" : ""}`} type="button" onClick={() => props.onResultTab("response")}>
                {t("testerPanel.tabResponse")}
              </button>
              <button className={`tab-btn ${props.resultTab === "timing" ? "is-active" : ""}`} type="button" onClick={() => props.onResultTab("timing")}>
                {t("testerPanel.tabTiming")}
              </button>
              <button className={`tab-btn ${props.resultTab === "preview" ? "is-active" : ""}`} type="button" onClick={() => props.onResultTab("preview")}>
                {t("testerPanel.tabPreview")}
              </button>
            </div>
            <p className="status-inline">{props.status}</p>
          </div>

          {props.resultTab === "response" && <pre className="pre">{props.responseBody}</pre>}
          {props.resultTab === "timing" && <pre className="pre">{props.timingBody}</pre>}
          {props.resultTab === "preview" && (
            <div className="preview-panel">
              {props.previewImages.length === 0 ? (
                <div className="preview-empty">{t("testerPanel.previewEmpty")}</div>
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
                          {t("testerPanel.previewDownload")}
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
