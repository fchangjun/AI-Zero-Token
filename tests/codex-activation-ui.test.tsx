import { expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CodexActivation } from "../admin-ui/src/pages/providers/components/CodexActivation";
import type { ApiProvider, ProviderInspectionStatus, ProviderModel } from "../admin-ui/src/pages/providers/types";

function model(id: string, status: ProviderInspectionStatus, window?: Partial<ProviderModel>): ProviderModel {
  return { id, selectedForCodex: false, inspection: { status }, ...window };
}

test("Codex model list sorts by availability while keeping peer order and labels configured context windows", () => {
  const provider: ApiProvider = {
    id: "test", name: "测试服务", baseUrl: "https://example.test/v1", connectionStatus: "connected",
    modelSource: "auto", activeForCodex: false, tokenConfigured: true, modelCount: 6,
    models: [
      model("unavailable", "unavailable"),
      model("unknown-first", "unknown", { effectiveContextWindow: 128_000, contextWindowSource: "api" }),
      model("ready-first", "ready", { effectiveContextWindow: 1_050_000, contextWindowSource: "manual" }),
      model("skipped", "skipped"),
      model("ready-second", "ready"),
      model("unknown-second", "unknown"),
    ],
  };
  const html = renderToStaticMarkup(createElement(CodexActivation, {
    provider, activeProvider: null, saving: false, disconnecting: false,
    onBack: () => {}, onActivate: () => {}, onDeactivate: () => {},
  }));
  const rows = [...html.matchAll(/<strong>(ready-first|ready-second|unknown-first|unknown-second|unavailable|skipped)<\/strong>/g)]
    .map((match) => match[1]);
  expect(rows).toEqual(["ready-first", "ready-second", "unknown-first", "unknown-second", "unavailable", "skipped"]);
  expect(html).toContain("上下文 1.05M");
  expect(html).toContain("上下文 128K");
  expect(html).toContain("上下文 272K");
  expect(html).toContain("配置的上下文窗口：1,050,000 tokens · 手动设置");
});
