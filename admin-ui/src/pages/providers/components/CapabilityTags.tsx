import { Clock3 } from "lucide-react";
import type { ProviderModel, ProviderModelCapabilities } from "../types";

type TagTone = "success" | "danger" | "neutral" | "previous";

function capabilityTag(label: string, tone: TagTone, title?: string) {
  return (
    <span className={`provider-capability-tag is-${tone}`} key={`${label}-${tone}`} title={title}>
      {label}
    </span>
  );
}

function capabilitiesFor(model: ProviderModel): ProviderModelCapabilities | undefined {
  return model.capabilities ?? model.inspection.capabilities;
}

function hasKnownCapability(capabilities: ProviderModelCapabilities | undefined): boolean {
  if (!capabilities) return false;
  return [
    capabilities.responsesStreaming,
    capabilities.functionCalling,
    capabilities.functionCallOutput,
    capabilities.imageInput,
  ].some((value) => typeof value === "boolean") || Boolean(capabilities.reasoningEfforts?.length) || Boolean(capabilities.inputModalities?.length);
}

function latencyLabel(model: ProviderModel): string | null {
  const latencyMs = model.latencyMs ?? model.inspection.latencyMs;
  if (latencyMs === undefined) return null;
  if (latencyMs < 1_000) return `${Math.round(latencyMs)} ms`;
  return `${(latencyMs / 1_000).toFixed(latencyMs >= 10_000 ? 0 : 1)} s`;
}

export function CapabilityTags({ model, compact = false }: { model: ProviderModel; compact?: boolean }) {
  const status = model.inspection.status;
  const capabilities = capabilitiesFor(model);
  const previous = model.inspection.capabilitiesSource === "last_successful";
  const tone = previous ? "previous" : "success";
  const tags = [];

  if (!hasKnownCapability(capabilities)) {
    tags.push(capabilityTag(status === "unknown" || status === "pending" ? "能力尚未检测" : "本次未确认能力", "neutral"));
  } else {
    if (status === "ready") {
      tags.push(capabilityTag("可用于 Codex", "success"));
    } else if (previous) {
      tags.push(capabilityTag("上次确认：可用于 Codex", "previous"));
    }

    if (typeof capabilities?.responsesStreaming === "boolean") {
      tags.push(capabilityTag(capabilities.responsesStreaming ? "Responses ✓" : "Responses ×", capabilities.responsesStreaming ? tone : "danger"));
    }
    if (typeof capabilities?.functionCalling === "boolean") {
      tags.push(capabilityTag(capabilities.functionCalling ? "工具调用 ✓" : "工具调用 ×", capabilities.functionCalling ? tone : "danger"));
    }
    if (typeof capabilities?.functionCallOutput === "boolean") {
      tags.push(capabilityTag(capabilities.functionCallOutput ? "工具结果 ✓" : "工具结果 ×", capabilities.functionCallOutput ? tone : "danger"));
    }
    if (capabilities?.reasoningEfforts?.length) {
      const efforts = capabilities.reasoningEfforts;
      tags.push(capabilityTag(`推理 ${efforts.length} 档 ✓`, tone, efforts.join(", ")));
    }
    if (typeof capabilities?.imageInput === "boolean") {
      tags.push(capabilityTag(capabilities.imageInput ? "图片输入 ✓" : "图片输入 ×", capabilities.imageInput ? tone : "danger"));
    } else if (capabilities?.inputModalities?.includes("image")) {
      tags.push(capabilityTag("图片输入 ✓", tone));
    } else if (!compact && capabilities) {
      tags.push(capabilityTag("图片输入未确认", "neutral"));
    }
  }

  const latency = latencyLabel(model);
  return (
    <div className="provider-capability-list">
      {tags}
      {latency && (
        <span className="provider-capability-latency">
          <Clock3 size={12} />
          {latency}
        </span>
      )}
    </div>
  );
}
