export const MIXED_PROTOCOLS = ["responses", "chat_completions", "anthropic"] as const;
export type MixedProtocol = typeof MIXED_PROTOCOLS[number];
export const MIXED_PROTOCOL_CHOICES = ["auto", ...MIXED_PROTOCOLS] as const;
export type MixedProtocolChoice = typeof MIXED_PROTOCOL_CHOICES[number];
export type MixedModelSelection = { providerId: string; modelId: string; protocol: MixedProtocol; autoDetected?: boolean };
export type MixedActivationInput = {
  routes: MixedModelSelection[];
  defaultModel: { providerId: string; modelId: string };
};
export type MixedActivationRequest = Omit<MixedActivationInput, "routes"> & {
  routes: Array<Omit<MixedModelSelection, "protocol"> & { protocol: MixedProtocolChoice }>;
};
export type PublicMixedRoute = MixedModelSelection & {
  id: string;
  displayName: string;
  contextWindow: number;
};
export type PublicMixedConfig = {
  active: boolean;
  port: number;
  routes: PublicMixedRoute[];
  defaultModelId: string;
  needsApply?: boolean;
  gatewayReady?: boolean;
  gatewayError?: string;
};
export const CROSS_VENDOR_NOTICE = "在同一对话中切换不同厂商的模型（如 ChatGPT → DeepSeek）时，由于历史上下文的压缩方式可能不兼容，可能影响对话连贯性和回答效果。若出现异常，建议新建对话。同一厂商内切换模型通常无需因此新建对话。";
export const MIXED_RUNTIME_NOTICE = "使用期间请保持 AZT 运行。转发和协议转换可能增加响应延迟；退出或重启 AZT 可能中断请求。部分功能取决于模型和服务的接口兼容性。";
