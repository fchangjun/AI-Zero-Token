import type { ProviderModel } from "./types";
import type { MixedProtocolChoice } from "../../../../src/core/models/mixed-provider";
import { mixedCompatibilityEvidence, resolveDirectCompatibility } from "../../../../src/core/models/model-compatibility";
type CompatibilityStatus = "compatible" | "incompatible" | "unknown" | "untested";

export function mixedInspection(model: ProviderModel, protocol: MixedProtocolChoice = "auto") {
  return protocol === "auto" || model.compatibility?.protocol === protocol ? model.compatibility : undefined;
}

/** Native forwarding shares the direct compatibility evidence, not its last connection error. */
export function sharesResponsesInspection(model: ProviderModel, protocol: MixedProtocolChoice = "auto"): boolean {
  if (protocol !== "auto") return protocol === "responses";
  const result = model.compatibility;
  if (result?.protocol || result?.source === "responses") return result.protocol === "responses" || result.source === "responses";
  return resolveDirectCompatibility(model)?.status === "compatible" || model.capabilities?.responsesStreaming === true;
}

/** Only converted interfaces need a separate validation; recognition alone never passes. */
export function takeoverAvailability(model: ProviderModel, protocol: MixedProtocolChoice = "auto") {
  const direct = resolveDirectCompatibility(model);
  const result = mixedInspection(model, protocol);
  const shared = sharesResponsesInspection(model, protocol);
  const mixed = shared ? direct : mixedCompatibilityEvidence(result) ?? result?.assessment;
  const directChecked = Boolean(model.inspection.checkedAt || model.lastInspectedAt || !["unknown", "pending", "skipped"].includes(model.inspection.status));
  const directStatus: CompatibilityStatus = direct?.status ?? (directChecked ? "unknown" : "untested");
  const mixedStatus: CompatibilityStatus = shared ? directStatus : mixed?.status ?? (result ? "unknown" : "untested");
  const directReady = directStatus === "compatible";
  const mixedReady = mixedStatus === "compatible";
  const checked = directChecked || Boolean(result);
  const mode = directReady && mixedReady ? "both" : directReady ? "direct" : mixedReady ? "mixed" : "unknown";
  return { mode, directReady, mixedReady, directStatus, mixedStatus, direct, mixed, checked };
}

export type TakeoverFilter = "all" | "direct" | "mixed" | "both" | "unconfirmed" | "checked" | "unchecked";

export function matchesTakeoverFilter(model: ProviderModel, filter: TakeoverFilter, protocol: MixedProtocolChoice = "auto"): boolean {
  const result = takeoverAvailability(model, protocol);
  switch (filter) {
    case "direct": return result.directReady;
    case "mixed": return result.mixedReady;
    case "both": return result.directReady && result.mixedReady;
    case "unconfirmed": return !result.directReady && !result.mixedReady;
    case "checked": return result.checked;
    case "unchecked": return !result.checked;
    default: return true;
  }
}
