import type { AdminConfig, RequestLog } from "@/shared/types";
import { endpointOrder } from "./endpoints";
import { profileLabel, primaryUsage } from "./profiles";

export function buildSeedRequests(config: AdminConfig, showEmails: boolean): RequestLog[] {
  const profiles = Array.isArray(config.profiles) ? config.profiles : [];
  const now = Date.now();
  return profiles.slice(0, 5).map((profile, index) => {
    const endpoint = endpointOrder[index % endpointOrder.length];
    const meta = config.supportedEndpoints.find((item) => item.path === endpoint) || {
      method: endpoint === "/v1/models" ? "GET" : "POST",
      path: endpoint,
    };
    return {
      id: `seed-${profile.profileId}-${index}`,
      time: now - index * 15 * 60 * 1000,
      method: meta.method,
      endpoint,
      account: profileLabel(profile, showEmails),
      model: endpoint.startsWith("/v1/images/") ? "gpt-image-2" : config.settings.defaultModel,
      statusCode: 200,
      durationMs: 860 + index * 230 + primaryUsage(profile) * 8,
      source: index % 2 === 0 ? "管理页" : "CLI",
    };
  });
}
