import type { MixedProtocol } from "./mixed-provider.js";

export const MIXED_PROTOCOL_LABELS: Record<MixedProtocol, string> = {
  responses: "Responses", chat_completions: "OpenAI Chat", anthropic: "Claude Messages",
};

/** A conclusive capability result, independent of the latest connection attempt. */
export type CompatibilityAssessment = {
  status: "compatible" | "incompatible";
  checkedAt?: number;
  message?: string;
};

type CoreCapabilities = { responsesStreaming?: boolean; functionCalling?: boolean; functionCallOutput?: boolean };
type DirectInspection = {
  status: string; checkedAt?: number | string; message?: string;
  latestCapabilities?: CoreCapabilities;
  compatibility?: CompatibilityAssessment;
  lastSuccessfulAt?: number;
  history?: Array<{ status: string; checkedAt?: number | string; message?: string; capabilities?: CoreCapabilities }>;
};

export function hasCoreCapabilities(capabilities?: CoreCapabilities): boolean {
  return capabilities?.responsesStreaming === true && capabilities.functionCalling === true && capabilities.functionCallOutput === true;
}

function timestamp(value?: number | string): number | undefined {
  const result = typeof value === "string" ? new Date(value).getTime() : value;
  return result !== undefined && Number.isFinite(result) ? result : undefined;
}

export function directCompatibilityEvidence(inspection: Pick<DirectInspection, "status" | "checkedAt" | "message">,
  capabilities?: CoreCapabilities): CompatibilityAssessment | undefined {
  // Optional reasoning/image probes may fail after all required capabilities passed.
  const status = inspection.status === "ready" || hasCoreCapabilities(capabilities) ? "compatible"
    : inspection.status === "incompatible" ? "incompatible" : undefined;
  return status ? { status, checkedAt: timestamp(inspection.checkedAt),
    message: status === "compatible" ? "Responses 对话、工具调用和结果回传已确认兼容。" : inspection.message } : undefined;
}

export function resolveDirectCompatibility(model: {
  inspection: DirectInspection; capabilities?: CoreCapabilities; lastConfirmedAt?: number;
}): CompatibilityAssessment | undefined {
  const inspection = model.inspection;
  const latest = directCompatibilityEvidence(inspection, inspection.latestCapabilities);
  if (latest) return latest;
  if (inspection.compatibility) return inspection.compatibility;
  // Read legacy records without rewriting users' saved settings.
  for (const entry of [...(inspection.history ?? [])].sort((a, b) => (timestamp(b.checkedAt) ?? 0) - (timestamp(a.checkedAt) ?? 0))) {
    const result = directCompatibilityEvidence(entry, entry.capabilities);
    if (result) return result;
  }
  if (hasCoreCapabilities(model.capabilities)) return { status: "compatible",
    checkedAt: model.lastConfirmedAt ?? inspection.lastSuccessfulAt, message: "沿用此前已确认的兼容结果。" };
  return undefined;
}

export type MixedCompatibilityValidation = {
  checkedAt: number;
  conversation: boolean;
  toolCalling: boolean;
  toolResult: boolean;
  message: string;
  /** Legacy partial results are inconclusive; false alone is not proof of incompatibility. */
  outcome?: "compatible" | "incompatible" | "inconclusive";
  connectionStatus?: "blocked" | "unavailable" | "unknown";
};

/** Shared by model details and takeover. Identification alone does not verify tool support. */
export type ModelCompatibility = {
  status: "identified" | "failed";
  protocol?: MixedProtocol;
  /** Native forwarding shares model.inspection; validation is only for converted interfaces. */
  source?: "responses";
  checkedAt: number;
  message: string;
  validation?: MixedCompatibilityValidation;
  assessment?: CompatibilityAssessment;
  /** This attempt could not assess capability (network, credentials, limits, etc.). */
  inconclusive?: boolean;
};

export function mixedCompatibilityEvidence(result?: ModelCompatibility): CompatibilityAssessment | undefined {
  const validation = result?.validation;
  if (!validation || result?.source === "responses") return undefined;
  if (validation.conversation && validation.toolCalling && validation.toolResult) return {
    status: "compatible", checkedAt: validation.checkedAt, message: validation.message,
  };
  if (validation.outcome === "incompatible") return { status: "incompatible", checkedAt: validation.checkedAt, message: validation.message };
  return undefined;
}
