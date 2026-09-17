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
import { useT } from "@/i18n";

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
  const t = useT();
  const [endpoint, setEndpoint] = useState("/v1/models");
  const [requestBody, setRequestBody] = useState("");
  const [responseBody, setResponseBody] = useState(() => t("tester.waiting"));
  const [timingBody, setTimingBody] = useState(() => t("tester.waiting"));
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
    setRequestBody(buildExample(nextEndpoint, props.config.settings.defaultModel, t));
  }, [props.config, t]);

  function changeEndpoint(nextEndpoint: string) {
    setEndpoint(nextEndpoint);
    setRequestBody(buildExample(nextEndpoint, props.config?.settings.defaultModel || "gpt-5.4", t));
    setPreviewImages([]);
  }

  function resetExample() {
    changeEndpoint(endpoint);
  }

  function copyRequest() {
    copyText(requestBody || buildExample(endpoint, props.config?.settings.defaultModel || "gpt-5.4", t))
      .then((ok) => props.setStatus(ok ? t("tester.copyRequestDone") : t("tester.copyRequestFailed")))
      .catch(() => props.setStatus(t("tester.copyRequestFailed")));
  }

  function copyResponse() {
    copyText(responseBody)
      .then((ok) => props.setStatus(ok ? t("tester.copyResponseDone") : t("tester.copyResponseFailed")))
      .catch(() => props.setStatus(t("tester.copyResponseFailed")));
  }

  function copyTiming() {
    copyText(timingBody)
      .then((ok) => props.setStatus(ok ? t("tester.copyTimingDone") : t("tester.copyTimingFailed")))
      .catch(() => props.setStatus(t("tester.copyTimingFailed")));
  }

  async function runTest() {
    const meta = activeEndpoint;
    const startedAt = performance.now();
    const phases: string[] = [];
    props.setBusy("test");
    setResultTab("response");
    setResponseBody(t("tester.sending"));
    setTimingBody(t("tester.sending"));
    setPreviewImages([]);
    try {
      let payload: unknown = null;
      const options: RequestInit = { method: meta.method, headers: {} };
      if (meta.method !== "GET") {
        const parseStarted = performance.now();
        payload = requestBody.trim() ? JSON.parse(requestBody) : {};
        phases.push(t("tester.phaseParseRequest", { duration: formatDuration(performance.now() - parseStarted) }));
        (options.headers as Record<string, string>)["Content-Type"] = "application/json";
        options.body = formatJson(payload);
      }
      const fetchStarted = performance.now();
      const response = await fetch(meta.path, options);
      phases.push(t("tester.phaseWaitHeaders", { duration: formatDuration(performance.now() - fetchStarted) }));
      const readStarted = performance.now();
      const text = await response.text();
      phases.push(t("tester.phaseReadResponse", { duration: formatDuration(performance.now() - readStarted) }));
      const parseResponseStarted = performance.now();
      let parsed: unknown = text;
      try {
        parsed = text ? JSON.parse(text) : null;
      } catch {
        parsed = text;
      }
      phases.push(t("tester.phaseParseResponse", { duration: formatDuration(performance.now() - parseResponseStarted) }));
      const images = extractPreviewImages(parsed);
      setPreviewImages(images);
      if (images.length > 0) {
        setResultTab("preview");
      }
      setResponseBody(typeof parsed === "string" ? parsed : formatJson(summarizeJson(parsed)));
      setTimingBody([`${meta.method} ${meta.path}`, t("tester.httpStatus", { status: response.status, statusText: response.statusText }), ...phases].join("\n"));
      props.setStatus(t("tester.requestResult", { result: response.ok ? t("tester.success") : t("tester.failure"), status: response.status, method: meta.method, path: meta.path }));
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
          source: t("tester.source"),
        },
        ...items,
      ].slice(0, 20));
      if (props.config?.profile) {
        props.refreshConfig({ silent: true }).catch(() => undefined);
      }
    } catch (error) {
      const message = errorMessage(error);
      setResponseBody(message);
      setTimingBody([`${meta.method} ${meta.path} (${t("tester.failedSuffix")})`, ...phases, t("tester.errorLine", { error: message })].join("\n"));
      props.setStatus(t("tester.requestFailed"));
    } finally {
      props.setBusy(null);
    }
  }

  async function uploadEditImage(file: File, mode: EditImageUploadMode) {
    if (!file.type.startsWith("image/")) {
      props.setStatus(t("tester.selectImage"));
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
        props.setStatus(t("tester.imageBedInserted", { name: file.name, size: formatFileSize(file.size) }));
        return;
      }

      const dataUrl = await readFileAsDataUrl(file);
      setRequestBody(insertEditImageIntoBody(requestBody, dataUrl, props.config?.settings.defaultModel || "gpt-image-2"));
      props.setStatus(t("tester.base64Inserted", { name: file.name, size: formatFileSize(file.size) }));
    } catch (error) {
      props.setStatus(t("tester.imageInsertFailed", { error: errorMessage(error) }));
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
