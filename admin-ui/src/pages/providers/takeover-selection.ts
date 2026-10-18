import type { MixedActivationInput, MixedActivationRequest, MixedProtocolChoice, PublicMixedConfig } from "../../../../src/core/models/mixed-provider";
import type { ApiProvider } from "./types";

export type TakeoverSelection = {
  modelIds: string[];
  defaultModelId: string;
  protocols: Record<string, MixedProtocolChoice>;
};

export function initialTakeoverSelection(provider: ApiProvider, mixed?: PublicMixedConfig): TakeoverSelection {
  const routes = mixed?.routes.filter((route) => route.providerId === provider.id) ?? [];
  const directIds = provider.models.filter((model) => model.selectedForCodex).map((model) => model.id);
  const useMixed = !provider.activeForCodex && routes.length > 0 && (mixed?.active || !directIds.length);
  const savedIds = useMixed ? routes.map((route) => route.modelId) : directIds;
  const modelIds = savedIds.filter((id) => provider.models.some((model) => model.id === id));
  if (!modelIds.length && !savedIds.length && provider.models.length === 1) modelIds.push(provider.models[0].id);
  const savedDefault = useMixed ? routes.find((route) => route.id === mixed?.defaultModelId)?.modelId : provider.defaultModelId;
  return {
    modelIds,
    defaultModelId: savedDefault && modelIds.includes(savedDefault) ? savedDefault : modelIds[0] ?? "",
    protocols: Object.fromEntries(provider.models.map((model) => {
      const saved = routes.find((route) => route.modelId === model.id);
      return [model.id, saved?.autoDetected ? "auto" : saved?.protocol ?? "auto"];
    })),
  };
}

// Editing one channel replaces only its routes. Inactive saved routes must not be
// silently re-enabled when the user starts a new mixed configuration.
export function mixedActivationForProvider(providerId: string, selection: TakeoverSelection, mixed?: PublicMixedConfig): MixedActivationRequest {
  return {
    routes: [
      ...(mixed?.active ? mixed.routes.filter((route) => route.providerId !== providerId).map(({ providerId, modelId, protocol, autoDetected }) => ({ providerId, modelId, protocol, ...(autoDetected ? { autoDetected } : {}) })) : []),
      ...selection.modelIds.map((modelId) => ({ providerId, modelId, protocol: selection.protocols[modelId] ?? "auto" })),
    ],
    defaultModel: { providerId, modelId: selection.defaultModelId },
  };
}

export function mixedActivationWithoutProvider(providerId: string, mixed: PublicMixedConfig): MixedActivationInput | undefined {
  const remaining = mixed.routes.filter((route) => route.providerId !== providerId);
  const defaultRoute = remaining.find((route) => route.id === mixed.defaultModelId) ?? remaining[0];
  if (!defaultRoute) return undefined;
  return {
    routes: remaining.map(({ providerId, modelId, protocol, autoDetected }) => ({ providerId, modelId, protocol, ...(autoDetected ? { autoDetected } : {}) })),
    defaultModel: { providerId: defaultRoute.providerId, modelId: defaultRoute.modelId },
  };
}
