import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { fetchJson } from "@/shared/api";
import type { AdminConfig, RequestLog } from "@/shared/types";
import type { BusyAction, PreviewImage, ResultTab } from "@/shared/lib/app-types";
import { buildExample, copyText, errorMessage, extractPreviewImages, insertEditImageIntoBody, readFileAsDataUrl, summarizeJson } from "@/shared/lib/app-utils";
import { endpointOrder, endpointSort } from "@/shared/lib/endpoints";
import { formatDuration, formatFileSize, formatJson } from "@/shared/lib/format";
import { profileLabel } from "@/shared/lib/profiles";
import { TesterPanel } from "./components/TesterPanel";
import type { ModalImage } from "@/hooks/useAdminWorkspace";

export type EditImageUploadMode = "base64" | "image-bed";

type GithubImageBedUploadResult = {
  filename: string;
  url: string;
  htmlUrl: string;
  downloadUrl: string;
  size: number;
};

export function TesterPage(props: {
  config: AdminConfig | null;
  status: string;
  busy: BusyAction;
  showEmails: boolean;
  capability: { ok: boolean; detail: string };
  setBusy: Dispatch<SetStateAction<BusyAction>>;
  setStatus: Dispatch<SetStateAction<string>>;
  setRequestLogs: Dispatch<SetStateAction<RequestLog[]>>;
  refreshConfig: (options?: { runtime?: boolean; silent?: boolean }) => Promise<AdminConfig>;
  setPreviewImage: Dispatch<SetStateAction<ModalImage | null>>;
}) {
  const [endpoint, setEndpoint] = useState("/v1/models");
  const [requestBody, setRequestBody] = useState("");
  const [responseBody, setResponseBody] = useState("等待请求...");
  const [timingBody, setTimingBody] = useState("等待请求...");
  const [resultTab, setResultTab] = useState<ResultTab>("response");
  const [previewImages, setPreviewImages] = useState<PreviewImage[]>([]);
  const [imageUploadMode, setImageUploadMode] = useState<EditImageUploadMode>("base64");

  const endpoints = useMemo(
    () => [...(props.config?.supportedEndpoints || [])].filter((item) => endpointOrder.includes(item.path)).sort(endpointSort),
    [props.config?.supportedEndpoints],
  );
  const activeEndpoint = useMemo(
    () => endpoints.find((item) => item.path === endpoint) || endpoints[0] || { method: "GET", path: "/v1/models", description: "" },
    [endpoint, endpoints],
  );

  useEffect(() => {
    if (!props.config) {
      return;
    }
    const fallback = endpointOrder.find((item) => props.config?.supportedEndpoints.some((endpointItem) => endpointItem.path === item));
    const nextEndpoint = props.config.supportedEndpoints.some((item) => item.path === endpoint) ? endpoint : fallback || "/v1/models";
    setEndpoint(nextEndpoint);
    setRequestBody(buildExample(nextEndpoint, props.config.settings.defaultModel));
  }, [props.config]);

  function changeEndpoint(nextEndpoint: string) {
    setEndpoint(nextEndpoint);
    setRequestBody(buildExample(nextEndpoint, props.config?.settings.defaultModel || "gpt-5.4"));
    setPreviewImages([]);
  }

  function resetExample() {
    changeEndpoint(endpoint);
  }

  function copyRequest() {
    copyText(requestBody || buildExample(endpoint, props.config?.settings.defaultModel || "gpt-5.4"))
      .then((ok) => props.setStatus(ok ? "请求体已复制。" : "请求体复制失败。"))
      .catch(() => props.setStatus("请求体复制失败。"));
  }

  function copyResponse() {
    copyText(responseBody)
      .then((ok) => props.setStatus(ok ? "响应内容已复制。" : "响应内容复制失败。"))
      .catch(() => props.setStatus("响应内容复制失败。"));
  }

  function copyTiming() {
    copyText(timingBody)
      .then((ok) => props.setStatus(ok ? "耗时日志已复制。" : "耗时日志复制失败。"))
      .catch(() => props.setStatus("耗时日志复制失败。"));
  }

  async function runTest() {
    const meta = activeEndpoint;
    const startedAt = performance.now();
    const phases: string[] = [];
    props.setBusy("test");
    setResultTab("response");
    setResponseBody("请求发送中...");
    setTimingBody("请求发送中...");
    setPreviewImages([]);
    try {
      let payload: unknown = null;
      const options: RequestInit = { method: meta.method, headers: {} };
      if (meta.method !== "GET") {
        const parseStarted = performance.now();
        payload = requestBody.trim() ? JSON.parse(requestBody) : {};
        phases.push(`解析请求体: ${formatDuration(performance.now() - parseStarted)}`);
        (options.headers as Record<string, string>)["Content-Type"] = "application/json";
        options.body = formatJson(payload);
      }
      const fetchStarted = performance.now();
      const response = await fetch(meta.path, options);
      phases.push(`等待响应头: ${formatDuration(performance.now() - fetchStarted)}`);
      const readStarted = performance.now();
      const text = await response.text();
      phases.push(`读取响应体: ${formatDuration(performance.now() - readStarted)}`);
      const parseResponseStarted = performance.now();
      let parsed: unknown = text;
      try {
        parsed = text ? JSON.parse(text) : null;
      } catch {
        parsed = text;
      }
      phases.push(`解析响应体: ${formatDuration(performance.now() - parseResponseStarted)}`);
      const images = extractPreviewImages(parsed);
      setPreviewImages(images);
      if (images.length > 0) {
        setResultTab("preview");
      }
      setResponseBody(typeof parsed === "string" ? parsed : formatJson(summarizeJson(parsed)));
      setTimingBody([`${meta.method} ${meta.path}`, `HTTP 状态: ${response.status} ${response.statusText}`, ...phases].join("\n"));
      props.setStatus(`${response.ok ? "成功" : "失败"}: HTTP ${response.status} ${meta.method} ${meta.path}`);
      props.setRequestLogs((items) => [
        {
          id: crypto.randomUUID(),
          time: Date.now(),
          method: meta.method,
          endpoint: meta.path,
          account: profileLabel(props.config?.profile, props.showEmails),
          model:
            typeof payload === "object" && payload && "model" in payload
              ? String((payload as { model?: unknown }).model || props.config?.settings.defaultModel || "-")
              : props.config?.settings.defaultModel || "-",
          statusCode: response.status,
          durationMs: performance.now() - startedAt,
          source: "管理台",
        },
        ...items,
      ].slice(0, 20));
      if (props.config?.profile) {
        props.refreshConfig({ silent: true }).catch(() => undefined);
      }
    } catch (error) {
      const message = errorMessage(error);
      setResponseBody(message);
      setTimingBody([`${meta.method} ${meta.path}（失败）`, ...phases, `错误: ${message}`].join("\n"));
      props.setStatus("请求失败。");
    } finally {
      props.setBusy(null);
    }
  }

  async function uploadEditImage(file: File, mode: EditImageUploadMode) {
    if (!file.type.startsWith("image/")) {
      props.setStatus("请选择图片文件。");
      return;
    }
    try {
      if (mode === "image-bed") {
        props.setBusy("image-bed-upload");
        const dataUrl = await readFileAsDataUrl(file);
        const uploaded = await fetchJson<GithubImageBedUploadResult>("/_gateway/image-bed/upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            filename: file.name,
            dataUrl,
          }),
        });
        setRequestBody(insertEditImageIntoBody(requestBody, uploaded.url, props.config?.settings.defaultModel || "gpt-image-2"));
        props.setStatus(`已上传到图床并写入公网链接（${file.name}，${formatFileSize(file.size)}）。`);
        return;
      }

      const dataUrl = await readFileAsDataUrl(file);
      setRequestBody(insertEditImageIntoBody(requestBody, dataUrl, props.config?.settings.defaultModel || "gpt-image-2"));
      props.setStatus(`已将 ${file.name} 转成 base64 data URL，并写入请求体 images[0].image_url（${formatFileSize(file.size)}）。`);
    } catch (error) {
      props.setStatus(`图片写入失败: ${errorMessage(error)}`);
    } finally {
      if (mode === "image-bed") {
        props.setBusy(null);
      }
    }
  }

  return (
    <TesterPanel
      config={props.config}
      endpoints={endpoints}
      activeEndpoint={activeEndpoint}
      endpoint={endpoint}
      requestBody={requestBody}
      responseBody={responseBody}
      timingBody={timingBody}
      resultTab={resultTab}
      status={props.status}
      busy={props.busy}
      previewImages={previewImages}
      capability={props.capability}
      imageUploadMode={imageUploadMode}
      onEndpoint={changeEndpoint}
      onRequestBody={setRequestBody}
      onResultTab={setResultTab}
      onRun={runTest}
      onResetExample={resetExample}
      onCopyRequest={copyRequest}
      onCopyResponse={copyResponse}
      onCopyTiming={copyTiming}
      onImageUploadMode={setImageUploadMode}
      onPreview={props.setPreviewImage}
      onImageUpload={uploadEditImage}
    />
  );
}
